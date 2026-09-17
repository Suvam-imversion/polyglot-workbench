# AI Usage

## Tools and scope

I used ChatGPT as a coding assistant for requirements breakdown, implementation drafts, provider-documentation research, test-case design, and documentation editing. I used terminal automation to run tests, linting, type checking, production builds, dependency audits, Docker builds, API smoke tests, and live Gemini and Groq verification.

AI assistance was used across the provider adapters, streaming orchestrator, tool loop, RAG pipeline, responsive interface, Docker setup, and Markdown documentation. I reviewed the resulting code against the assignment and kept the implementation deliberately small enough to explain and modify during a live session.

## Corrections and rejected suggestions

- Rejected an expression-evaluation dependency after its audit reported unresolved code-execution and prototype-pollution risks. It was replaced with a restricted recursive-descent arithmetic parser.
- Reworked the first provider registry because adding a provider still required edits in route and UI maps. Provider discovery, key status, validation, models, and labels now derive from one catalog.
- Corrected the initial Gemini tool-schema mapping after a live request showed that Gemini rejects `additionalProperties` in function declarations.
- Corrected Gemini tool history after live requests showed that it rejects OpenAI's `call_id` field and requires its thought signature to be returned unchanged on the next round.
- Corrected the first Docker build when `better-sqlite3` needed native compilation. Build tools now exist only in the dependency stage and are absent from the runtime image.
- Rejected side-by-side generation, semantic caching, and an evaluation dashboard for this submission. Hybrid retrieval was chosen as the single substantial optional feature because it is deterministic, testable without paid keys, and easy to explain.
- Rejected broad refactors and provider SDK wrappers where plain `fetch` made the request and streaming behavior easier to inspect.

## Validation and remaining judgment calls

Gemini and Groq were each tested with a live key for text streaming and a complete calculator tool round. Anthropic and OpenAI were validated with mocked streaming HTTP fixtures and are not represented as live-tested. Model prices and access can change, so the configuration records the date checked and keeps those values in one file.

The main areas I would revisit for production are exact token counting, account-level budgets, authentication and tenant isolation, durable ingestion, malware scanning, and broader retrieval and grounded-answer evaluation. These are documented as gaps rather than implied to be complete.
