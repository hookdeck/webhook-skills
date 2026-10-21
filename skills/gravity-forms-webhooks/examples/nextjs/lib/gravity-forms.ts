// Generated with: gravity-forms-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Gravity Forms does NOT sign webhooks: there is no signature, HMAC or signing secret.
// Authentication is a custom Request Header you add to the webhook feed under
// Form Settings > Webhooks > Request Headers, e.g.  X-Webhook-Secret: <secret>
// Compare the header value with your secret in constant time.
export function verifyGravityFormsSecret(
  headerValue: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!secret) return false; // fail closed when the secret is not configured
  if (typeof headerValue !== 'string') return false;
  // Hash both sides so timingSafeEqual always gets equal-length buffers
  const a = crypto.createHash('sha256').update(headerValue).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

// The entry: keys are field IDs ("1", "2.3" for sub-inputs) plus entry properties
// (id, form_id, date_created, source_url, ...). With "Select Fields" it holds only
// the keys you mapped.
export type GravityFormsEntry = Record<string, unknown>;

// JSON when the feed's Request Format is JSON, otherwise urlencoded form data.
export function parseEntry(rawBody: string, contentType: string | null): GravityFormsEntry {
  if (/application\/(.+\+)?json/i.test(contentType ?? '')) {
    const body: unknown = JSON.parse(rawBody);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('Expected a JSON object');
    }
    return body as GravityFormsEntry;
  }
  return Object.fromEntries(new URLSearchParams(rawBody));
}

// Field values are the keys that look like field IDs: "1", "2.3"
export function fieldValues(entry: GravityFormsEntry): GravityFormsEntry {
  return Object.fromEntries(
    Object.entries(entry).filter(([key]) => /^\d+(\.\d+)?$/.test(key))
  );
}

export function dedupeKey(entry: GravityFormsEntry): string | null {
  return entry.id ? `${entry.form_id ?? ''}:${entry.id}` : null;
}
