// Generated with: airweave-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'node:crypto';
import { jest } from '@jest/globals';
import request from 'supertest';

// Svix secrets are "whsec_" + base64(key bytes). The HMAC key is the
// base64-DECODED part after "whsec_".
const SECRET = 'whsec_' + Buffer.from('airweave-test-signing-key-012345').toString('base64');
const OTHER_SECRET = 'whsec_' + Buffer.from('some-other-webhook-signing-key00').toString('base64');

process.env.AIRWEAVE_WEBHOOK_SECRET = SECRET;

// Import after setting the env var
const { app } = await import('../src/index.js');

/** Sign exactly like Airweave (Svix). */
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
    'Content-Type': opts.contentType || 'application/json',
    'svix-id': id,
    'svix-timestamp': ts,
    'svix-signature': opts.signature ?? sign(rawBody, id, ts, opts.secret),
  };
}

function post(rawBody, headers) {
  return request(app).post('/webhooks/airweave').set(headers).send(rawBody);
}

const syncBase = {
  sync_id: '440e8400-e29b-41d4-a716-446655440099',
  sync_job_id: '550e8400-e29b-41d4-a716-446655440000',
  collection_id: '770e8400-e29b-41d4-a716-446655440002',
  collection_readable_id: 'finance-data-ab123',
  collection_name: 'Finance Data',
  source_connection_id: '660e8400-e29b-41d4-a716-446655440001',
  source_type: 'notion',
  timestamp: '2025-01-15T14:00:00Z',
};
const connectionBase = {
  source_connection_id: '660e8400-e29b-41d4-a716-446655440001',
  collection_readable_id: 'finance-data-ab123',
  source_type: 'notion',
  is_authenticated: true,
  timestamp: '2025-01-15T13:55:00Z',
};
const collectionBase = {
  collection_id: '770e8400-e29b-41d4-a716-446655440002',
  collection_name: 'Finance Data',
  collection_readable_id: 'finance-data-ab123',
  timestamp: '2025-01-15T13:50:00Z',
};

const PAYLOADS = {
  'sync.pending': syncBase,
  'sync.running': syncBase,
  'sync.completed': {
    ...syncBase,
    entities_inserted: 42,
    entities_updated: 10,
    entities_deleted: 3,
    entities_skipped: 120,
    chunks_written: 215,
  },
  'sync.failed': { ...syncBase, error: 'Authentication token expired' },
  'sync.cancelled': syncBase,
  'source_connection.created': { ...connectionBase, is_authenticated: false },
  'source_connection.auth_completed': connectionBase,
  'source_connection.deleted': { ...connectionBase, is_authenticated: false },
  'collection.created': collectionBase,
  'collection.updated': collectionBase,
  'collection.deleted': collectionBase,
};

const body = (eventType, extra = {}) => JSON.stringify({ event_type: eventType, ...PAYLOADS[eventType], ...extra });

describe('Airweave webhook handler', () => {
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    process.env.AIRWEAVE_WEBHOOK_SECRET = SECRET;
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe('valid deliveries', () => {
    it.each(Object.keys(PAYLOADS))('accepts %s', async (eventType) => {
      const raw = body(eventType);
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
      expect(logSpy.mock.calls.flat().join('\n')).not.toContain('Unhandled');
    });

    it('logs sync.completed metrics', async () => {
      const raw = body('sync.completed');
      await post(raw, signedHeaders(raw));
      expect(logSpy.mock.calls.flat().join('\n')).toContain('Finance Data (42 inserted, 10 updated, 3 deleted, 215 chunks)');
    });

    it('acknowledges unknown event types', async () => {
      const raw = JSON.stringify({ event_type: 'sync.future_thing', timestamp: '2025-01-15T14:00:00Z' });
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(200);
      expect(logSpy.mock.calls.flat().join('\n')).toContain('Unhandled Airweave event type: sync.future_thing');
    });

    it('verifies the exact bytes whatever the content type', async () => {
      const raw = '{ "event_type":"collection.created",  "collection_name":"Spacing   matters" }';
      const res = await post(raw, signedHeaders(raw, { contentType: 'text/plain' }));
      expect(res.status).toBe(200);
    });

    it('accepts when any of several v1 signatures matches', async () => {
      const raw = body('sync.completed');
      const id = 'msg_multi';
      const ts = String(now());
      const signature = `${sign(raw, id, ts, OTHER_SECRET)} ${sign(raw, id, ts)}`;
      const res = await post(raw, signedHeaders(raw, { id, timestamp: ts, signature }));
      expect(res.status).toBe(200);
    });

    it('ignores non-v1 signature versions', async () => {
      const raw = body('sync.completed');
      const id = 'msg_v1a';
      const ts = String(now());
      const signature = sign(raw, id, ts).replace('v1,', 'v1a,');
      const res = await post(raw, signedHeaders(raw, { id, timestamp: ts, signature }));
      expect(res.status).toBe(400);
    });
  });

  describe('invalid deliveries', () => {
    it('rejects a tampered body', async () => {
      const raw = body('sync.completed');
      const headers = signedHeaders(raw);
      const res = await post(body('sync.completed', { entities_inserted: 9999 }), headers);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid signature');
    });

    it('rejects a signature made with another secret', async () => {
      const raw = body('sync.failed');
      const res = await post(raw, signedHeaders(raw, { secret: OTHER_SECRET }));
      expect(res.status).toBe(400);
    });

    it('rejects a signature that is not base64 of the right length', async () => {
      const raw = body('sync.failed');
      const res = await post(raw, signedHeaders(raw, { signature: 'v1,not-a-signature' }));
      expect(res.status).toBe(400);
    });

    it('rejects a stale timestamp (older than 5 minutes)', async () => {
      const raw = body('sync.completed');
      const res = await post(raw, signedHeaders(raw, { timestamp: now() - 6 * 60 }));
      expect(res.status).toBe(400);
    });

    it('rejects a timestamp too far in the future', async () => {
      const raw = body('sync.completed');
      const res = await post(raw, signedHeaders(raw, { timestamp: now() + 6 * 60 }));
      expect(res.status).toBe(400);
    });

    it.each(['svix-id', 'svix-timestamp', 'svix-signature'])('rejects a missing %s header', async (name) => {
      const raw = body('sync.completed');
      const headers = signedHeaders(raw);
      delete headers[name];
      const res = await post(raw, headers);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing Svix signature headers');
    });

    it('rejects an empty body', async () => {
      const res = await post('', signedHeaders(''));
      expect(res.status).toBe(400);
    });

    it('rejects a correctly signed body that is not JSON', async () => {
      const raw = 'not json';
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(400);
    });
  });

  describe('idempotency', () => {
    it('acknowledges a retried svix-id without reprocessing', async () => {
      const raw = body('sync.completed');
      const headers = signedHeaders(raw, { id: 'msg_dupe_1' });
      const first = await post(raw, headers);
      expect(first.body).toEqual({ received: true });

      const second = await post(raw, headers);
      expect(second.status).toBe(200);
      expect(second.body).toEqual({ received: true, duplicate: true });
    });
  });

  describe('configuration', () => {
    it('fails closed when the secret is not configured', async () => {
      delete process.env.AIRWEAVE_WEBHOOK_SECRET;
      const raw = body('sync.completed');
      const res = await post(raw, signedHeaders(raw));
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Webhook secret not configured');
    });

    it('serves /health', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });
});
