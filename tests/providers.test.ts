import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiProvider, ProviderRequest } from "@/contracts/ai";
import { AnthropicProvider } from "@/server/ai/providers/anthropic";
import { GeminiProvider } from "@/server/ai/providers/gemini";
import { GroqProvider } from "@/server/ai/providers/groq";
import { OpenAiProvider } from "@/server/ai/providers/openai";

const request: ProviderRequest = {
  model: "test-model",
  messages: [
    { role: "system", content: "Be concise." },
    { role: "user", content: "Calculate 2 + 2" },
  ],
  tools: [{
    name: "calculator",
    description: "Calculate arithmetic",
    inputSchema: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] },
  }],
};

function sse(frames: Array<{ event?: string; data: unknown }>) {
  const body = frames.map((frame) => `${frame.event ? `event: ${frame.event}\n` : ""}data: ${typeof frame.data === "string" ? frame.data : JSON.stringify(frame.data)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

async function collect(provider: Pick<AiProvider, "stream">) {
  const events = [];
  for await (const event of provider.stream(request, new AbortController().signal)) events.push(event);
  return events;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("provider adapters", () => {
  it("maps OpenAI messages and accumulatable streamed tool fragments", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sse([
      { data: { choices: [{ delta: { content: "Four" } }] } },
      { data: { choices: [{ delta: { tool_calls: [{ index: 0, id: "call-1", function: { name: "calculator", arguments: "{\"expression\":" } }] } }] } },
      { data: { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "\"2+2\"}" } }] }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 20, completion_tokens: 8 } } },
      { data: "[DONE]" },
    ]));
    vi.stubGlobal("fetch", fetchMock);

    const events = await collect(new OpenAiProvider());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0]).toEqual({ role: "system", content: "Be concise." });
    expect(body.tools[0].function.name).toBe("calculator");
    expect(events.filter((event) => event.type === "tool_call_delta").map((event) => event.id)).toEqual(["call-1", "call-1"]);
    expect(events).toContainEqual({ type: "text_delta", text: "Four" });
  });

  it("uses Groq's OpenAI-compatible endpoint and isolated API key", async () => {
    vi.stubEnv("GROQ_API_KEY", "groq-fixture-key");
    const fetchMock = vi.fn().mockResolvedValue(sse([
      { data: { choices: [{ delta: { content: "Fast response" }, finish_reason: "stop" }], usage: { prompt_tokens: 8, completion_tokens: 2 } } },
      { data: "[DONE]" },
    ]));
    vi.stubGlobal("fetch", fetchMock);

    const events = await collect(new GroqProvider());
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer groq-fixture-key");
    expect(events).toContainEqual({ type: "text_delta", text: "Fast response" });
    expect(events).toContainEqual({ type: "done", finishReason: "stop" });
  });

  it("keeps Anthropic system instructions top-level and parses input_json_delta", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sse([
      { event: "message_start", data: { type: "message_start", message: { usage: { input_tokens: 12, output_tokens: 0 } } } },
      { event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tool-1", name: "calculator" } } },
      { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{\"expression\":\"2+2\"}" } } },
      { event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 9 } } },
    ]));
    vi.stubGlobal("fetch", fetchMock);

    const events = await collect(new AnthropicProvider());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.system).toBe("Be concise.");
    expect(body.messages[0].role).toBe("user");
    expect(body.tools[0].input_schema.type).toBe("object");
    expect(events).toContainEqual({ type: "tool_call_delta", id: "tool-1", name: "calculator", arguments: "{\"expression\":\"2+2\"}" });
  });

  it("translates Gemini roles, systemInstruction, and function calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sse([
      { data: {
        candidates: [{ content: { parts: [{ text: "Using a tool." }, { functionCall: { id: "gem-1", name: "calculator", args: { expression: "2+2" } } }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 6, thoughtsTokenCount: 2 },
      } },
    ]));
    vi.stubGlobal("fetch", fetchMock);

    const events = await collect(new GeminiProvider());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.systemInstruction.parts[0].text).toBe("Be concise.");
    expect(body.contents[0]).toEqual({ role: "user", parts: [{ text: "Calculate 2 + 2" }] });
    expect(body.tools[0].functionDeclarations[0].name).toBe("calculator");
    expect(events).toContainEqual({ type: "tool_call_delta", id: "gem-1", name: "calculator", arguments: "{\"expression\":\"2+2\"}" });
  });
});
