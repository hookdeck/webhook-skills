// Generated with: stytch-webhooks skill
// https://github.com/hookdeck/webhook-skills

export interface StytchEvent {
  project_id?: string;
  event_id?: string;
  action?: string;
  object_type?: string;
  source?: string;
  id?: string;
  timestamp?: string;
  [key: string]: unknown;
}

// Stytch bodies carry source, object_type and action but no combined type field
export function stytchEventType(body: StytchEvent | null | undefined): string | null {
  if (!body || !body.source || !body.object_type || !body.action) return null;
  return `${body.source}.${body.object_type}.${body.action}`.toLowerCase();
}
