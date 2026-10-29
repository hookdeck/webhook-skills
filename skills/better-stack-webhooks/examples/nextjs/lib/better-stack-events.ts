// Generated with: better-stack-webhooks skill
// https://github.com/hookdeck/webhook-skills

export type BetterStackEvent =
  | { kind: 'incident'; state: 'comment'; id?: string; name?: string; content?: string; author?: string }
  | { kind: 'incident'; state: 'started' | 'acknowledged' | 'resolved'; id?: string; name?: string; cause?: string }
  | { kind: 'monitor'; state: 'paused' | 'changed'; id?: string; name?: string }
  | { kind: 'on_call'; change: 'on_call' | 'holiday'; calendar?: string; emails: string[]; onHolidayEmails: string[] }
  | { kind: 'unknown' };

type Obj = Record<string, unknown>;

const isObject = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
// Default templates render unset timestamps as null or an empty string.
const isSet = (v: unknown): boolean => typeof v === 'string' && v.trim() !== '';
const text = (v: unknown): string | undefined =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : undefined;
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
const obj = (v: unknown): Obj => (isObject(v) ? v : {});

/**
 * Work out what a delivery is from its shape. Only the top-level `event: "comment"` is a
 * documented wire value; every other state is inferred from attributes. A customised
 * body_template may carry none of these fields, in which case the kind is 'unknown'.
 * Every field is untrusted: wrong-typed values are ignored, never thrown on.
 */
export function classifyBetterStackPayload(payload: unknown): BetterStackEvent {
  const root = obj(payload);
  const data = obj(root.data);
  const attrs = obj(data.attributes);

  if (data.type === 'incident') {
    const id = text(data.id);
    const name = text(attrs.name);
    if (root.event === 'comment') {
      const c = obj(obj(root.comment).attributes);
      return { kind: 'incident', state: 'comment', id, name, content: text(c.content), author: text(c.user_email) };
    }
    // Inference: resolved_at set -> resolved, acknowledged_at set -> acknowledged, else started/open.
    const state = isSet(attrs.resolved_at)
      ? 'resolved'
      : isSet(attrs.acknowledged_at)
        ? 'acknowledged'
        : 'started';
    return { kind: 'incident', state, id, name, cause: text(attrs.cause) };
  }

  if (data.type === 'monitor') {
    // Created, updated, unpaused and deleted look alike; only paused_at distinguishes one.
    return {
      kind: 'monitor',
      id: text(data.id),
      name: text(attrs.pronounceable_name),
      state: isSet(attrs.paused_at) ? 'paused' : 'changed',
    };
  }

  if (data.change === 'on_call' || data.change === 'holiday') {
    return {
      kind: 'on_call',
      change: data.change,
      calendar: text(data.calendar_name),
      emails: strings(data.emails),
      onHolidayEmails: strings(data.on_holiday_emails),
    };
  }

  return { kind: 'unknown' };
}
