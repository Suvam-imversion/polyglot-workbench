import type { AiProvider, ChatMessage, ProviderEvent, ProviderRequest } from "@/contracts/ai";
import { normalizeHttpError, normalizeStreamError, providerFetch } from "@/server/ai/errors";
import { parseSse } from "@/server/ai/sse";

function toMessage(message: ChatMessage) {
  if (message.role === "tool") {
    return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
  }
  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments },
      })),
    };
  }
  return { role: message.role, content: message.content };
}

export class OpenAiProvider implements AiProvider {
  readonly id = "openai" as const;

  async *stream(request: ProviderRequest, signal: AbortSignal): AsyncGenerator<ProviderEvent> {
    const response = await providerFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages.map(toMessage),
        tools: request.tools.length
          ? request.tools.map((tool) => ({
              type: "function",
              function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
            }))
          : undefined,
        stream: true,
        stream_options: { include_usage: true },
        max_completion_tokens: request.maxOutputTokens,
      }),
    });
    if (!response.ok) throw normalizeHttpError(response.status, await response.text());

    let finishReason = "stop";
    const callIds = new Map<number, string>();
    for await (const frame of parseSse(response)) {
      if (frame.data === "[DONE]") continue;
      const chunk = JSON.parse(frame.data);
      if (chunk.error) throw normalizeStreamError(chunk.error.code ?? chunk.error.type ?? "server_error", chunk.error.message);
      const choice = chunk.choices?.[0];
      const delta = choice?.delta;
      if (delta?.content) yield { type: "text_delta", text: delta.content };
      for (const call of delta?.tool_calls ?? []) {
        const id = call.id ?? callIds.get(call.index) ?? `openai-${call.index}`;
        callIds.set(call.index, id);
        yield {
          type: "tool_call_delta",
          id,
          name: call.function?.name,
          arguments: call.function?.arguments ?? "",
        };
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (chunk.usage) {
        yield {
          type: "usage",
          usage: {
            inputTokens: chunk.usage.prompt_tokens ?? 0,
            outputTokens: chunk.usage.completion_tokens ?? 0,
            cachedTokens: chunk.usage.prompt_tokens_details?.cached_tokens ?? 0,
            reasoningTokens: chunk.usage.completion_tokens_details?.reasoning_tokens ?? 0,
          },
        };
      }
    }
    yield { type: "done", finishReason };
  }
}
