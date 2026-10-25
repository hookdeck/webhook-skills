// Event IDs already handled (in-memory for the example; use a database or Redis in production)
const seen = new Set<string>();

export function alreadySeen(id: string): boolean {
  return seen.has(id);
}

export function markSeen(id: string): void {
  seen.add(id);
}
