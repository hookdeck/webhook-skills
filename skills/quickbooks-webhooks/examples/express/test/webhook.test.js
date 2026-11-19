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

// Exact bodies of two live test deliveries from the Intuit Developer portal's
// "Send test events" (November 2026), one per payload format. The real verifier token
// isn't recorded, so the tests sign these bytes with the test token.
const CAPTURED_LEGACY_BODY =
  '{"eventNotifications":[{"realmId":"310687","dataChangeEvent":{"entities":[{"id":"1234","operation":"Create","name":"Account","lastUpdated":"2026-11-18T16:08:22.702Z"}]}}]}';
const CAPTURED_CLOUDEVENTS_BODY =
  '[{"specversion":"1.0","id":"fb16f042-7faa-4897-b9a2-bed048bc3078","source":"intuit.dsnBgbseACLLRZNxo2dfc4evmEJdxde58xeeYcZliOU=","type":"qbo.invoice.created.v1","datacontenttype":"application/json","time":"2026-11-18T16:10:06.261845232Z","intuitentityid":"1234","intuitaccountid":"310687","data":{}}]';

function post(body, signature) {
  const req = request(app)
    .post('/webhooks/quickbooks')
    .set('Content-Type', 'application/json; charset=utf-8');
  if (signature !== undefined) req.set('intuit-signature', signature);
  return req.send(body);
}

describe('verifyQuickBooksSignature', () => {
  it('returns true for a valid signature', () => {
    const body = Buffer.from('[{"type":"qbo.account.created.v1"}]');
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

  it.each([
    ['Delete', 'deleted'],
    ['Void', 'void'],
    ['Emailed', 'emailed'],
  ])('maps legacy %s to the CloudEvents spelling %s', (operation, action) => {
    const [event] = normalizeEvents(legacyPayload(operation, 'Invoice'));
    expect(event).toMatchObject({ type: `qbo.invoice.${action}.v1`, action });
  });

  it('normalizes the captured legacy body', () => {
    expect(normalizeEvents(JSON.parse(CAPTURED_LEGACY_BODY))).toEqual([
      expect.objectContaining({ type: 'qbo.account.created.v1', entity: 'account', action: 'created', entityId: '1234', realmId: '310687' }),
    ]);
  });

  it('normalizes the captured CloudEvents array', () => {
    expect(normalizeEvents(JSON.parse(CAPTURED_CLOUDEVENTS_BODY))).toEqual([
      expect.objectContaining({ type: 'qbo.invoice.created.v1', entity: 'invoice', action: 'created', entityId: '1234', realmId: '310687', data: {} }),
    ]);
  });

  it('returns null for an unrecognized shape', () => {
    expect(normalizeEvents({ foo: 'bar' })).toBeNull();
  });

  it('returns null for a single CloudEvent that is not wrapped in an array', () => {
    expect(normalizeEvents(JSON.parse(CAPTURED_CLOUDEVENTS_BODY)[0])).toBeNull();
  });
});

describe('POST /webhooks/quickbooks', () => {
  it('returns 400 when intuit-signature is missing', async () => {
    const res = await post(JSON.stringify([cloudEvent('qbo.account.created.v1')]));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await post(JSON.stringify([cloudEvent('qbo.account.created.v1')]), 'aW52YWxpZA==');
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('returns 200 for a valid CloudEvents notification', async () => {
    const body = JSON.stringify([cloudEvent('qbo.account.created.v1')]);
    const res = await post(body, generateQuickBooksSignature(body, verifierToken));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, count: 1 });
  });

  it('returns 200 when the CloudEvents notification uses a non-JSON content type', async () => {
    const body = JSON.stringify([cloudEvent('qbo.account.created.v1')]);
    const res = await request(app)
      .post('/webhooks/quickbooks')
      .set('Content-Type', 'application/cloudevents-batch+json')
      .set('intuit-signature', generateQuickBooksSignature(body, verifierToken))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, count: 1 });
  });

  it('accepts the captured CloudEvents array sent as application/cloudevents-batch+json', async () => {
    const res = await request(app)
      .post('/webhooks/quickbooks')
      .set('Content-Type', 'application/cloudevents-batch+json; charset=utf-8')
      .set('intuit-notification-schema-version', '2.0')
      .set('intuit-signature-algorithm', 'HMAC-SHA256')
      .set('intuit-signature', generateQuickBooksSignature(CAPTURED_CLOUDEVENTS_BODY, verifierToken))
      .send(CAPTURED_CLOUDEVENTS_BODY);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, count: 1 });
  });

  it('accepts the captured legacy body sent as application/json', async () => {
    const res = await post(CAPTURED_LEGACY_BODY, generateQuickBooksSignature(CAPTURED_LEGACY_BODY, verifierToken));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, count: 1 });
  });

  it('returns 400 for a validly signed single CloudEvent object (not an array)', async () => {
    const body = JSON.stringify(JSON.parse(CAPTURED_CLOUDEVENTS_BODY)[0]);
    const res = await post(body, generateQuickBooksSignature(body, verifierToken));
    expect(res.status).toBe(400);
  });

  it('handles events for multiple companies in one notification', async () => {
    const body = JSON.stringify([
      cloudEvent('qbo.account.created.v1', { intuitaccountid: '111' }),
      cloudEvent('qbo.employee.created.v1', { intuitaccountid: '222' }),
      cloudEvent('qbo.customer.merged.v1', { intuitaccountid: '333', data: { deletedid: '27' } }),
    ]);
    const res = await post(body, generateQuickBooksSignature(body, verifierToken));
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
  });

  it.each([
    'qbo.account.created.v1',
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
    const body = '[ {"type": "qbo.account.created.v1", "intuitentityid": "1", "intuitaccountid": "2"} ]';
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
