// Generated with: propelauth-webhooks skill
// https://github.com/hookdeck/webhook-skills

export interface PropelAuthEvent {
  type: string | null;
  data: Record<string, any>;
}

// PropelAuth's docs say each payload includes the event type but don't name the
// field; read `event_type`, falling back to `type`.
export function parsePropelAuthEvent(body: any): PropelAuthEvent {
  const data: Record<string, any> = body && typeof body === 'object' ? body : {};
  const type = data.event_type ?? data.type ?? null;
  return { type: typeof type === 'string' ? type : null, data };
}
