const request = require('supertest');

const SECRET = 'configcat_whsk_VN3juirnVh5pNvCKd81RYRYchxUX4j3NykbZG2fAy88=';
process.env.CONFIGCAT_WEBHOOK_SECRET = SECRET;

const { app, computeSignature, verifyConfigCatWebhook } = require('../src/index');

// Published vector from ConfigCat's docs (also verified against Hookdeck's CONFIGCAT source)
const VECTOR = {
  body: 'examplebody',
  id: 'b616ca659d154a5fb907dd8475792eeb',
  timestamp: '1669629035',
  signature: 'Ks3cYsu9Lslfo+hVxNC3oQWnsF9e5d73TI5t94D9DRA=',
};

function sign(body, id = 'wh-1', timestamp = String(Math.floor(Date.now() / 1000))) {
  const raw = Buffer.isBuffer(body) ? body : Buffer.from(body);
  return {
    'x-configcat-webhook-id': id,
    'x-configcat-webhook-timestamp': timestamp,
    'x-configcat-webhook-signature-v1': computeSignature(SECRET, id, timestamp, raw),
  };
}

describe('published test vector', () => {
  it('computes the documented signature', () => {
    expect(computeSignature(SECRET, VECTOR.id, VECTOR.timestamp, Buffer.from(VECTOR.body)))
      .toBe(VECTOR.signature);
  });

  it('accepts the documented headers', () => {
    const result = verifyConfigCatWebhook({
      rawBody: Buffer.from(VECTOR.body),
      webhookId: VECTOR.id,
      timestamp: VECTOR.timestamp,
      signature: VECTOR.signature,
      secret: SECRET,
    });
    expect(result.valid).toBe(true);
  });

  it('is accepted over HTTP', async () => {
    const res = await request(app)
      .post('/webhooks/configcat')
      .set('content-type', 'text/plain')
      .set({
        'x-configcat-webhook-id': VECTOR.id,
        'x-configcat-webhook-timestamp': VECTOR.timestamp,
        'x-configcat-webhook-signature-v1': VECTOR.signature,
      })
      .send(VECTOR.body);
    expect(res.status).toBe(200);
  });
});

describe('POST /webhooks/configcat', () => {
  afterEach(() => {
    delete process.env.CONFIGCAT_WEBHOOK_TOLERANCE_SECONDS;
  });

  it('accepts a signed JSON body', async () => {
    const body = JSON.stringify({ config: 'Main', environment: 'Production' });
    const res = await request(app)
      .post('/webhooks/configcat')
      .set('content-type', 'application/json')
      .set(sign(body))
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts a signed non-JSON body of any content type', async () => {
    const body = 'Main changed in Production';
    const res = await request(app)
      .post('/webhooks/configcat')
      .set('content-type', 'application/octet-stream')
      .set(sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('verifies exact bytes, including non-UTF-8 bodies', async () => {
    const body = Buffer.from([0xff, 0xfe, 0x00, 0x7b, 0x80]);
    const res = await request(app)
      .post('/webhooks/configcat')
      .set('content-type', 'application/octet-stream')
      .set(sign(body))
      .send(body);
    expect(res.status).toBe(200);
  });

  it('accepts a signed GET with no body (id + timestamp only)', async () => {
    const res = await request(app).get('/webhooks/configcat').set(sign(''));
    expect(res.status).toBe(200);
  });

  it.each(['put', 'patch', 'delete'])('accepts a signed %s', async (method) => {
    const res = await request(app)[method]('/webhooks/configcat').set(sign('')).send();
    expect(res.status).toBe(200);
  });

  it('rejects an unsigned request', async () => {
    const res = await request(app).post('/webhooks/configcat').set('content-type', 'application/json').send('{}');
    expect(res.status).toBe(401);
  });

  it('rejects a body changed after signing', async () => {
    const res = await request(app)
      .post('/webhooks/configcat')
      .set('content-type', 'application/json')
      .set(sign('{"a":1}'))
      .send('{"a":2}');
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with another key', async () => {
    const headers = sign('{}');
    headers['x-configcat-webhook-signature-v1'] = computeSignature('configcat_whsk_other', 'wh-1', headers['x-configcat-webhook-timestamp'], Buffer.from('{}'));
    const res = await request(app).post('/webhooks/configcat').set('content-type', 'application/json').set(headers).send('{}');
    expect(res.status).toBe(401);
  });

  it('rejects two comma-separated signatures (single key only)', async () => {
    const headers = sign('{}');
    headers['x-configcat-webhook-signature-v1'] = `${headers['x-configcat-webhook-signature-v1']},${VECTOR.signature}`;
    const res = await request(app).post('/webhooks/configcat').set('content-type', 'application/json').set(headers).send('{}');
    expect(res.status).toBe(401);
  });

  it('rejects malformed signatures', async () => {
    for (const bad of ['', 'abc', VECTOR.signature.slice(0, -1), VECTOR.signature.replace('=', 'A') + 'A', `v1=${VECTOR.signature}`]) {
      const headers = { ...sign('{}'), 'x-configcat-webhook-signature-v1': bad };
      const res = await request(app).post('/webhooks/configcat').set('content-type', 'application/json').set(headers).send('{}');
      expect(res.status).toBe(401);
    }
  });

  it('compares base64 case-sensitively', () => {
    const result = verifyConfigCatWebhook({
      rawBody: Buffer.from(VECTOR.body),
      webhookId: VECTOR.id,
      timestamp: VECTOR.timestamp,
      signature: VECTOR.signature.replace('Ks3c', 'kS3C'),
      secret: SECRET,
    });
    expect(result.valid).toBe(false);
  });

  it('ignores old timestamps by default', async () => {
    const res = await request(app)
      .post('/webhooks/configcat')
      .set('content-type', 'application/json')
      .set(sign('{}', 'wh-old', '1669629035'))
      .send('{}');
    expect(res.status).toBe(200);
  });

  it('rejects old timestamps when the tolerance is set', async () => {
    process.env.CONFIGCAT_WEBHOOK_TOLERANCE_SECONDS = '300';
    const old = await request(app)
      .post('/webhooks/configcat')
      .set('content-type', 'application/json')
      .set(sign('{}', 'wh-old', '1669629035'))
      .send('{}');
    expect(old.status).toBe(401);
    const fresh = await request(app)
      .post('/webhooks/configcat')
      .set('content-type', 'application/json')
      .set(sign('{}'))
      .send('{}');
    expect(fresh.status).toBe(200);
  });
});
