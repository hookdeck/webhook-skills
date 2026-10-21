const request = require('supertest');
const crypto = require('crypto');

// Atlas Webhook Secrets are any string you choose; used as a raw string key
process.env.MONGODB_ATLAS_WEBHOOK_SECRET = 'test_atlas_webhook_secret';

const { app, verifyAtlasSignature } = require('../src/index');

const SECRET = process.env.MONGODB_ATLAS_WEBHOOK_SECRET;

/**
 * Sign like Atlas: base64(HMAC-SHA1(secret, raw body))
 */
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha1', secret).update(body).digest('base64');
}

const metricAlert = {
  id: '5d1b6f8e8c2e4e2d3c4a5b6c',
  groupId: '5d1b6f8e8c2e4e2d3c4a5b6d',
  eventTypeName: 'OUTSIDE_METRIC_THRESHOLD',
  status: 'OPEN',
  created: '2024-01-15T10:30:00Z',
  updated: '2024-01-15T10:30:00Z',
  humanReadable: 'Disk space used on data partition is 95.2%. Project: MyProject Organization: MyOrganization',
  metricName: 'DISK_PARTITION_SPACE_USED_DATA',
  currentValue: { number: 95.2, units: 'RAW' },
};

const hostDownAlert = {
  id: '5d1b6f8e8c2e4e2d3c4a5b6e',
  groupId: '5d1b6f8e8c2e4e2d3c4a5b6d',
  eventTypeName: 'HOST_DOWN',
  status: 'CLOSED',
  humanReadable: 'Host is down',
};

function post(body, signature, event = 'alert.open') {
  const req = request(app)
    .post('/webhooks/mongodb-atlas')
    .set('Content-Type', 'application/json')
    .set('X-MMS-Event', event);
  if (signature) req.set('X-MMS-Signature', signature);
  return req.send(body);
}

describe('verifyAtlasSignature', () => {
  it('accepts a valid signature over the raw body', () => {
    const body = JSON.stringify(metricAlert);
    expect(verifyAtlasSignature(Buffer.from(body), sign(body), SECRET)).toBe(true);
  });

  it('produces a 28-char base64 HMAC-SHA1 digest', () => {
    expect(sign('{}')).toMatch(/^[A-Za-z0-9+/]{27}=$/);
  });

  it('rejects a hex-encoded signature', () => {
    const body = JSON.stringify(metricAlert);
    const hex = crypto.createHmac('sha1', SECRET).update(body).digest('hex');
    expect(verifyAtlasSignature(Buffer.from(body), hex, SECRET)).toBe(false);
  });

  it('rejects a SHA-256 signature', () => {
    const body = JSON.stringify(metricAlert);
    const sha256 = crypto.createHmac('sha256', SECRET).update(body).digest('base64');
    expect(verifyAtlasSignature(Buffer.from(body), sha256, SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const body = JSON.stringify(metricAlert);
    const tampered = body.replace('95.2', '1.0');
    expect(verifyAtlasSignature(Buffer.from(tampered), sign(body), SECRET)).toBe(false);
  });

  it('rejects the wrong secret', () => {
    const body = JSON.stringify(metricAlert);
    expect(verifyAtlasSignature(Buffer.from(body), sign(body, 'wrong'), SECRET)).toBe(false);
  });

  it('rejects missing signature or secret', () => {
    const body = Buffer.from(JSON.stringify(metricAlert));
    expect(verifyAtlasSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyAtlasSignature(body, sign(body), undefined)).toBe(false);
  });
});

describe('POST /webhooks/mongodb-atlas', () => {
  it('returns 400 when X-MMS-Signature is missing', async () => {
    const res = await post(JSON.stringify(metricAlert));
    expect(res.status).toBe(400);
    expect(res.text).toBe('Missing X-MMS-Signature header');
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await post(JSON.stringify(metricAlert), 'AAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('returns 400 for a malformed signature', async () => {
    const res = await post(JSON.stringify(metricAlert), 'not-base64');
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON with a valid signature', async () => {
    const body = 'not json';
    const res = await post(body, sign(body));
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid JSON');
  });

  it.each([
    ['OUTSIDE_METRIC_THRESHOLD', metricAlert, 'alert.open'],
    ['HOST_DOWN', hostDownAlert, 'alert.close'],
    ['unknown event type', { id: 'x', eventTypeName: 'SOMETHING_ELSE', status: 'OPEN' }, 'alert.update'],
  ])('accepts a signed %s alert', async (_name, alert, event) => {
    const body = JSON.stringify(alert);
    const res = await post(body, sign(body), event);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('returns 500 when the secret is not configured', async () => {
    const saved = process.env.MONGODB_ATLAS_WEBHOOK_SECRET;
    delete process.env.MONGODB_ATLAS_WEBHOOK_SECRET;
    try {
      const body = JSON.stringify(metricAlert);
      const res = await post(body, sign(body, saved));
      expect(res.status).toBe(500);
    } finally {
      process.env.MONGODB_ATLAS_WEBHOOK_SECRET = saved;
    }
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
