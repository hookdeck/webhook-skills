// Generated with: harbor-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export type HarborAuthConfig = Record<string, string | undefined>;

/**
 * Constant-time string comparison. Check lengths first (timingSafeEqual throws on a
 * length mismatch), then compare equal-length Buffers.
 */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Harbor does not sign payloads. If you set an Auth Header on the webhook, Harbor sends it
 * verbatim as the Authorization header. Compare the WHOLE header value to
 * HARBOR_AUTHORIZATION (e.g. "Bearer <token>"); don't strip, parse or decode the prefix.
 */
export function verifyHarborRequest(
  headers: Headers,
  config: HarborAuthConfig = process.env
): boolean {
  const expected = config.HARBOR_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers.get('authorization');
  if (!received) return false;
  return safeEqual(received, expected);
}

// CloudEvents format: reverse-DNS types map to the Default format's type names.
const CLOUDEVENTS_TYPES: Record<string, string> = {
  'harbor.artifact.pushed': 'PUSH_ARTIFACT',
  'harbor.artifact.pulled': 'PULL_ARTIFACT',
  'harbor.artifact.deleted': 'DELETE_ARTIFACT',
  'harbor.scan.completed': 'SCANNING_COMPLETED',
  'harbor.scan.stopped': 'SCANNING_STOPPED',
  'harbor.scan.failed': 'SCANNING_FAILED',
  'harbor.quota.exceeded': 'QUOTA_EXCEED',
  'harbor.quota.warned': 'QUOTA_WARNING',
  'harbor.replication.status.changed': 'REPLICATION',
  'harbor.tag_retention.finished': 'TAG_RETENTION',
};

export interface NormalizedEvent {
  type: string | null;
  data: Record<string, any> | null;
}

/**
 * Both payload formats carry a `type`. Default: {type, occur_at, operator, event_data}.
 * CloudEvents: {specversion, id, type, time, data, operator}. Returns the event name
 * and its data in one shape.
 */
export function normalize(payload: Record<string, any>): NormalizedEvent {
  const type = typeof payload.type === 'string' ? payload.type : null;
  if (!type) return { type: null, data: null };
  if (payload.specversion) {
    return { type: CLOUDEVENTS_TYPES[type] || type, data: payload.data ?? null };
  }
  return { type, data: payload.event_data ?? null };
}
