const request = require('supertest');
const crypto = require('crypto');

// Set test environment variables before importing app.
// Verifier Tokens are opaque strings used directly as the HMAC key (no prefix, no decoding).
process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN = 'test_verifier_token_0a1b2c3d';

const { app, verifyQuickBooksSignature, normalizeEvents } = require('../src/index');

const verifierToken = process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN;

/**
 * Generate a valid intuit-signature: base64(HMAC-SHA256(rawBody, verifierToken))
 */
function generateQuickBooksSignature(payload, token) {
  return crypto.createHmac('sha256', token).update(payload, 'utf8').digest('base64');
}

function cloudEvent(type, overrides = {}) {
  return {
    specversion: '1.0',
    id: crypto.randomUUID(),
    source: 'intuit.dsnBgbseACLLRZNxo2dfc4evmEJdxde58xeeYcZliOU=',
    type,
    datacontenttype: 'application/json',
    time: '2026-09-10T21:31:25Z',
    intuitentityid: '1234',
    intuitaccountid: '310687',
    data: {},
    ...overrides,
  };
}

function legacyPayload(operation = 'Create', name = 'Customer') {
  return {
    eventNotifications: [
      {
        realmId: '310687',
        dataChangeEvent: {
          entities: [{ name, id: '1', operation, lastUpdated: '2025-10-05T14:42:19-0700' }],
        },
      },
    ],
  };
}

function post(body, signature) {
  const req = request(app)
    .post('/webhooks/quickbooks')
    .set('Content-Type', 'application/json; charset=utf-8');
  if (signature !== undefined) req.set('intuit-signature', signature);
  return req.send(body);
}

describe('verifyQuickBooksSignature', () => {
  it('returns true for a valid signature', () => {
    const body = Buffer.from('[{"type":"qbo.invoice.created.v1"}]');
    expect(verifyQuickBooksSignature(body, generateQuickBooksSignature(body, verifierToken), verifierToken)).toBe(true);
  });

  it('matches the signature format from Intuit docs (base64, 44 chars)', () => {
    const sig = generateQuickBooksSignature('{}', verifierToken);
    expect(sig).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  });

  it('returns false for an invalid signature', () => {
    expect(verifyQuickBooksSignature(Buffer.from('{}'), 'invalid', verifierToken)).toBe(false);
  });

  it('returns false for a hex-encoded signature', () => {
    const hex = crypto.createHmac('sha256', verifierToken).update('{}').digest('hex');
    expect(verifyQuickBooksSignature(Buffer.from('{}'), hex, verifierToken)).toBe(false);
  });

  it('returns false for a tampered body', () => {
    const sig = generateQuickBooksSignature('{"amount":100}', verifierToken);
    expect(verifyQuickBooksSignature(Buffer.from('{"amount":999}'), sig, verifierToken)).toBe(false);
  });

  it('returns false for the wrong verifier token', () => {
    const sig = generateQuickBooksSignature('{}', 'other_token');
    expect(verifyQuickBooksSignature(Buffer.from('{}'), sig, verifierToken)).toBe(false);
  });

  it('returns false when the signature is missing', () => {
    expect(verifyQuickBooksSignature(Buffer.from('{}'), undefined, verifierToken)).toBe(false);
  });
});

describe('normalizeEvents', () => {
  it('parses CloudEvents type into entity and action', () => {
    const [event] = normalizeEvents([cloudEvent('qbo.salesreceipt.updated.v1', { intuitentityid: '150' })]);
    expect(event).toMatchObject({ entity: 'salesreceipt', action: 'updated', entityId: '150', realmId: '310687' });
  });

  it('maps legacy operations to CloudEvents event names', () => {
    const [event] = normalizeEvents(legacyPayload('Merge'));
    expect(event).toMatchObject({ type: 'qbo.customer.merged.v1', entity: 'customer', action: 'merged', realmId: '310687' });
  });

  it('returns null for an unrecognized shape', () => {
    expect(normalizeEvents({ foo: 'bar' })).toBeNull();
  });
});

describe('POST /webhooks/quickbooks', () => {
  it('returns 400 when intuit-signature is missing', async () => {
    const res = await post(JSON.stringify([cloudEvent('qbo.invoice.created.v1')]));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await post(JSON.stringify([cloudEvent('qbo.invoice.created.v1')]), 'aW52YWxpZA==');
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('returns 200 for a valid CloudEvents notification', async () => {
    const body = JSON.stringify([cloudEvent('qbo.invoice.created.v1')]);
    const res = await post(body, generateQuickBooksSignature(body, verifierToken));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, count: 1 });
  });

  it('returns 200 when the CloudEvents notification uses a non-JSON content type', async () => {
    const body = JSON.stringify([cloudEvent('qbo.invoice.created.v1')]);
    const res = await request(app)
      .post('/webhooks/quickbooks')
      .set('Content-Type', 'application/cloudevents-batch+json')
      .set('intuit-signature', generateQuickBooksSignature(body, verifierToken))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, count: 1 });
  });

  it('handles events for multiple companies in one notification', async () => {
    const body = JSON.stringify([
      cloudEvent('qbo.invoice.created.v1', { intuitaccountid: '111' }),
      cloudEvent('qbo.payment.created.v1', { intuitaccountid: '222' }),
      cloudEvent('qbo.customer.merged.v1', { intuitaccountid: '333', data: { deletedid: '27' } }),
    ]);
    const res = await post(body, generateQuickBooksSignature(body, verifierToken));
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
  });

  it.each([
    'qbo.invoice.created.v1',
    'qbo.invoice.updated.v1',
    'qbo.invoice.deleted.v1',
    'qbo.invoice.voided.v1',
    'qbo.invoice.emailed.v1',
    'qbo.payment.created.v1',
    'qbo.customer.created.v1',
    'qbo.customer.updated.v1',
    'qbo.customer.merged.v1',
    'qbo.salesreceipt.updated.v1',
    'qbo.employee.created.v1',
  ])('accepts %s', async (type) => {
    const body = JSON.stringify([cloudEvent(type)]);
    const res = await post(body, generateQuickBooksSignature(body, verifierToken));
    expect(res.status).toBe(200);
  });

  it('accepts events without a data field', async () => {
    const event = cloudEvent('qbo.salesreceipt.updated.v1');
    delete event.data;
    delete event.datacontenttype;
    const body = JSON.stringify([event]);
    const res = await post(body, generateQuickBooksSignature(body, verifierToken));
    expect(res.status).toBe(200);
  });

  it('returns 200 for a valid legacy eventNotifications payload', async () => {
    const body = JSON.stringify(legacyPayload('Update', 'Invoice'));
    const res = await post(body, generateQuickBooksSignature(body, verifierToken));
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  it('verifies against the raw bytes, not re-serialized JSON', async () => {
    // Whitespace that JSON.stringify would drop must still verify
    const body = '[ {"type": "qbo.invoice.created.v1", "intuitentityid": "1", "intuitaccountid": "2"} ]';
    const res = await post(body, generateQuickBooksSignature(body, verifierToken));
    expect(res.status).toBe(200);
  });

  it('returns 400 for a validly signed but unrecognized payload', async () => {
    const body = JSON.stringify({ hello: 'world' });
    const res = await post(body, generateQuickBooksSignature(body, verifierToken));
    expect(res.status).toBe(400);
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
