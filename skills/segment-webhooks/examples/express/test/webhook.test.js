const request = require('supertest');
const crypto = require('crypto');

// Segment shared secrets are any string you choose in Destination Settings
process.env.SEGMENT_SHARED_SECRET = 'test_segment_shared_secret';

const { app, verifySegmentSignature } = require('../src/index');

const SECRET = process.env.SEGMENT_SHARED_SECRET;

/**
 * Sign like Segment: hex(HMAC-SHA1(secret, content))
 */
function sign(content, secret = SECRET) {
  return crypto.createHmac('sha1', secret).update(content, 'utf8').digest('hex');
}

const trackEvent = {
  type: 'track',
  messageId: 'msg-track-1',
  userId: '019mr8mf4r',
  event: 'Purchased an Item',
  properties: { revenue: '39.95', shippingMethod: '2-day' },
  timestamp: '2012-12-02T00:30:08.276Z',
};

const identifyEvent = {
  type: 'identify',
  messageId: 'msg-identify-1',
  userId: '019mr8mf4r',
  traits: { email: 'achilles@segment.com', name: 'Achilles', name_ja: 'アキレス' },
  timestamp: '2012-12-02T00:30:08.276Z',
};

function post(body, signature) {
  const req = request(app)
    .post('/webhooks/segment')
    .set('Content-Type', 'application/json');
  if (signature) req.set('X-Signature', signature);
  return req.send(body);
}

describe('verifySegmentSignature', () => {
  it('accepts a valid signature over the raw body', () => {
    const body = JSON.stringify(trackEvent);
    expect(verifySegmentSignature(Buffer.from(body), sign(body), SECRET)).toBe(true);
  });

  it('produces a 40-char hex HMAC-SHA1 digest', () => {
    expect(sign('{}')).toMatch(/^[a-f0-9]{40}$/);
  });

  it('rejects a SHA-256 signature', () => {
    const body = JSON.stringify(trackEvent);
    const sha256 = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    expect(verifySegmentSignature(Buffer.from(body), sha256, SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const body = JSON.stringify(trackEvent);
    const tampered = body.replace('39.95', '0.01');
    expect(verifySegmentSignature(Buffer.from(tampered), sign(body), SECRET)).toBe(false);
  });

  it('rejects the wrong secret', () => {
    const body = JSON.stringify(trackEvent);
    expect(verifySegmentSignature(Buffer.from(body), sign(body, 'wrong'), SECRET)).toBe(false);
  });

  it('rejects missing signature or secret', () => {
    const body = Buffer.from(JSON.stringify(trackEvent));
    expect(verifySegmentSignature(body, undefined, SECRET)).toBe(false);
    expect(verifySegmentSignature(body, sign(body), undefined)).toBe(false);
  });

  it('accepts a batch signed over the first event only', () => {
    const batch = [trackEvent, identifyEvent];
    const body = JSON.stringify(batch);
    const signature = sign(JSON.stringify(batch[0]));
    expect(verifySegmentSignature(Buffer.from(body), signature, SECRET)).toBe(true);
  });

  it('rejects a batch when the signature covers a different event', () => {
    const body = JSON.stringify([trackEvent, identifyEvent]);
    expect(verifySegmentSignature(Buffer.from(body), sign(JSON.stringify(identifyEvent)), SECRET)).toBe(false);
  });

  it('rejects an empty batch', () => {
    expect(verifySegmentSignature(Buffer.from('[]'), sign('undefined'), SECRET)).toBe(false);
  });
});

describe('POST /webhooks/segment', () => {
  it('returns 400 when X-Signature is missing', async () => {
    const res = await post(JSON.stringify(trackEvent));
    expect(res.status).toBe(400);
    expect(res.text).toBe('Missing X-Signature header');
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await post(JSON.stringify(trackEvent), 'a'.repeat(40));
    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('returns 400 for a malformed signature', async () => {
    const res = await post(JSON.stringify(trackEvent), 'not-hex');
    expect(res.status).toBe(400);
  });

  it.each([
    ['track', trackEvent],
    ['identify', identifyEvent],
    ['page', { type: 'page', userId: 'u1', properties: { path: '/pricing' } }],
    ['screen', { type: 'screen', userId: 'u1', name: 'Main Screen' }],
    ['group', { type: 'group', userId: 'u1', groupId: 'g1', traits: { name: 'Initech' } }],
    ['alias', { type: 'alias', previousId: 'anon-1', userId: 'u1' }],
    ['delete', { type: 'delete', userId: 'u1' }],
  ])('accepts a signed %s call', async (_type, event) => {
    const body = JSON.stringify(event);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, count: 1 });
  });

  it('accepts a signed batched delivery', async () => {
    const batch = [identifyEvent, trackEvent, { type: 'page', name: 'Home' }];
    const res = await post(JSON.stringify(batch), sign(JSON.stringify(batch[0])));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, count: 3 });
  });

  it('rejects a batch whose first event was altered', async () => {
    const batch = [trackEvent, identifyEvent];
    const signature = sign(JSON.stringify(batch[0]));
    const tampered = [{ ...trackEvent, event: 'Refunded' }, identifyEvent];
    const res = await post(JSON.stringify(tampered), signature);
    expect(res.status).toBe(400);
  });

  it('documents the caveat: a raw-body HMAC does not match a Segment batch signature', () => {
    const batch = [trackEvent, identifyEvent];
    expect(sign(JSON.stringify(batch))).not.toBe(sign(JSON.stringify(batch[0])));
  });

  it('returns 500 when the secret is not configured', async () => {
    const saved = process.env.SEGMENT_SHARED_SECRET;
    delete process.env.SEGMENT_SHARED_SECRET;
    try {
      const body = JSON.stringify(trackEvent);
      const res = await post(body, sign(body, saved));
      expect(res.status).toBe(500);
    } finally {
      process.env.SEGMENT_SHARED_SECRET = saved;
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
