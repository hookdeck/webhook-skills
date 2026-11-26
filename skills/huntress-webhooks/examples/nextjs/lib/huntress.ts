// Generated with: huntress-webhooks skill
// https://github.com/hookdeck/webhook-skills

export interface HuntressEvent {
  type: string | null;
  payload: Record<string, any>;
}

// Huntress's webhook payload reference (https://api.huntress.io/docs, "Webhooks") puts the
// event type in the top-level `event_type`, e.g. "incident_report.created". Escalation and
// platform action bodies also have a `type` field, which is NOT the event type, so don't
// fall back to it. Send Test sends `event_type: "test.event"`.
export function parseHuntressEvent(body: any): HuntressEvent {
  const raw = body && body.event_type;
  const type: string | null = typeof raw === 'string' ? raw : null;
  return { type, payload: body ?? {} };
}
