// Generated with: the-things-stack-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// The Things Stack doesn't sign webhooks. "Request authentication" on the
// webhook makes the Application Server send
//   Authorization: Basic base64(<username>:<password>)
// on every request. Requests are always POST, with a JSON body.

const MESSAGE_TYPES = [
  'uplink_message',
  'uplink_normalized',
  'join_accept',
  'downlink_ack',
  'downlink_nack',
  'downlink_sent',
  'downlink_failed',
  'downlink_queued',
  'downlink_queue_invalidated',
  'location_solved',
  'service_data',
] as const;

export type TtsMessageType = (typeof MESSAGE_TYPES)[number];

export interface TtsWebhookMessage {
  end_device_ids?: { device_id?: string; application_ids?: { application_id?: string }; dev_eui?: string; join_eui?: string; dev_addr?: string };
  correlation_ids?: string[];
  received_at?: string;
  uplink_message?: { f_port?: number; f_cnt?: number; frm_payload?: string; decoded_payload?: Record<string, unknown>; [key: string]: unknown };
  [key: string]: unknown;
}

/** Constant-time string comparison that doesn't leak the length. */
function safeEqual(given: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(given, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

/** Check an Authorization header against the configured credentials. */
export function verifyBasicAuth(
  authorization: string | null | undefined,
  username: string | null | undefined,
  password: string | null | undefined
): boolean {
  if (!username || !password) return false;
  const match = /^Basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(String(authorization ?? ''));
  if (!match) return false;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const separator = decoded.indexOf(':'); // the password may contain ':'
  if (separator < 0) return false;
  const userOk = safeEqual(decoded.slice(0, separator), username);
  const passOk = safeEqual(decoded.slice(separator + 1), password);
  return userOk && passOk;
}

/** Each request carries exactly one top-level message object, named after its type. */
export function handleTtsMessage(message: TtsWebhookMessage) {
  const type: TtsMessageType | 'unknown' = MESSAGE_TYPES.find((name) => message[name] !== undefined) ?? 'unknown';
  const deviceId = message.end_device_ids?.device_id ?? null;
  if (type === 'uplink_message') {
    const up = message.uplink_message ?? {};
    console.log(`Uplink from ${deviceId} on port ${up.f_port}:`, up.decoded_payload ?? up.frm_payload);
  } else {
    console.log(`${type} message for ${deviceId}`);
  }
  return { received: true, type, device_id: deviceId };
}
