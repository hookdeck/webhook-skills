import crypto from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../app/webhooks/lob/route';

// Lob webhook secrets are opaque strings from the dashboard; the HMAC key is their UTF-8 bytes.
const SECRET = 'test_lob_webhook_secret';

// Payload based on the sample in Lob's webhook docs (self_mailer.rendered_thumbnails).
const samplePayload = {
  event_type: {
    resource: 'self mailers',
    enabled_for_test: true,
    id: 'self_mailer.rendered_thumbnails',
    object: 'event_type',
  },
  reference_id: 'sfm_c29bbbca5f7bd489',
  date_created: '2021-12-16T01:34:18.159Z',
  id: 'evt_d47ff1b815373f67',
  body: {
    id: 'sfm_c29bbbca5f7bd489',
    description: 'self mailer create',
    carrier: 'USPS',
    tracking_events: [],
    thumbnails: [{ small: 'REDACTED', medium: 'REDACTED', large: 'REDACTED' }],
    size: '6x18_bifold',
    mail_type: 'usps_first_class',
    object: 'self_mailer',
  },
  object: 'event',
};

function eventOf(id: string) {
  return { event_type: { id, object: 'event_type' }, id: 'evt_test', body: { id: 'psc_123' }, object: 'event' };
}

// Sign exactly as Lob does: hex HMAC-SHA256 over `${timestamp}.${raw body}`.
function sign(rawBody: string, timestamp: string, secret = SECRET): string {
  return crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.'), Buffer.from(rawBody)]))
    .digest('hex');
}

interface PostOptions {
  timestamp?: string;
  signature?: string | null;
  omitTimestamp?: boolean;
  contentType?: string;
}

function post(payload: object | string, opts: PostOptions = {}) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const timestamp = opts.timestamp ?? String(Date.now());
  const headers: Record<string, string> = { 'content-type': opts.contentType ?? 'application/json' };
  if (!opts.omitTimestamp) headers['lob-signature-timestamp'] = timestamp;
  if (opts.signature !== null) headers['lob-signature'] = opts.signature ?? sign(body, timestamp);
  return POST(new Request('http://localhost/webhooks/lob', { method: 'POST', headers, body }));
}

describe('Lob webhook route', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function configure(tolerance?: string) {
    vi.stubEnv('LOB_WEBHOOK_SECRET', SECRET);
    if (tolerance !== undefined) vi.stubEnv('LOB_WEBHOOK_TOLERANCE_SECONDS', tolerance);
  }

  describe('signature verification', () => {
    it('accepts a valid signature', async () => {
      configure();
      const res = await post(samplePayload);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts an uppercase hex digest (hex is case-insensitive)', async () => {
      configure();
      const body = JSON.stringify(samplePayload);
      const ts = String(Date.now());
      const res = await post(body, { timestamp: ts, signature: sign(body, ts).toUpperCase() });
      expect(res.status).toBe(200);
    });

    it('verifies the exact raw bytes (pretty-printed body, CRLF, non-ASCII)', async () => {
      configure();
      const body = JSON.stringify(samplePayload, null, 2)
        .replace('self mailer create', 'self mailer créé')
        .replace(/\n/g, '\r\n');
      const res = await post(body);
      expect(res.status).toBe(200);
    });

    it('verifies any content type', async () => {
      configure();
      const res = await post(samplePayload, { contentType: 'text/plain' });
      expect(res.status).toBe(200);
    });

    it('rejects a missing Lob-Signature header', async () => {
      configure();
      const res = await post(samplePayload, { signature: null });
      expect(res.status).toBe(401);
    });

    it('rejects a missing Lob-Signature-Timestamp header', async () => {
      configure();
      const res = await post(samplePayload, { omitTimestamp: true, signature: sign(JSON.stringify(samplePayload), '1') });
      expect(res.status).toBe(401);
    });

    it('rejects an empty signature', async () => {
      configure();
      const res = await post(samplePayload, { signature: '' });
      expect(res.status).toBe(401);
    });

    it('rejects a signature of the wrong length', async () => {
      configure();
      const res = await post(samplePayload, { signature: 'abc123' });
      expect(res.status).toBe(401);
    });

    it('rejects non-hex characters in an otherwise 64-character signature', async () => {
      configure();
      const res = await post(samplePayload, { signature: 'z'.repeat(64) });
      expect(res.status).toBe(401);
    });

    it('rejects a prefixed signature (the header is a bare digest)', async () => {
      configure();
      const body = JSON.stringify(samplePayload);
      const ts = String(Date.now());
      const res = await post(body, { timestamp: ts, signature: `sha256=${sign(body, ts)}` });
      expect(res.status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      configure();
      const body = JSON.stringify(samplePayload);
      const ts = String(Date.now());
      const res = await post(body.replace('sfm_', 'sfn_'), { timestamp: ts, signature: sign(body, ts) });
      expect(res.status).toBe(401);
    });

    it('rejects a tampered timestamp', async () => {
      configure();
      const body = JSON.stringify(samplePayload);
      const res = await post(body, { timestamp: '1700000000001', signature: sign(body, '1700000000000') });
      expect(res.status).toBe(401);
    });

    it('rejects a signature made with the wrong secret', async () => {
      configure();
      const body = JSON.stringify(samplePayload);
      const ts = String(Date.now());
      const res = await post(body, { timestamp: ts, signature: sign(body, ts, 'whsec_other') });
      expect(res.status).toBe(401);
    });

    it("rejects debugger events signed with the literal secret 'secret'", async () => {
      configure();
      const body = JSON.stringify(samplePayload);
      const ts = String(Date.now());
      const res = await post(body, { timestamp: ts, signature: sign(body, ts, 'secret') });
      expect(res.status).toBe(401);
    });

    it('returns 500 when the secret is not configured', async () => {
      vi.stubEnv('LOB_WEBHOOK_SECRET', '');
      const res = await post(samplePayload);
      expect(res.status).toBe(500);
    });
  });

  describe('timestamp tolerance (opt-in)', () => {
    const oldTs = () => String(Date.now() - 60 * 60 * 1000); // 1 hour old, milliseconds

    it('accepts an old timestamp by default (retries and replays keep the original)', async () => {
      configure();
      const res = await post(samplePayload, { timestamp: oldTs() });
      expect(res.status).toBe(200);
    });

    it('treats LOB_WEBHOOK_TOLERANCE_SECONDS=0 as off', async () => {
      configure('0');
      const res = await post(samplePayload, { timestamp: oldTs() });
      expect(res.status).toBe(200);
    });

    it('rejects an old timestamp when a tolerance is set', async () => {
      configure('300');
      const res = await post(samplePayload, { timestamp: oldTs() });
      expect(res.status).toBe(401);
    });

    it('accepts a fresh timestamp when a tolerance is set (milliseconds)', async () => {
      configure('300');
      const res = await post(samplePayload, { timestamp: String(Date.now()) });
      expect(res.status).toBe(200);
    });

    it('accepts a fresh timestamp when a tolerance is set (seconds)', async () => {
      configure('300');
      const res = await post(samplePayload, { timestamp: String(Math.floor(Date.now() / 1000)) });
      expect(res.status).toBe(200);
    });

    it('rejects a non-numeric timestamp when a tolerance is set', async () => {
      configure('300');
      const res = await post(samplePayload, { timestamp: '2021-12-16T01:34:18.159Z' });
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    const eventTypes = [
      'postcard.created',
      'postcard.delivered',
      'postcard.re-routed',
      'letter.mailed',
      'letter.delivered',
      'check.in_transit',
      'self_mailer.rendered_thumbnails',
    ];

    it.each(eventTypes)('handles %s', async (type) => {
      configure();
      const res = await post(eventOf(type));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('acknowledges unhandled event types with 200', async () => {
      configure();
      const res = await post(eventOf('bank_account.verified'));
      expect(res.status).toBe(200);
    });

    it('returns 400 for a validly signed body that is not JSON', async () => {
      configure();
      const res = await post('not json');
      expect(res.status).toBe(400);
    });
  });
});
