import type { AiProvider, ChatMessage, ProviderEvent, ProviderRequest } from "@/contracts/ai";
import { normalizeHttpError, normalizeStreamError, providerFetch } from "@/server/ai/errors";
import { parseSse } from "@/server/ai/sse";

function toGeminiSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toGeminiSchema);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "additionalProperties").map(([key, item]) => [key, toGeminiSchema(item)]),
  );
}

function toolResponse(content: string) {
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed && typeof parsed === "object" ? parsed : { result: parsed };
  } catch {
    return { result: content };
  }
}

function toContents(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => {
      if (message.role === "tool") {
        return {
          role: "user",
          parts: [{
            functionResponse: {
              id: message.toolCallId,
              name: message.toolName,
              response: toolResponse(message.content),
            },
          }],
        };
      }
      if (message.role === "assistant" && message.toolCalls?.length) {
        return {
          role: "model",
          parts: [
            ...(message.content ? [{ text: message.content }] : []),
            ...message.toolCalls.map((call) => ({
              functionCall: {
                id: call.id,
                name: call.name,
                args: JSON.parse(call.arguments || "{}"),
              },
              ...(typeof call.providerMetadata?.thoughtSignature === "string"
                ? { thoughtSignature: call.providerMetadata.thoughtSignature }
                : {}),
            })),
          ],
        };
      }
      return { role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] };
    });
}

export class GeminiProvider implements AiProvider {
  readonly id = "gemini" as const;

  async *stream(request: ProviderRequest, signal: AbortSignal): AsyncGenerator<ProviderEvent> {
    const key = process.env.GEMINI_API_KEY ?? "";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:streamGenerateContent?alt=sse`;
    const system = request.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
    const response = await providerFetch(url, {
      method: "POST",
      signal,
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents: toContents(request.messages),
        tools: request.tools.length
          ? [{
              functionDeclarations: request.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                parameters: toGeminiSchema(tool.inputSchema),
              })),
            }]
          : undefined,
        generationConfig: { maxOutputTokens: request.maxOutputTokens },
      }),
    });
    if (!response.ok) throw normalizeHttpError(response.status, await response.text());

    let finishReason = "STOP";
    let toolIndex = 0;
    for await (const frame of parseSse(response)) {
      const chunk = JSON.parse(frame.data);
      if (chunk.error) throw normalizeStreamError(chunk.error.status ?? chunk.error.code ?? "server_error", chunk.error.message);
      if (chunk.promptFeedback?.blockReason) throw normalizeStreamError("content_filter", chunk.promptFeedback.blockReason);
      const candidate = chunk.candidates?.[0];
      if (candidate?.finishReason === "SAFETY" || candidate?.finishReason === "BLOCKLIST") {
        throw normalizeStreamError("content_filter", candidate.finishReason);
      }
      for (const part of candidate?.content?.parts ?? []) {
        if (part.text) yield { type: "text_delta", text: part.text };
        if (part.functionCall) {
          const id = part.functionCall.id ?? part.functionCall.call_id ?? `gemini-${toolIndex++}`;
          yield {
            type: "tool_call_delta",
            id,
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args ?? {}),
            providerMetadata: typeof part.thoughtSignature === "string"
              ? { thoughtSignature: part.thoughtSignature }
              : undefined,
          };
        }
      }
      if (candidate?.finishReason) finishReason = candidate.finishReason;
      if (chunk.usageMetadata) {
        yield {
          type: "usage",
          usage: {
            inputTokens: chunk.usageMetadata.promptTokenCount ?? 0,
            outputTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
            cachedTokens: chunk.usageMetadata.cachedContentTokenCount ?? 0,
            reasoningTokens: chunk.usageMetadata.thoughtsTokenCount ?? 0,
          },
        };
      }
    }
    yield { type: "done", finishReason };
  }
}
