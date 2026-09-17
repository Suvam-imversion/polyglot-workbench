export type ProviderId = string;

export type ErrorKind =
  | "auth"
  | "rate_limit"
  | "context_length"
  | "content_filter"
  | "timeout"
  | "server_error"
  | "bad_request";

export type ToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  toolName?: string;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  reasoningTokens?: number;
};

export type ProviderRequest = {
  model: string;
  messages: ChatMessage[];
  tools: ToolDefinition[];
  maxOutputTokens?: number;
};

export type ProviderEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call_delta"; id: string; name?: string; arguments: string }
  | { type: "usage"; usage: Usage }
  | { type: "done"; finishReason: string };

export interface AiProvider {
  readonly id: ProviderId;
  stream(request: ProviderRequest, signal: AbortSignal): AsyncGenerator<ProviderEvent>;
}

export type ModelConfig = {
  id: string;
  provider: ProviderId;
  label: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsJsonSchema: boolean;
  supportsStreaming: boolean;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cachedInputUsdPerMillion?: number;
};
