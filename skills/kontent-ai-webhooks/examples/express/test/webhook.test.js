// Generated with: kontent-ai-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');
const request = require('supertest');

// Synthetic secret
const SECRET = 'c3ludGhldGljLWtvbnRlbnQtd2ViaG9vay1zZWNyZXQ=';
process.env.KONTENT_AI_WEBHOOK_SECRET = SECRET;

const { app, verifyKontentAiSignature } = require('../src/index');

const BODY = '{"notifications":[{"data":{"system":{"id":"32022d85-ee58-4655-9016-e130c375820a","name":"Synthetic article","codename":"synthetic_article","collection":"default","workflow":"default","workflow_step":"published","language":"default","type":"article","last_modified":"2026-11-18T10:15:00.0000000Z"}},"message":{"environment_id":"00000000-0000-4000-8000-000000000001","object_type":"content_item","action":"published","delivery_slot":"published"}}]}';
const BODY2 = '{"notifications":[{"data":{"system":{"id":"f24e4721-f081-50ef-9a47-2ebd45b0c915","name":"hero.jpg","codename":"hero_jpg","last_modified":"2026-11-18T10:16:00.0000000Z","collection":"default"}},"message":{"environment_id":"00000000-0000-4000-8000-000000000001","object_type":"asset","action":"metadata_changed","delivery_slot":"preview"}},{"data":{"system":{"id":"121d16aa-de4b-454f-9174-e26f25f1d860","name":"Page","codename":"page","last_modified":"2026-11-18T10:16:01.0000000Z"}},"message":{"environment_id":"00000000-0000-4000-8000-000000000001","object_type":"content_type","action":"changed","delivery_slot":"preview"}}]}';

const sign = (body, key = SECRET) => '' + crypto.createHmac('sha256', key).update(body).digest('base64');

const post = (body, signature, headers = {}) => {
  const req = request(app).post('/webhooks/kontent-ai').set('Content-Type', 'application/json').set(headers);
  if (signature !== undefined) req.set('X-Kontent-ai-Signature', signature);
  return req.send(body);
};

beforeEach(() => {
  process.env.KONTENT_AI_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('verifyKontentAiSignature', () => {
  it('accepts a signature over the raw body', () => {
    expect(verifyKontentAiSignature(BODY, sign(BODY), SECRET)).toBe(true);
  });

  it('rejects a hex digest: Kontent.ai sends base64', () => {
    const other = '' + crypto.createHmac('sha256', SECRET).update(BODY).digest('hex');
    expect(verifyKontentAiSignature(BODY, other, SECRET)).toBe(false);
  });

  it('rejects a digest keyed with the base64-decoded secret: the secret is used as text', () => {
    const decoded = crypto.createHmac('sha256', Buffer.from(SECRET, 'base64')).update(BODY).digest('base64');
    expect(verifyKontentAiSignature(BODY, decoded, SECRET)).toBe(false);
  });

  it('verifies a pretty-printed CRLF body as sent, but not after its line endings are rewritten', () => {
    const crlf = JSON.stringify(JSON.parse(BODY), null, 2).replace(/\n/g, '\r\n');
    expect(verifyKontentAiSignature(crlf, sign(crlf), SECRET)).toBe(true);
    expect(verifyKontentAiSignature(crlf.replace(/\r\n/g, '\n'), sign(crlf), SECRET)).toBe(false);
  });
});

describe('/webhooks/kontent-ai', () => {

  it('accepts a valid signature', async () => {
    const res = await post(BODY, sign(BODY));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, notifications: 1 });
  });

  it('handles a second event type', async () => {
    const res = await post(BODY2, sign(BODY2));
    expect(res.status).toBe(200);
    expect(res.body.notifications).toBe(2);
  });

  it('rejects a signature made with another secret', async () => {
    expect((await post(BODY, sign(BODY, 'wrong_secret'))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await post(BODY.replace('"action":"published"', '"action":"unpublished"'), sign(BODY))).status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(BODY)).status).toBe(401);
  });

  it('accepts a pretty-printed CRLF body signed as sent', async () => {
    const crlf = JSON.stringify(JSON.parse(BODY), null, 2).replace(/\n/g, '\r\n');
    const res = await post(crlf, sign(crlf));
    expect(res.status).toBe(200);
    expect(res.body.notifications).toBe(1);
  });
  it('accepts a secret with a trailing newline', async () => {
    process.env.KONTENT_AI_WEBHOOK_SECRET = `${SECRET}\n`;
    expect((await post(BODY, sign(BODY))).status).toBe(200);
  });

  it('returns 400 for invalid JSON after a valid signature', async () => {
    const body = '{"truncated": ';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when KONTENT_AI_WEBHOOK_SECRET is not set', async () => {
    delete process.env.KONTENT_AI_WEBHOOK_SECRET;
    expect((await post(BODY, sign(BODY))).status).toBe(500);
  });
});
