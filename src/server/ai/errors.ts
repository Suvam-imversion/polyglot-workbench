import type { ErrorKind } from "@/contracts/ai";

export class ProviderError extends Error {
  constructor(
    public readonly kind: ErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export function normalizeHttpError(status: number, body: string) {
  const lower = body.toLowerCase();
  if (status === 401 || status === 403) return new ProviderError("auth", "Provider authentication failed", status);
  if (status === 429) return new ProviderError("rate_limit", "Provider rate limit reached", status);
  if (lower.includes("context") && (lower.includes("length") || lower.includes("window"))) {
    return new ProviderError("context_length", "The conversation exceeds the model context window", status);
  }
  if (lower.includes("content") && (lower.includes("filter") || lower.includes("safety"))) {
    return new ProviderError("content_filter", "The provider blocked this content", status);
  }
  if (status >= 500) return new ProviderError("server_error", "Provider service error", status);
  return new ProviderError("bad_request", "Provider rejected the request", status);
}

export function normalizeStreamError(code: string, message = "") {
  const value = `${code} ${message}`.toLowerCase();
  if (value.includes("auth") || value.includes("permission") || value.includes("api_key")) {
    return new ProviderError("auth", "Provider authentication failed");
  }
  if (value.includes("rate") || value.includes("overloaded") || value.includes("quota")) {
    return new ProviderError("rate_limit", "Provider rate limit reached");
  }
  if (value.includes("context") || value.includes("token_limit")) {
    return new ProviderError("context_length", "The conversation exceeds the model context window");
  }
  if (value.includes("safety") || value.includes("content_filter") || value.includes("blocked")) {
    return new ProviderError("content_filter", "The provider blocked this content");
  }
  if (value.includes("invalid") || value.includes("bad_request")) {
    return new ProviderError("bad_request", "Provider rejected the request");
  }
  return new ProviderError("server_error", "Provider service error");
}

export async function providerFetch(input: string, init: RequestInit) {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ProviderError("timeout", "Request cancelled or timed out");
    }
    throw new ProviderError("server_error", "Provider network error");
  }
}

export function publicError(error: unknown) {
  if (error instanceof ProviderError) return { kind: error.kind, message: error.message };
  if (error instanceof DOMException && error.name === "AbortError") {
    return { kind: "timeout" as const, message: "Request cancelled or timed out" };
  }
  return { kind: "server_error" as const, message: "The request could not be completed" };
}
