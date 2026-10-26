const request = require('supertest');
const crypto = require('crypto');

// TheirStack signing secrets are any string of 16+ characters
const SECRET = 'test_theirstack_signing_secret';
process.env.THEIRSTACK_WEBHOOK_SECRET = SECRET;

const { app, verifyTheirStackWebhook } = require('../src/index');

function sign(payload, secret = SECRET) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

describe('verifyTheirStackWebhook', () => {
  // Test vector from TheirStack's "Verify webhook signatures" docs
  const DOC_SECRET = "It's a Secret to Everybody";
  const DOC_PAYLOAD = 'Hello, World!';
  const DOC_SIGNATURE = 'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17';

  it('reproduces the documented test vector', () => {
    expect(sign(DOC_PAYLOAD, DOC_SECRET)).toBe(DOC_SIGNATURE);
    expect(verifyTheirStackWebhook(Buffer.from(DOC_PAYLOAD), DOC_SIGNATURE, DOC_SECRET)).toBe(true);
  });

  it('accepts an uppercase hex digest', () => {
    const header = 'sha256=' + DOC_SIGNATURE.slice(7).toUpperCase();
    expect(verifyTheirStackWebhook(Buffer.from(DOC_PAYLOAD), header, DOC_SECRET)).toBe(true);
  });

  it('rejects a missing header', () => {
    expect(verifyTheirStackWebhook(Buffer.from(DOC_PAYLOAD), undefined, DOC_SECRET)).toBe(false);
  });

  it('rejects a header without the sha256= prefix', () => {
    expect(verifyTheirStackWebhook(Buffer.from(DOC_PAYLOAD), DOC_SIGNATURE.slice(7), DOC_SECRET)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    expect(verifyTheirStackWebhook(Buffer.from(DOC_PAYLOAD), DOC_SIGNATURE, 'another secret value')).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyTheirStackWebhook(Buffer.from('Hello, World?'), DOC_SIGNATURE, DOC_SECRET)).toBe(false);
  });

  it('rejects non-64-char or non-hex digests', () => {
    const body = Buffer.from(DOC_PAYLOAD);
    expect(verifyTheirStackWebhook(body, DOC_SIGNATURE.slice(0, -2), DOC_SECRET)).toBe(false);
    expect(verifyTheirStackWebhook(body, DOC_SIGNATURE + '00', DOC_SECRET)).toBe(false);
    expect(verifyTheirStackWebhook(body, 'sha256=' + 'zz'.repeat(32), DOC_SECRET)).toBe(false);
  });

  it('rejects a missing secret', () => {
    expect(verifyTheirStackWebhook(Buffer.from(DOC_PAYLOAD), DOC_SIGNATURE, undefined)).toBe(false);
  });
});

describe('POST /webhooks/theirstack', () => {
  const events = {
    'job.new': { id: 1, type: 'job.new', payload: { id: 123, job_title: 'Senior Data Engineer', company_domain: 'acme.com' } },
    'company.new': { id: 2, type: 'company.new', payload: { name: 'Acme', domain: 'acme.com' } },
    'job.closed': { id: 3, type: 'job.closed', payload: { id: 123, closed_at: '2026-06-08T14:00:00Z' } },
    'tech.new': { id: 4, type: 'tech.new', payload: { name: 'Acme' } },
  };

  for (const [name, body] of Object.entries(events)) {
    it(`accepts a signed ${name} event`, async () => {
      const raw = JSON.stringify(body);
      const res = await request(app)
        .post('/webhooks/theirstack')
        .set('Content-Type', 'application/json')
        .set('X-TheirStack-Signature-256', sign(raw))
        .send(raw);
      expect(res.status).toBe(200);
    });
  }

  it('verifies regardless of content type', async () => {
    const raw = JSON.stringify(events['job.new']);
    const res = await request(app)
      .post('/webhooks/theirstack')
      .set('Content-Type', 'text/plain')
      .set('X-TheirStack-Signature-256', sign(raw))
      .send(raw);
    expect(res.status).toBe(200);
  });

  it('returns 401 when the header is missing (unsigned delivery)', async () => {
    const res = await request(app)
      .post('/webhooks/theirstack')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(events['job.new']));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a wrong signature', async () => {
    const raw = JSON.stringify(events['job.new']);
    const res = await request(app)
      .post('/webhooks/theirstack')
      .set('Content-Type', 'application/json')
      .set('X-TheirStack-Signature-256', sign(raw, 'a different secret value'))
      .send(raw);
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const raw = 'not json';
    const res = await request(app)
      .post('/webhooks/theirstack')
      .set('Content-Type', 'text/plain')
      .set('X-TheirStack-Signature-256', sign(raw))
      .send(raw);
    expect(res.status).toBe(400);
  });

  it('acknowledges unknown event types', async () => {
    const raw = JSON.stringify({ id: 9, type: 'something.else', payload: {} });
    const res = await request(app)
      .post('/webhooks/theirstack')
      .set('Content-Type', 'application/json')
      .set('X-TheirStack-Signature-256', sign(raw))
      .send(raw);
    expect(res.status).toBe(200);
  });
});
