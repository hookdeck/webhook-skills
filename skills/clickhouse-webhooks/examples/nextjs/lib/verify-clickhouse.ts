// Generated with: clickhouse-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Hash both sides so timingSafeEqual always gets equal-length buffers.
const digest = (v: string) => crypto.createHash('sha256').update(v).digest();

interface VerifyEnv {
  CLICKHOUSE_WEBHOOK_HEADER?: string;
  CLICKHOUSE_WEBHOOK_SECRET?: string;
}

/**
 * ClickStack Generic alert webhooks are not signed. Authentication is a secret header
 * you added under "Webhook headers". The header name is user-chosen (CLICKHOUSE_WEBHOOK_HEADER,
 * default Authorization); the expected value is the exact, whole header value in
 * CLICKHOUSE_WEBHOOK_SECRET (any "Bearer " prefix included, not parsed).
 *
 * A static credential authenticates the sender, not the body, and gives no replay protection.
 */
export function verifyClickHouseRequest(
  headers: Headers,
  env: VerifyEnv = process.env as VerifyEnv
): boolean {
  const secret = env.CLICKHOUSE_WEBHOOK_SECRET;
  if (!secret) return false; // never accept when unconfigured
  const name = env.CLICKHOUSE_WEBHOOK_HEADER || 'Authorization';
  const received = headers.get(name); // Headers.get is case-insensitive
  return Boolean(received) && crypto.timingSafeEqual(digest(received as string), digest(secret));
}
