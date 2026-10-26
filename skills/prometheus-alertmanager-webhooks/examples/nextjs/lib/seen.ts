// In-memory dedupe for the example; use a shared store (Redis, DB) in production.
export const seen = new Set<string>();
