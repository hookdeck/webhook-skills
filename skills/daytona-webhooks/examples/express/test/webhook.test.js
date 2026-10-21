// Generated with: daytona-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'node:crypto';
import { jest } from '@jest/globals';
import request from 'supertest';

// Svix secrets are "whsec_" + base64(key bytes). The HMAC key is the
// base64-DECODED part after "whsec_".
const SECRET = 'whsec_' + Buffer.from('daytona-test-signing-key-0123456').toString('base64');
const OTHER_SECRET = 'whsec_' + Buffer.from('some-other-endpoint-signing-key0').toString('base64');

process.env.DAYTONA_WEBHOOK_SECRET = SECRET;

// Import after setting the env var
const { app } = await import('../src/index.js');

/** Sign like Svix: HMAC-SHA256 over `${id}.${timestamp}.${body}`, base64. */
function sign(rawBody, id, timestamp, secret = SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
  return `v1,${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);

function signedHeaders(rawBody, opts = {}) {
  const id = opts.id || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const ts = String(opts.timestamp ?? now());
  return {
    'Content-Type': 'application/json',
    'svix-id': id,
    'svix-timestamp': ts,
    'svix-signature': opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

function post(rawBody, headers) {
  return request(app).post('/webhooks/daytona').set(headers).send(rawBody);
}

const TS = '2025-12-19T10:30:00.000Z';
const events = {
  'sandbox.created': { id: 'sandbox123', organizationId: 'org123', state: 'started', sandboxClass: 'container', createdAt: TS },
  'sandbox.state.updated': { id: 'sandbox123', organizationId: 'org123', oldState: 'started', newState: 'stopped', updatedAt: TS },
  'snapshot.created': { id: 'snapshot123', name: 'my-snapshot', organizationId: 'org123', state: 'active', createdAt: TS },
  'snapshot.state.updated': { id: 'snapshot123', name: 'my-snapshot', organizationId: 'org123', oldState: 'building', newState: 'active', updatedAt: TS },
  'snapshot.removed': { id: 'snapshot123', name: 'my-snapshot', organizationId: 'org123', removedAt: TS },
  'volume.created': { id: 'vol-12345678', name: 'my-volume', organizationId: 'org123', state: 'ready', createdAt: TS },
  'volume.state.updated': { id: 'vol-12345678', name: 'my-volume', organizationId: 'org123', oldState: 'creating', newState: 'ready', updatedAt: TS },
};

const body = (event) => JSON.stringify({ event, timestamp: TS, ...events[event] });

describe('Daytona webhook handler', () => {
  let logSpy;
  let errSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('valid signatures', () => {
    it.each(Object.keys(events))('accepts %s', async (event) => {
      const raw = body(event);
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
      expect(logSpy).toHaveBeenCalled();
    });

    it('accepts when one of several space-delimited signatures matches', async () => {
      const raw = body('sandbox.created');
      const id = 'msg_multi';
      const ts = String(now());
      const signature = `v1,${Buffer.from('bogus').toString('base64')} ${sign(raw, id, ts)}`;
      const res = await post(raw, signedHeaders(raw, { id, timestamp: ts, signature }));
      expect(res.status).toBe(200);
    });

    it('logs unhandled event types without failing', async () => {
      const raw = JSON.stringify({ event: 'sandbox.deleted', timestamp: TS });
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Unhandled Daytona event: sandbox.deleted');
    });
  });

  describe('invalid requests', () => {
    it('rejects a signature from the wrong secret', async () => {
      const raw = body('sandbox.created');
      const res = await post(raw, signedHeaders(raw, { secret: OTHER_SECRET }));
      expect(res.status).toBe(400);
    });

    it('rejects a tampered body', async () => {
      const raw = body('sandbox.created');
      const headers = signedHeaders(raw);
      const res = await post(raw.replace('sandbox123', 'sandbox999'), headers);
      expect(res.status).toBe(400);
    });

    it('rejects a body that was re-serialised (pretty-printed)', async () => {
      const raw = body('sandbox.created');
      const headers = signedHeaders(raw);
      const res = await post(JSON.stringify(JSON.parse(raw), null, 2), headers);
      expect(res.status).toBe(400);
    });

    it('accepts an old timestamp by default (retries and replays keep the original)', async () => {
      const old = now() - 3600;
      const raw = body('sandbox.created');
      const res = await post(raw, signedHeaders(raw, { timestamp: old }));
      expect(res.status).toBe(200);
    });

    it('rejects an old timestamp when DAYTONA_TIMESTAMP_TOLERANCE_SECONDS is set', async () => {
      process.env.DAYTONA_TIMESTAMP_TOLERANCE_SECONDS = '300';
      try {
        const old = now() - 3600;
        const raw = body('sandbox.created');
        const res = await post(raw, signedHeaders(raw, { timestamp: old }));
        expect(res.status).toBe(400);
      } finally {
        delete process.env.DAYTONA_TIMESTAMP_TOLERANCE_SECONDS;
      }
    });

    it('treats a non-numeric DAYTONA_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', async () => {
      process.env.DAYTONA_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const old = now() - 3600;
        const raw = body('sandbox.created');
        const res = await post(raw, signedHeaders(raw, { timestamp: old }));
        expect(res.status).toBe(200);
      } finally {
        delete process.env.DAYTONA_TIMESTAMP_TOLERANCE_SECONDS;
        warn.mockRestore();
      }
    });

    it('rejects a malformed signature', async () => {
      const raw = body('sandbox.created');
      const res = await post(raw, signedHeaders(raw, { signature: 'v1,not-a-real-signature' }));
      expect(res.status).toBe(400);
    });

    it.each(['svix-id', 'svix-timestamp', 'svix-signature'])('rejects a missing %s header', async (name) => {
      const raw = body('sandbox.created');
      const headers = signedHeaders(raw);
      delete headers[name];
      const res = await post(raw, headers);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing/);
    });
  });

  describe('deduplication', () => {
    it('acknowledges a repeated svix-id without reprocessing', async () => {
      const raw = body('snapshot.created');
      const headers = signedHeaders(raw, { id: 'msg_dupe_1' });
      const first = await post(raw, headers);
      expect(first.body).toEqual({ received: true });
      logSpy.mockClear();
      const second = await post(raw, headers);
      expect(second.status).toBe(200);
      expect(second.body).toEqual({ received: true, duplicate: true });
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('configuration', () => {
    it('fails closed when the secret is not configured', async () => {
      const raw = body('sandbox.created');
      const headers = signedHeaders(raw);
      delete process.env.DAYTONA_WEBHOOK_SECRET;
      try {
        const res = await post(raw, headers);
        expect(res.status).toBe(500);
      } finally {
        process.env.DAYTONA_WEBHOOK_SECRET = SECRET;
      }
    });
  });

  it('serves a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
