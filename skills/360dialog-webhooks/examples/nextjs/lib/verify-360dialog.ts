// Generated with: 360dialog-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Defaults to process.env; tests pass a plain object
export type ThreeSixtyDialogAuthConfig = Record<string, string | undefined>;

/**
 * Constant-time comparison of two byte strings. Hashing both sides first gives
 * equal-length buffers, so timingSafeEqual never throws and length isn't leaked.
 */
function safeEqual(a: Buffer, b: Buffer): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Parse `Authorization: Basic base64(username:password)`. The scheme is
 * case-insensitive and the value is split on the FIRST colon (passwords may
 * contain ':'). Returns null when the header is missing or malformed.
 */
export function parseBasicAuth(header: string | null): { username: Buffer; password: Buffer } | null {
  if (!header) return null;
  const match = /^basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(header);
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64');
  const i = decoded.indexOf(0x3a); // ':'
  if (i === -1) return null;
  return { username: decoded.subarray(0, i), password: decoded.subarray(i + 1) };
}

export function isConfigured(config: ThreeSixtyDialogAuthConfig = process.env): boolean {
  return Boolean(config.THREE_SIXTY_DIALOG_WEBHOOK_USERNAME && config.THREE_SIXTY_DIALOG_WEBHOOK_PASSWORD);
}

/**
 * 360dialog does not sign webhooks. You set `Authorization: Basic base64(USER:PASS)` in the
 * `headers` object when setting the webhook URL, and 360dialog sends it with every request.
 * Compare username and password separately, evaluating both before deciding.
 */
export function verify360dialogRequest(
  headers: Headers,
  config: ThreeSixtyDialogAuthConfig = process.env
): boolean {
  const username = config.THREE_SIXTY_DIALOG_WEBHOOK_USERNAME;
  const password = config.THREE_SIXTY_DIALOG_WEBHOOK_PASSWORD;
  if (!username || !password) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers.get('authorization'));
  if (!creds) return false;
  const userOk = safeEqual(creds.username, Buffer.from(username));
  const passOk = safeEqual(creds.password, Buffer.from(password));
  return userOk && passOk;
}

export type ThreeSixtyDialogEvent = {
  kind: string; // message | status | error | smb_message_echoes | history | smb_app_state_sync | ...
  value: Record<string, any>;
  message?: Record<string, any>;
  status?: Record<string, any>;
  error?: Record<string, any>;
};

/**
 * Flatten a 360dialog (WhatsApp Cloud API) body into a list of events.
 *   - Meta format: entry[].changes[] with a `field`. `messages` carries value.messages
 *     (inbound), value.statuses (delivery updates) or value.errors; Coexistence adds the
 *     `smb_message_echoes`, `history` and `smb_app_state_sync` fields.
 *   - Envelope format: {id, event, data}, used in the docs for history and smb_app_state_sync.
 */
export function extractEvents(payload: Record<string, any>): ThreeSixtyDialogEvent[] {
  const events: ThreeSixtyDialogEvent[] = [];

  if (Array.isArray(payload.entry)) {
    for (const entry of payload.entry) {
      for (const change of entry?.changes ?? []) {
        const field = change.field;
        const value = change.value ?? {};
        if (field === 'messages') {
          for (const message of value.messages ?? []) events.push({ kind: 'message', value, message });
          for (const status of value.statuses ?? []) events.push({ kind: 'status', value, status });
          for (const error of value.errors ?? []) events.push({ kind: 'error', value, error });
        } else {
          events.push({ kind: field || 'unknown', value });
        }
      }
    }
  } else if (typeof payload.event === 'string') {
    events.push({ kind: payload.event, value: payload.data ?? {} });
  }

  return events;
}
