# Provider Notes

## Reconciled differences

| Concern | Anthropic | Gemini | OpenAI | Internal form |
| --- | --- | --- | --- | --- |
| Endpoint | `POST /v1/messages` | `:streamGenerateContent?alt=sse` | `POST /v1/chat/completions` | `provider.stream()` |
| System instruction | Top-level `system` | `systemInstruction.parts` | `system` message | `ChatMessage.role=system` |
| Assistant role | `assistant` | `model` | `assistant` | `assistant` |
| Tool definition | `input_schema` | `functionDeclarations[].parameters` | `function.parameters` | `ToolDefinition.inputSchema` |
| Tool call | `tool_use` block | `functionCall` part | `tool_calls[].function` | `ToolCall` |
| Tool result | User `tool_result` block | User `functionResponse` part | `tool` message | `role=tool` |
| Argument streaming | `input_json_delta.partial_json` | Function-call part | `delta.tool_calls[].function.arguments` | `tool_call_delta` |
| Usage | Start/delta usage fields | `usageMetadata` | final streamed `usage` | `Usage` |
| Finish reason | `stop_reason` | `finishReason` | `finish_reason` | normalized string |

## Adapter-specific details

Anthropic removes system messages from the turn list, enables fine-grained tool input streaming, and reconstructs assistant tool blocks plus user tool-result blocks for follow-up rounds.

Gemini maps assistant turns to `model`, wraps content in `parts`, and includes call IDs/names in function responses. Thinking tokens map to normalized reasoning tokens.

OpenAI uses Chat Completions because the assignment permits it and its delta format makes the translation compact. Tool-call IDs are remembered by array index because later argument fragments may omit the ID.

All non-2xx responses map to one of: `auth`, `rate_limit`, `context_length`, `content_filter`, `timeout`, `server_error`, or `bad_request`. Raw bodies and keys are never returned to the UI.

## Current configuration

- Anthropic: `claude-sonnet-5`, 1M context, $2/$10 per million input/output tokens.
- Gemini: `gemini-3.8-flash`, 1,048,576 input limit, introductory $0.75/$3.75 pricing through 2026-12-31.
- OpenAI: `gpt-5.6-sol`, 1.05M context, promotional $4/$20 pricing as of 2026-09-17.

Model access and prices vary by account and time. Edit only `src/server/config/models.ts` when they change.

Official references:

- https://platform.claude.com/docs/en/build-with-claude/streaming
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
- https://platform.claude.com/docs/en/about-claude/pricing
- https://ai.google.dev/api/generate-content
- https://ai.google.dev/gemini-api/docs/generate-content/function-calling
- https://ai.google.dev/gemini-api/docs/pricing
- https://developers.openai.com/api/docs/models/gpt-5.6-sol

