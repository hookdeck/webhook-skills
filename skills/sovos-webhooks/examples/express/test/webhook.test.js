import request from 'supertest';
import crypto from 'node:crypto';

// Svix secrets are 'whsec_' + base64(key). base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';
process.env.SOVOS_WEBHOOK_SECRET = TEST_SECRET;
process.env.PORT = '0';

// Import after the env is set: the app reads it per request, the server reads PORT at startup.
const { app, server } = await import('../src/index.js');

// Sign exactly as Svix does: base64(HMAC_SHA256(base64Decode(secret after whsec_), "id.timestamp.body"))
function sign(payload, timestamp, msgId, secret = TEST_SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${sig}`;
}

function notification(eventType) {
  return JSON.stringify({
    appPrefix: 'DLT',
    contentUrl: 'https://uat-einvoicing-api-emea.sovos.com/download/api/v1/download/notification/abc',
    correlationId: '822431a1-ef99-4ef7-8dfa-38f9c6b6b0af',
    createdDate: 1770290583638,
    eventType,
    metadata: {
      documentId: '4e9528cdc7cbe2e5444a70b9a4314bcb',
      erpDocumentId: '#BC-UAT-MOCK582230',
      erpSystemId: 'TestSystemId',
      processType: '0',
      productId: 'WA_SPARK__2.0',
      sciCloudStatusCode: '100',
      sciGovtStatusCode: null,
      sciResponseCode: 'IP',
      sciStatusAction: 'NOA',
    },
    notificationId: 'bd92d169-7ec0-4f21-a7eb-e2238070d9d7',
    orgId: 'faf412ed-bb3f-4e2c-9c7e-6bcf280e1ccf',
  });
}

function signedPost(payload, { timestamp, msgId, signature } = {}) {
  const ts = timestamp || Math.floor(Date.now() / 1000).toString();
  const id = msgId || 'msg_' + crypto.randomBytes(12).toString('hex');
  return request(app)
    .post('/webhooks/sovos')
    .set('Content-Type', 'application/json')
    .set('svix-id', id)
    .set('svix-timestamp', ts)
    .set('svix-signature', signature || sign(payload, ts, id))
    .send(payload);
}

describe('Sovos webhook handler', () => {
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test('accepts a validly signed document.received notification', async () => {
    const res = await signedPost(notification('document.received'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, eventType: 'document.received' });
  });

  test.each(['document.received', 'document.completed', 'workflow.completed', 'system.error'])(
    'handles %s',
    async (eventType) => {
      const res = await signedPost(notification(eventType));
      expect(res.status).toBe(200);
      expect(res.body.eventType).toBe(eventType);
    }
  );

  test('accepts unknown event types', async () => {
    const res = await signedPost(notification('document.some_future_event'));
    expect(res.status).toBe(200);
  });

  test('accepts when any of several signatures matches (secret rotation)', async () => {
    const payload = notification('document.received');
    const ts = Math.floor(Date.now() / 1000).toString();
    const id = 'msg_rotation';
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= ${sign(payload, ts, id)}`;
    const res = await signedPost(payload, { timestamp: ts, msgId: id, signature });
    expect(res.status).toBe(200);
  });

  test('rejects missing svix headers', async () => {
    const res = await request(app)
      .post('/webhooks/sovos')
      .set('Content-Type', 'application/json')
      .send(notification('document.received'));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await signedPost(notification('document.received'), {
      signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = notification('document.received');
    const ts = Math.floor(Date.now() / 1000).toString();
    const signature = sign(payload, ts, 'msg_1', 'whsec_' + Buffer.from('other_key').toString('base64'));
    const res = await signedPost(payload, { timestamp: ts, msgId: 'msg_1', signature });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const payload = notification('document.received');
    const ts = Math.floor(Date.now() / 1000).toString();
    const signature = sign(payload, ts, 'msg_1');
    const res = await signedPost(payload.replace('IP', 'AP'), { timestamp: ts, msgId: 'msg_1', signature });
    expect(res.status).toBe(400);
  });

  test('rejects a timestamp outside the 5-minute window', async () => {
    const payload = notification('document.received');
    const ts = (Math.floor(Date.now() / 1000) - 600).toString();
    const res = await signedPost(payload, { timestamp: ts, msgId: 'msg_old', signature: sign(payload, ts, 'msg_old') });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp too old');
  });

  test('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
