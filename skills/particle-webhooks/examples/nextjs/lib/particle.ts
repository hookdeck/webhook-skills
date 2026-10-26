// Generated with: particle-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

const sha256 = (buf: Buffer) => crypto.createHash('sha256').update(buf).digest();

/**
 * Particle does not sign webhooks. Authenticate with a secret header you add to the
 * integration. The header name is yours to choose (PARTICLE_WEBHOOK_HEADER, default
 * Authorization) and the WHOLE value is compared, so "Bearer " is not stripped or parsed.
 * Hashing both sides gives equal-length buffers, so timingSafeEqual never throws.
 * Header values arrive as latin1 strings; re-encode to recover the raw bytes.
 */
export function verifyParticleRequest(
  headers: Headers,
  secret: string | undefined = process.env.PARTICLE_WEBHOOK_SECRET,
  headerName: string = process.env.PARTICLE_WEBHOOK_HEADER || 'Authorization'
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers.get is case-insensitive
  if (!received) return false;
  return crypto.timingSafeEqual(
    sha256(Buffer.from(received, 'latin1')),
    sha256(Buffer.from(secret, 'utf8'))
  );
}

export type ParticlePayload = {
  event?: string;
  data?: string;
  coreid?: string;
  published_at?: string;
  [key: string]: unknown;
};

/**
 * Default Particle body: application/x-www-form-urlencoded with event, data,
 * published_at and coreid. JSON bodies and GET query strings are also supported.
 * An empty body is valid (GET, DELETE). Throws on malformed JSON or non-object bodies.
 */
export function parseParticlePayload(
  text: string,
  contentType: string | null,
  searchParams: URLSearchParams
): ParticlePayload {
  const payload: ParticlePayload = Object.fromEntries(searchParams);
  if (!text.trim()) return payload;

  const type = (contentType || '').toLowerCase();
  let body: unknown;
  if (type.includes('json')) {
    body = JSON.parse(text);
  } else if (type.includes('x-www-form-urlencoded')) {
    body = Object.fromEntries(new URLSearchParams(text));
  } else {
    try {
      body = JSON.parse(text); // custom bodies: JSON if it parses, else keep the text
    } catch {
      body = { raw: text };
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Expected an object body');
  }
  return { ...payload, ...(body as ParticlePayload) };
}
