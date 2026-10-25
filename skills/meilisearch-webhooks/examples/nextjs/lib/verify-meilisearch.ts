// Generated with: meilisearch-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';
import zlib from 'zlib';

export type MeilisearchAuthConfig = Record<string, string | undefined>;

export interface MeilisearchTask {
  uid?: number;
  indexUid?: string | null;
  status?: string;
  type?: string;
  details?: Record<string, unknown> | null;
  error?: { message?: string; code?: string } | null;
  [key: string]: unknown;
}

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Meilisearch does not sign payloads. The only credential is the Authorization header
 * you configured, sent verbatim. Compare the WHOLE value, including any "Bearer " or
 * "Basic " prefix: don't strip, parse or base64-decode it.
 */
export function verifyMeilisearchRequest(
  headers: Headers,
  config: MeilisearchAuthConfig = process.env
): boolean {
  const expected = config.MEILISEARCH_AUTHORIZATION;
  if (!expected) return false; // never accept when unconfigured
  const received = headers.get('authorization');
  if (!received) return false;
  return safeEqual(received, expected);
}

/**
 * The body is ndjson (one finished task object per line), gzip-compressed when the
 * sender sets Content-Encoding: gzip. Throws if it can't be decoded or parsed.
 */
export function parseTasks(raw: ArrayBuffer, contentEncoding: string | null): MeilisearchTask[] {
  let buf = Buffer.from(raw);
  if (/\bgzip\b/i.test(contentEncoding ?? '')) {
    buf = zlib.gunzipSync(buf, { maxOutputLength: 50 * 1024 * 1024 });
  }
  const tasks = buf
    .toString('utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as unknown); // one JSON object per line, never the whole body
  for (const task of tasks) {
    if (!task || typeof task !== 'object' || Array.isArray(task)) {
      throw new Error('Expected one JSON object per line');
    }
  }
  return tasks as MeilisearchTask[];
}
