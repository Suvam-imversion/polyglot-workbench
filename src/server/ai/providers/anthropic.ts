import type { AiProvider, ChatMessage, ProviderEvent, ProviderRequest } from "@/contracts/ai";
import { normalizeHttpError, normalizeStreamError, providerFetch } from "@/server/ai/errors";
import { parseSse } from "@/server/ai/sse";

type AnthropicBlock = Record<string, unknown>;

function toMessages(messages: ChatMessage[]) {
  const converted: Array<{ role: "user" | "assistant"; content: string | AnthropicBlock[] }> = [];
  for (const message of messages.filter((item) => item.role !== "system")) {
    if (message.role === "tool") {
      converted.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: message.toolCallId, content: message.content }],
      });
    } else if (message.role === "assistant" && message.toolCalls?.length) {
      converted.push({
        role: "assistant",
        content: [
          ...(message.content ? [{ type: "text", text: message.content }] : []),
          ...message.toolCalls.map((call) => ({
            type: "tool_use",
            id: call.id,
            name: call.name,
            input: JSON.parse(call.arguments || "{}"),
          })),
        ],
      });
    } else {
      converted.push({ role: message.role as "user" | "assistant", content: message.content });
    }
  }
  return converted;
}

export class AnthropicProvider implements AiProvider {
  readonly id = "anthropic" as const;

  async *stream(request: ProviderRequest, signal: AbortSignal): AsyncGenerator<ProviderEvent> {
    const system = request.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
    const response = await providerFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        system: system || undefined,
        messages: toMessages(request.messages),
        tools: request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
          eager_input_streaming: true,
        })),
        max_tokens: request.maxOutputTokens ?? 4096,
        stream: true,
      }),
    });
    if (!response.ok) throw normalizeHttpError(response.status, await response.text());

    let finishReason = "end_turn";
    const blocks = new Map<number, { id: string; name: string }>();
    for await (const frame of parseSse(response)) {
      const event = JSON.parse(frame.data);
      if (event.type === "error") throw normalizeStreamError(event.error?.type ?? "server_error", event.error?.message);
      if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
        blocks.set(event.index, { id: event.content_block.id, name: event.content_block.name });
        yield { type: "tool_call_delta", id: event.content_block.id, name: event.content_block.name, arguments: "" };
      }
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        yield { type: "text_delta", text: event.delta.text };
      }
      if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta") {
        const block = blocks.get(event.index);
        if (block) yield { type: "tool_call_delta", id: block.id, name: block.name, arguments: event.delta.partial_json };
      }
      if (event.type === "message_delta") {
        finishReason = event.delta?.stop_reason ?? finishReason;
        if (event.usage) {
          yield { type: "usage", usage: { inputTokens: 0, outputTokens: event.usage.output_tokens ?? 0 } };
        }
      }
      if (event.type === "message_start" && event.message?.usage) {
        yield {
          type: "usage",
          usage: {
            inputTokens: event.message.usage.input_tokens ?? 0,
            outputTokens: event.message.usage.output_tokens ?? 0,
            cachedTokens: event.message.usage.cache_read_input_tokens ?? 0,
          },
        };
      }
    }
    yield { type: "done", finishReason };
  }
}
