import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiProvider, ProviderEvent } from "@/contracts/ai";

const { runMock, getProviderMock, searchDocumentsMock } = vi.hoisted(() => ({
  runMock: vi.fn(),
  getProviderMock: vi.fn(),
  searchDocumentsMock: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: { prepare: vi.fn(() => ({ run: runMock })) },
}));

vi.mock("@/server/ai/providers", () => ({ getProvider: getProviderMock }));
vi.mock("@/server/rag", () => ({ searchDocuments: searchDocumentsMock }));

import { runChat, type AppEvent } from "@/server/ai/orchestrator";

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
    signal: new AbortController().signal,
    ...options,
  })) events.push(event);
  return events;
}

describe("chat orchestration", () => {
  beforeEach(() => {
    runMock.mockReset();
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
});
