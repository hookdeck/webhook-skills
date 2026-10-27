// Generated with: salsa-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Salsa secrets are Standard Webhooks secrets: "whsec_" + base64(key bytes), for
// example "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw". The HMAC key is the decoded part.
const SECRET = 'whsec_' + Buffer.from('salsa-test-signing-key-0123456789a').toString('base64');
process.env.SALSA_WEBHOOK_SECRET = SECRET;

const { app, verifySalsaWebhook, resolveSignatureHeaders } = require('../src/index');

/** Sign exactly like Salsa does: HMAC-SHA256 over `${id}.${timestamp}.${body}`. */
function sign(rawBody, id, timestamp, secret = SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

/** Build signature headers. `prefix` is 'webhook' (Salsa) or 'svix' (fallback). */
function signedHeaders(rawBody, opts = {}) {
  const prefix = opts.prefix || 'webhook';
  const id = opts.id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(opts.timestamp ?? now());
  return {
    'content-type': 'application/json',
    [`${prefix}-id`]: id,
    [`${prefix}-timestamp`]: ts,
    [`${prefix}-signature`]: opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

/** Salsa body shape: { data: { type, attributes } }. */
function envelope(type, attributes = {}) {
  return { data: { type, attributes } };
}

const employerCreated = () =>
  envelope('Employer.created', { category: 'LIFECYCLE', employerId: 'er_123', externalId: 'abc' });

const send = (payload, headers, path = '/webhooks/salsa') =>
  request(app).post(path).set(headers).send(payload);

describe('Salsa webhook endpoint', () => {
  let logSpy;
  let errSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    process.env.SALSA_WEBHOOK_SECRET = SECRET;
  });

  describe('signature verification', () => {
    it('signs the way Salsa documents it', () => {
      // Worked example from docs.salsa.dev/docs/consuming-webhooks
      const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
      expect(sign('{"test": 2432232314}', 'msg_p5jXN8AQM9LWM0D4loKWxJek', '1614265330', secret)).toBe(
        'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE='
      );
    });

    it('accepts a validly signed delivery with webhook-* headers', async () => {
      const raw = JSON.stringify(employerCreated());
      const res = await send(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts the same delivery sent with svix-* headers', async () => {
      const raw = JSON.stringify(employerCreated());
      const res = await send(raw, signedHeaders(raw, { prefix: 'svix' }));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('prefers webhook-* headers when both sets are present', async () => {
      const raw = JSON.stringify(employerCreated());
      const good = signedHeaders(raw);
      const res = await send(raw, {
        ...good,
        'svix-id': 'msg_other',
        'svix-timestamp': String(now()),
        'svix-signature': 'v1,AAAA',
      });
      expect(res.status).toBe(200);
    });

    it('verifies the exact bytes, whatever the content type', async () => {
      const raw = '{"data":  {"type":"Employer.created",\n"attributes":{"employerId":"er_123"}}}';
      const headers = { ...signedHeaders(raw), 'content-type': 'text/plain' };
      const res = await send(raw, headers);
      expect(res.status).toBe(200);
    });

    it('accepts a delivery signed with several signatures when one is valid', async () => {
      const raw = JSON.stringify(employerCreated());
      const id = 'msg_multi';
      const ts = String(now());
      const bad = sign(raw, id, ts, 'whsec_' + Buffer.from('some-other-secret-value-0123456').toString('base64'));
      const headers = signedHeaders(raw, { id, timestamp: ts, signature: `${bad} ${sign(raw, id, ts)}` });
      const res = await send(raw, headers);
      expect(res.status).toBe(200);
    });

    it('ignores non-v1 signature entries', async () => {
      const raw = JSON.stringify(employerCreated());
      const id = 'msg_v1a';
      const ts = String(now());
      const v1 = sign(raw, id, ts);
      const headers = signedHeaders(raw, { id, timestamp: ts, signature: v1.replace('v1,', 'v1a,') });
      const res = await send(raw, headers);
      expect(res.status).toBe(400);
    });

    it('rejects a tampered body', async () => {
      const raw = JSON.stringify(employerCreated());
      const headers = signedHeaders(raw);
      const res = await send(raw.replace('er_123', 'er_999'), headers);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid signature');
    });

    it('rejects a signature made with another secret', async () => {
      const raw = JSON.stringify(employerCreated());
      const other = 'whsec_' + Buffer.from('another-endpoint-secret-0123456').toString('base64');
      const res = await send(raw, signedHeaders(raw, { secret: other }));
      expect(res.status).toBe(400);
    });

    it('rejects a stale timestamp', async () => {
      const raw = JSON.stringify(employerCreated());
      const res = await send(raw, signedHeaders(raw, { timestamp: now() - 6 * 60 }));
      expect(res.status).toBe(400);
    });

    it('rejects a timestamp too far in the future', async () => {
      const raw = JSON.stringify(employerCreated());
      const res = await send(raw, signedHeaders(raw, { timestamp: now() + 6 * 60 }));
      expect(res.status).toBe(400);
    });

    it.each(['id', 'timestamp', 'signature'])('rejects a delivery missing webhook-%s', async (name) => {
      const raw = JSON.stringify(employerCreated());
      const headers = signedHeaders(raw);
      delete headers[`webhook-${name}`];
      const res = await send(raw, headers);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing signature headers');
    });

    it('rejects a delivery with no signature headers', async () => {
      const raw = JSON.stringify(employerCreated());
      const res = await send(raw, { 'content-type': 'application/json' });
      expect(res.status).toBe(400);
    });

    it('fails closed when the secret is not configured', async () => {
      delete process.env.SALSA_WEBHOOK_SECRET;
      const raw = JSON.stringify(employerCreated());
      const res = await send(raw, signedHeaders(raw));
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Webhook secret not configured');
    });
  });

  describe('event handling', () => {
    const lifecycle = { category: 'LIFECYCLE', employerId: 'er_123' };
    const notification = { category: 'NOTIFICATION', employerId: 'er_123' };
    const cases = [
      ['Employer.created', { ...lifecycle, externalId: 'abc' }],
      ['Employer.updated', { ...lifecycle, externalId: 'abc' }],
      ['Employer.onboardingStatus', lifecycle],
      ['Worker.created', lifecycle],
      ['Worker.updated', lifecycle],
      ['Worker.onboardingStatus', lifecycle],
      ['PayrollRun.awaitingInput', lifecycle],
      ['PayrollRun.statusChanged', lifecycle],
      ['Notification.workerPayday', notification],
      ['Notification.employerPayrollRunConfirmation', notification],
      ['Document.uploaded', lifecycle],
      ['AccountingConfiguration.created', lifecycle],
      ['AccountingConfiguration.updated', lifecycle],
    ];

    it.each(cases)('handles %s', async (type, data) => {
      const raw = JSON.stringify(envelope(type, data));
      const res = await send(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
      expect(logSpy.mock.calls.flat().join('\n')).not.toContain('Unhandled');
    });

    it('acknowledges event types it does not handle', async () => {
      const raw = JSON.stringify(envelope('Employer.deleted', { employerId: 'er_123' }));
      const res = await send(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled Salsa event type: Employer.deleted');
    });

    it('acknowledges a resent webhook-id as a duplicate', async () => {
      const raw = JSON.stringify(employerCreated());
      const first = await send(raw, signedHeaders(raw, { id: 'msg_dedupe_1' }));
      expect(first.body).toEqual({ received: true });

      const retry = await send(raw, signedHeaders(raw, { id: 'msg_dedupe_1' }));
      expect(retry.status).toBe(200);
      expect(retry.body).toEqual({ received: true, duplicate: true });
    });

    it('processes a new webhook-id carrying the same body', async () => {
      const raw = JSON.stringify(employerCreated());
      await send(raw, signedHeaders(raw, { id: 'msg_dedupe_2' }));
      const res = await send(raw, signedHeaders(raw, { id: 'msg_dedupe_3' }));
      expect(res.body).toEqual({ received: true });
    });
  });

  describe('verifySalsaWebhook', () => {
    it('returns the parsed event for a valid delivery', () => {
      const raw = JSON.stringify(employerCreated());
      const h = signedHeaders(raw);
      const event = verifySalsaWebhook(raw, {
        'webhook-id': h['webhook-id'],
        'webhook-timestamp': h['webhook-timestamp'],
        'webhook-signature': h['webhook-signature'],
      });
      expect(event.data.type).toBe('Employer.created');
      expect(event.data.attributes.employerId).toBe('er_123');
    });

    it('throws for an invalid signature', () => {
      const raw = JSON.stringify(employerCreated());
      expect(() =>
        verifySalsaWebhook(raw, { 'webhook-id': 'x', 'webhook-timestamp': String(now()), 'webhook-signature': 'v1,AAAA' })
      ).toThrow();
    });
  });

  describe('resolveSignatureHeaders', () => {
    it('maps svix-* headers to the webhook-* names when webhook-id is absent', () => {
      const h = { 'svix-id': 'a', 'svix-timestamp': '1', 'svix-signature': 'v1,x' };
      expect(resolveSignatureHeaders((n) => h[n])).toEqual({
        'webhook-id': 'a',
        'webhook-timestamp': '1',
        'webhook-signature': 'v1,x',
      });
    });

    it('returns null when a header is missing', () => {
      const h = { 'webhook-id': 'a', 'webhook-timestamp': '1' };
      expect(resolveSignatureHeaders((n) => h[n])).toBeNull();
    });
  });

  it('serves a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
