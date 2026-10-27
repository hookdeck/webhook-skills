const crypto = require('crypto');
const request = require('supertest');

// Set test environment variables before importing the app
process.env.LANGFUSE_WEBHOOK_SECRET = 'lf_whsec_test_2dbcbba19f644c07';
delete process.env.LANGFUSE_WEBHOOK_TOLERANCE_SECONDS;

const app = require('../src/index');
const { verifyLangfuseSignature } = require('../src/index');

const SECRET = process.env.LANGFUSE_WEBHOOK_SECRET;
const PATH = '/webhooks/langfuse';

// Based on the documented created payload (https://langfuse.com/docs/prompt-management/features/webhooks-slack-integrations)
function payload(action = 'created') {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    timestamp: '2024-07-10T10:30:00Z',
    type: 'prompt-version',
    apiVersion: 'v1',
    action,
    prompt: {
      id: 'prompt_abc123',
      name: 'movie-critic',
      version: 3,
      projectId: 'xyz789',
      labels: ['production', 'latest'],
      prompt: 'As a {{criticLevel}} movie critic, rate {{movie}} out of 10.',
      type: 'text',
      config: { key: 'value' },
      commitMessage: 'Improved critic persona',
      tags: ['entertainment'],
      createdAt: '2024-07-10T10:30:00Z',
      updatedAt: '2024-07-10T10:30:00Z',
    },
  };
}

// Same algorithm as Langfuse: hex HMAC-SHA256 over `${t}.${raw body}`, keyed with the secret's UTF-8 bytes.
function mac(body, timestamp = String(Math.floor(Date.now() / 1000)), secret = SECRET) {
  return crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(Buffer.concat([Buffer.from(`${timestamp}.`), Buffer.isBuffer(body) ? body : Buffer.from(body)]))
    .digest('hex');
}

function sign(body, timestamp = String(Math.floor(Date.now() / 1000)), secret = SECRET) {
  return `t=${timestamp},v1=${mac(body, timestamp, secret)}`;
}

function post(body, signature) {
  const req = request(app).post(PATH).set('Content-Type', 'application/json');
  if (signature !== undefined) req.set('x-langfuse-signature', signature);
  return req.send(body);
}

describe('Langfuse webhook endpoint', () => {
  afterEach(() => {
    delete process.env.LANGFUSE_WEBHOOK_TOLERANCE_SECONDS;
  });

  describe('signature verification', () => {
    it('accepts a valid signature', async () => {
      const body = JSON.stringify(payload());
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('verifies the exact bytes received, not a re-serialised body', async () => {
      const body = JSON.stringify(payload(), null, 4) + '\n'; // unusual whitespace must survive
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
    });

    it('accepts uppercase hex', async () => {
      const body = JSON.stringify(payload());
      const t = String(Math.floor(Date.now() / 1000));
      const res = await post(body, `t=${t},v1=${mac(body, t).toUpperCase()}`);
      expect(res.status).toBe(200);
    });

    it('accepts when any v1 entry matches and ignores other keys', async () => {
      const body = JSON.stringify(payload());
      const t = String(Math.floor(Date.now() / 1000));
      const bad = 'a'.repeat(64);
      const res = await post(body, `t=${t},v0=${bad},v1=${bad},v1=${mac(body, t)}`);
      expect(res.status).toBe(200);
    });

    it('uses t exactly as sent (no number re-formatting)', async () => {
      const body = JSON.stringify(payload());
      const t = '0001700000000';
      expect(verifyLangfuseSignature(Buffer.from(body), `t=${t},v1=${mac(body, t)}`, SECRET)).toBe(true);
      expect(verifyLangfuseSignature(Buffer.from(body), `t=1700000000,v1=${mac(body, t)}`, SECRET)).toBe(false);
    });

    it('rejects a missing header', async () => {
      const res = await post(JSON.stringify(payload()));
      expect(res.status).toBe(401);
    });

    it('rejects an empty header', async () => {
      const res = await post(JSON.stringify(payload()), '');
      expect(res.status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const body = JSON.stringify(payload());
      const res = await post(body.replace('movie-critic', 'evil-prompt'), sign(body));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong secret', async () => {
      const body = JSON.stringify(payload());
      const res = await post(body, sign(body, undefined, 'some_other_secret'));
      expect(res.status).toBe(401);
    });

    it('rejects a tampered timestamp', async () => {
      const body = JSON.stringify(payload());
      const res = await post(body, `t=1,v1=${mac(body, '1700000000')}`);
      expect(res.status).toBe(401);
    });

    it('rejects a header without t=', async () => {
      const body = JSON.stringify(payload());
      const res = await post(body, `v1=${mac(body, '1700000000')}`);
      expect(res.status).toBe(401);
    });

    it('rejects a header without v1=', async () => {
      const body = JSON.stringify(payload());
      const res = await post(body, 't=1700000000,v0=' + mac(body, '1700000000'));
      expect(res.status).toBe(401);
    });

    it('rejects malformed signatures (wrong length, non-hex, garbage)', async () => {
      const body = JSON.stringify(payload());
      const t = String(Math.floor(Date.now() / 1000));
      const good = mac(body, t);
      for (const bad of [good.slice(0, 62), good + '00', 'z'.repeat(64), good.slice(0, 63) + 'g', '']) {
        const res = await post(body, `t=${t},v1=${bad}`);
        expect(res.status).toBe(401);
      }
      expect((await post(body, 'not-a-signature')).status).toBe(401);
    });

    it('rejects everything when no secret is configured', () => {
      const body = Buffer.from('{}');
      expect(verifyLangfuseSignature(body, sign(body), '')).toBe(false);
    });
  });

  describe('timestamp tolerance (opt-in)', () => {
    const old = String(Math.floor(Date.now() / 1000) - 86400);

    it('does not reject old timestamps by default (retries and replays resend the original)', async () => {
      const body = JSON.stringify(payload());
      const res = await post(body, sign(body, old));
      expect(res.status).toBe(200);
    });

    it('rejects old timestamps when LANGFUSE_WEBHOOK_TOLERANCE_SECONDS is set', async () => {
      process.env.LANGFUSE_WEBHOOK_TOLERANCE_SECONDS = '300';
      const body = JSON.stringify(payload());
      expect((await post(body, sign(body, old))).status).toBe(401);
      expect((await post(body, sign(body))).status).toBe(200);
    });

    it('rejects a non-numeric t when tolerance is on', () => {
      const body = Buffer.from('{}');
      expect(verifyLangfuseSignature(body, `t=abc,v1=${mac(body, 'abc')}`, SECRET, 300)).toBe(false);
    });
  });

  describe('event handling', () => {
    it.each(['created', 'updated', 'deleted'])('handles the %s action', async (action) => {
      const body = JSON.stringify(payload(action));
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('acknowledges unknown actions', async () => {
      const body = JSON.stringify(payload('archived'));
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
    });

    it('returns 400 for a validly signed body that is not JSON', async () => {
      const body = 'not json';
      const res = await post(body, sign(body));
      expect(res.status).toBe(400);
    });
  });

  it('health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
