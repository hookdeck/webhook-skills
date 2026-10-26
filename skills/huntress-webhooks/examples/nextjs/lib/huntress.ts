// Generated with: huntress-webhooks skill
// https://github.com/hookdeck/webhook-skills

export interface HuntressEvent {
  type: string | null;
  payload: Record<string, any>;
}

// Huntress's article describes the body only as "a JSON payload describing the event".
// Use `type` when the body has one; otherwise report the event as untyped.
export function parseHuntressEvent(body: any): HuntressEvent {
  const type: string | null = body && typeof body.type === 'string' ? body.type : null;
  return { type, payload: body ?? {} };
}
