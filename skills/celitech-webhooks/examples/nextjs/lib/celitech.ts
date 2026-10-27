// Generated with: celitech-webhooks skill
// https://github.com/hookdeck/webhook-skills

export interface SignatureHeaders {
  'svix-id': string;
  'svix-timestamp': string;
  'svix-signature': string;
}

// Celitech deliveries carry svix-* headers. Hookdeck also accepts the Standard
// Webhooks webhook-* names when svix-id is absent, so do the same. The three
// values are handed to the library under the svix-* names it expects.
export function resolveSignatureHeaders(headers: Headers): SignatureHeaders | null {
  const prefix = headers.get('svix-id') ? 'svix' : 'webhook';
  const id = headers.get(`${prefix}-id`);
  const timestamp = headers.get(`${prefix}-timestamp`);
  const signature = headers.get(`${prefix}-signature`);
  if (!id || !timestamp || !signature) return null;
  return { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': signature };
}
