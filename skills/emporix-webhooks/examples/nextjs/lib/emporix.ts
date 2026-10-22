// Generated with: emporix-webhooks skill
// https://github.com/hookdeck/webhook-skills

// Emporix documents each event's payload schema but not an envelope, and Svix sends no
// event-type header. Use `eventType` from the body if present, otherwise from the
// `?eventType=` query string on the endpoint URL registered in the Svix dashboard.
export function getEventType(body: any, searchParams: URLSearchParams): string | null {
  if (body && typeof body.eventType === 'string') return body.eventType;
  return searchParams.get('eventType');
}
