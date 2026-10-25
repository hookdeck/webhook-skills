// Generated with: safebase-webhooks skill
// https://github.com/hookdeck/webhook-skills

// SafeBase doesn't document which body field carries the event name (the test
// event has none, real events do), so check the likely candidates.
export function getEventName(body: any): string | null {
  for (const key of ['eventType', 'event_type', 'type', 'event']) {
    if (body && typeof body[key] === 'string' && body[key]) return body[key];
  }
  return null;
}
