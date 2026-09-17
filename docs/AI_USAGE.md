# AI Usage

Codex was used to read the assignment, research current first-party provider documentation, scaffold the application, draft the initial implementation/tests/docs, and run validation.

Human-review items:

- Confirm model access and pricing for the reviewer accounts before recording the demo.
- Exercise each provider with a live key; the repository currently validates adapters with mocked HTTP streams because no keys are committed.
- Review the UI copy and record the final demo video.

Corrections made during AI-assisted work:

- Removed `expr-eval` after `npm audit` reported unfixed code-execution/prototype-pollution advisories; replaced it with a restricted arithmetic parser.
- Adjusted code for current React lint rules, Next.js route typing, and current PDF.js typings after local validation.
- Fixed OpenAI streamed tool-call ID tracking so fragments without repeated IDs accumulate correctly.
- Kept optional side-by-side comparison and Docker out of scope to preserve a smaller, more repairable core.

No generated claim of live-provider success should be accepted without running it against real keys.

