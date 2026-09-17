import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiProvider, ProviderEvent } from "@/contracts/ai";

const { runMock, prepareMock, getProviderMock, searchDocumentsMock } = vi.hoisted(() => {
  const run = vi.fn();
  return {
    runMock: run,
    prepareMock: vi.fn(() => ({ run })),
    getProviderMock: vi.fn(),
    searchDocumentsMock: vi.fn(),
  };
});

vi.mock("@/server/db", () => ({
  db: { prepare: prepareMock },
}));

vi.mock("@/server/ai/providers", () => ({ getProvider: getProviderMock }));
vi.mock("@/server/rag", () => ({ searchDocuments: searchDocumentsMock }));

import { runChat, type AppEvent } from "@/server/ai/orchestrator";
import { ProviderError } from "@/server/ai/errors";

function fakeProvider(rounds: ProviderEvent[][]): AiProvider {
  let index = 0;
  return {
    id: "anthropic",
    async *stream() {
      for (const event of rounds[index++] ?? []) yield event;
    },
  };
}

async function collect(options: { collectionId?: string } = {}) {
  const events: AppEvent[] = [];
  for await (const event of runChat([{ role: "user", content: "Use two calculations" }], {
    conversationId: "00000000-0000-4000-8000-000000000000",
    provider: "anthropic",
    model: "claude-sonnet-5",
    topK: 4,
    threshold: 0.15,
    retrievalMode: "hybrid",
    signal: new AbortController().signal,
    ...options,
  })) events.push(event);
  return events;
}

describe("chat orchestration", () => {
  beforeEach(() => {
    runMock.mockReset();
    prepareMock.mockClear();
    getProviderMock.mockReset();
    searchDocumentsMock.mockReset();
  });

  it("executes two sequential streamed tool calls before the final answer", async () => {
    getProviderMock.mockResolvedValue(fakeProvider([
      [
        { type: "tool_call_delta", id: "one", name: "calculator", arguments: "{\"expression\":" },
        { type: "tool_call_delta", id: "one", arguments: "\"2+2\"}" },
        { type: "done", finishReason: "tool_use" },
      ],
      [
        { type: "tool_call_delta", id: "two", name: "calculator", arguments: "{\"expression\":\"4*3\"}" },
        { type: "done", finishReason: "tool_use" },
      ],
      [
        { type: "text_delta", text: "The final result is 12." },
        { type: "usage", usage: { inputTokens: 20, outputTokens: 6 } },
        { type: "done", finishReason: "end_turn" },
      ],
    ]));

    const events = await collect();
    const completed = events.filter((event) => event.type === "tool" && event.status === "complete");
    expect(completed).toHaveLength(2);
    expect(completed.map((event) => event.type === "tool" ? event.result : null)).toEqual([{ result: 4 }, { result: 12 }]);
    expect(events).toContainEqual({ type: "text", text: "The final result is 12." });
  });

  it("returns the required answer without calling a model when retrieval is empty", async () => {
    searchDocumentsMock.mockResolvedValue([]);
    const events = await collect({ collectionId: "10000000-0000-4000-8000-000000000000" });
    expect(events).toContainEqual({ type: "text", text: "I don't know." });
    expect(getProviderMock).not.toHaveBeenCalled();
  });

  it("appends exact chunk citations when the model omits them", async () => {
    searchDocumentsMock.mockResolvedValue([{ id: "chunk-1", documentName: "notes.md", content: "Grounded fact", score: 0.9, chunkIndex: 0 }]);
    getProviderMock.mockResolvedValue(fakeProvider([[
      { type: "text_delta", text: "Grounded fact." },
      { type: "done", finishReason: "end_turn" },
    ]]));
    const events = await collect({ collectionId: "10000000-0000-4000-8000-000000000000" });
    expect(events).toContainEqual({ type: "text", text: "\n\nSources: [chunk-1]" });
  });

  it("persists sanitized metrics for failed provider requests", async () => {
    getProviderMock.mockResolvedValue({
      id: "anthropic",
      async *stream() {
        throw new ProviderError("auth", "Provider authentication failed");
      },
    });

    const events = await collect();
    expect(events).toContainEqual({ type: "error", error: { kind: "auth", message: "Provider authentication failed" } });
    expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO requests"));
    expect(runMock.mock.calls.some((call) => call.includes("error:auth"))).toBe(true);
  });
});
