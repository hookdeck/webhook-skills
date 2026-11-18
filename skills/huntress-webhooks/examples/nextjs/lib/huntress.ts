// Generated with: huntress-webhooks skill
// https://github.com/hookdeck/webhook-skills

export interface HuntressEvent {
  type: string | null;
  payload: Record<string, any>;
}

// Huntress's article describes the body only as "a JSON payload describing the event".
// A live test delivery (2026-11-18) carried `event_type` ("test.event"); fall back to
// `type`, otherwise report the event as untyped.
export function parseHuntressEvent(body: any): HuntressEvent {
  const raw = body && (body.event_type ?? body.type);
  const type: string | null = typeof raw === 'string' ? raw : null;
  return { type, payload: body ?? {} };
}
