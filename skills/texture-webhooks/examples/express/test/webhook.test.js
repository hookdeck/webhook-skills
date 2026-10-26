const crypto = require('crypto');
const request = require('supertest');

// Texture secrets are plain strings. This one looks like a Standard Webhooks key but is used whole.
const SECRET = 'whsec_my-webhook-secret';
process.env.TEXTURE_WEBHOOK_SECRET = SECRET;

const app = require('../src/index');
const { verifyTextureSignature } = require('../src/index');

// Signs exactly as Texture does: lowercase hex HMAC-SHA256 of the raw body, secret as UTF-8.
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function post(body, headers = {}) {
  return request(app)
    .post('/webhooks/texture')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);
}

const event = (type, extra = {}) => ({
  type,
  deviceId: 'dev_123',
  organizationId: 'org_123',
  workspaceId: 'ws_123',
  key: 'evt_abc123',
  ...extra,
});

describe('Texture webhook', () => {
  let logSpy;
  beforeEach(() => {
    process.env.TEXTURE_WEBHOOK_SECRET = SECRET;
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => logSpy.mockRestore());

  describe('signature verification', () => {
    it('accepts a valid signature', async () => {
      const body = JSON.stringify(event('device.updated'));
      const res = await post(body, { 'Texture-Signature': sign(body) });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('verifies the exact bytes received, including whitespace and key order', async () => {
      const body = '{ "type" : "device.updated",\n  "deviceId":"dev_123" }';
      const res = await post(body, { 'Texture-Signature': sign(body) });
      expect(res.status).toBe(200);
    });

    it('accepts an uppercase hex digest (hex is case-insensitive)', async () => {
      const body = JSON.stringify(event('device.updated'));
      const res = await post(body, { 'Texture-Signature': sign(body).toUpperCase() });
      expect(res.status).toBe(200);
    });

    it('verifies regardless of content type', async () => {
      const body = JSON.stringify(event('device.updated'));
      const res = await request(app)
        .post('/webhooks/texture')
        .set('Content-Type', 'text/plain')
        .set('Texture-Signature', sign(body))
        .send(body);
      expect(res.status).toBe(200);
    });

    it('uses the whole secret including whsec_ (prefix-stripped key fails)', async () => {
      const body = JSON.stringify(event('device.updated'));
      const res = await post(body, { 'Texture-Signature': sign(body, 'my-webhook-secret') });
      expect(res.status).toBe(401);
    });

    it('does not base64-decode the secret (Standard Webhooks style fails)', async () => {
      const body = JSON.stringify(event('device.updated'));
      const key = Buffer.from('my-webhook-secret', 'base64');
      const wrong = crypto.createHmac('sha256', key).update(body).digest('hex');
      const res = await post(body, { 'Texture-Signature': wrong });
      expect(res.status).toBe(401);
    });

    it('rejects a signature made with a different secret', async () => {
      const body = JSON.stringify(event('device.updated'));
      const res = await post(body, { 'Texture-Signature': sign(body, 'whsec_other') });
      expect(res.status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const body = JSON.stringify(event('device.updated'));
      const res = await post(body.replace('dev_123', 'dev_999'), { 'Texture-Signature': sign(body) });
      expect(res.status).toBe(401);
    });

    it('rejects a missing signature header', async () => {
      const res = await post(JSON.stringify(event('device.updated')));
      expect(res.status).toBe(401);
    });

    it('rejects an empty signature header', async () => {
      const res = await post(JSON.stringify(event('device.updated')), { 'Texture-Signature': '' });
      expect(res.status).toBe(401);
    });

    it.each([
      ['too short', 'abc123'],
      ['too long', 'a'.repeat(66)],
      ['non-hex characters', 'z'.repeat(64)],
      ['prefixed', `sha256=${'a'.repeat(64)}`],
      ['digest plus junk', `${'a'.repeat(64)}zz`],
    ])('rejects a malformed signature (%s)', async (_name, value) => {
      const res = await post(JSON.stringify(event('device.updated')), { 'Texture-Signature': value });
      expect(res.status).toBe(401);
    });

    it('does not sign or check Texture-Timestamp', async () => {
      const body = JSON.stringify(event('device.updated'));
      const res = await post(body, {
        'Texture-Signature': sign(body),
        'Texture-Timestamp': '2001-01-01T00:00:00.000Z',
      });
      expect(res.status).toBe(200);
    });

    it('rejects every request when no secret is configured', async () => {
      delete process.env.TEXTURE_WEBHOOK_SECRET;
      const body = JSON.stringify(event('device.updated'));
      const res = await post(body, { 'Texture-Signature': sign(body) });
      expect(res.status).toBe(401);
    });

    it('verifyTextureSignature works on bytes', () => {
      const raw = Buffer.from('{"a":1}');
      expect(verifyTextureSignature(raw, sign(raw), SECRET)).toBe(true);
      expect(verifyTextureSignature(raw, sign(raw), 'nope')).toBe(false);
      expect(verifyTextureSignature(raw, undefined, SECRET)).toBe(false);
    });
  });

  describe('request body', () => {
    it('returns 400 for a signed body that is not JSON', async () => {
      const body = 'not json';
      const res = await post(body, { 'Texture-Signature': sign(body) });
      expect(res.status).toBe(400);
    });

    it('returns 400 for a signed JSON body that is not an object', async () => {
      const body = '[1,2,3]';
      const res = await post(body, { 'Texture-Signature': sign(body) });
      expect(res.status).toBe(400);
    });
  });

  describe('event handling', () => {
    it.each([
      'device.discovered',
      'device.updated',
      'device.disconnected',
      'command.succeeded',
      'command.failed',
      'command.overridden',
      'customer.created',
      'enrollment.approved',
      'site.created',
    ])('handles %s', async (type) => {
      const body = JSON.stringify(event(type));
      const res = await post(body, { 'Texture-Signature': sign(body) });
      expect(res.status).toBe(200);
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
    });

    it('acknowledges unknown event types', async () => {
      const body = JSON.stringify(event('device.created'));
      const res = await post(body, { 'Texture-Signature': sign(body) });
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Unhandled Texture event type'));
    });
  });

  it('serves a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
