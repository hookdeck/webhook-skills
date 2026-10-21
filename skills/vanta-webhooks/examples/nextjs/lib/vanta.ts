// Generated with: vanta-webhooks skill
// https://github.com/hookdeck/webhook-skills

// Top-level payload keys, one per Vanta event domain
const DOMAIN_KEYS = ['questionnaire', 'trustCenter', 'vendor', 'informationRequest', 'evidence', 'control'];

export interface VantaEvent {
  type: string | null;
  payload: Record<string, any>;
  domain: string | null;
}

// Vanta documents the event payload (e.g. { questionnaire: {...} }) but not an
// envelope. If the body carries a `type`, use it; otherwise treat the body as
// the payload and route on its top-level key.
export function parseVantaEvent(body: any): VantaEvent {
  const typed = body && typeof body.type === 'string';
  const type: string | null = typed ? body.type : null;
  const payload: Record<string, any> = (typed ? body.payload ?? body.data : body) ?? {};
  const domain = DOMAIN_KEYS.find((key) => key in payload) ?? null;
  return { type, payload, domain };
}
