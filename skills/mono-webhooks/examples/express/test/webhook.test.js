const request = require('supertest');

// Set test environment variables before importing the app
process.env.MONO_WEBHOOK_SECRET = 'test_mono_webhook_secret_0123456789';

const app = require('../src/index');
const { verifyMonoRequest } = require('../src/index');

const SECRET = process.env.MONO_WEBHOOK_SECRET;

let counter = 0;
const nextId = () => `evt_test_${++counter}`;

// Payload shapes follow the sample webhooks in Mono's docs.
function samplePayload(event = 'mono.events.account_connected') {
  const base = { event, event_id: nextId(), timestamp: '2026-01-27T21:00:39.588Z' };
  if (event === 'mono.events.account_connected') {
    return {
      ...base,
      data: {
        id: '6979274350b9c321c14524b1',
        customer: '6961439d7716b67eba2d068a',
        meta: { data_status: 'PROCESSING', auth_method: 'internet_banking', ref: '4055877-T' },
        app: '68cbf35e9DS6deec038a43d9',
        business: '68ca76a195f6deec0384d6c0'
      }
    };
  }
  if (event === 'mono.events.account_updated') {
    return {
      ...base,
      data: {
        account: { _id: '697926f050B9c321c1451dda', name: 'Samuel Olamide', currency: 'NGN', balance: 22967 },
        meta: { data_status: 'AVAILABLE', auth_method: 'internet_banking', ref: '4055877-T' }
      }
    };
  }
  if (event === 'mono.events.account_unlinked') {
    return { ...base, data: { id: '6979274350b9c321c14524b1' } };
  }
  const status = event.split('.')[1].replace('payment_', '');
  return {
    ...base,
    data: {
      type: 'onetime-debit',
      object: {
        id: 'txd_wzb8uhew4j9ngru43a123456',
        status,
        amount: 20000,
        fee: 6100,
        currency: 'NGN',
        reference: 'ZRDWCG1714385608212'
      }
    }
  };
}

const EVENTS = [
  'mono.events.account_connected',
  'mono.events.account_updated',
  'mono.events.account_unlinked',
  'direct_debit.payment_successful',
  'direct_debit.payment_failed',
  'direct_debit.payment_cancelled',
  'direct_debit.payment_abandoned'
];

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/mono')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Mono webhook endpoint', () => {
  describe('mono-webhook-secret verification', () => {
    it('accepts the correct secret', async () => {
      const res = await post().set('mono-webhook-secret', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await post().set('Mono-Webhook-Secret', SECRET);
      expect(res.status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await post().set('mono-webhook-secret', 'x'.repeat(SECRET.length));
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      const res = await post().set('mono-webhook-secret', 'short');
      expect(res.status).toBe(401);
    });

    it('requires the whole value to match (no prefix or substring)', async () => {
      expect((await post().set('mono-webhook-secret', `Bearer ${SECRET}`)).status).toBe(401);
      expect((await post().set('mono-webhook-secret', SECRET.slice(0, -1))).status).toBe(401);
    });

    it('rejects a missing secret', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('does not accept the secret in Authorization', async () => {
      const res = await post().set('Authorization', `Bearer ${SECRET}`);
      expect(res.status).toBe(401);
    });

    it('rejects everything when MONO_WEBHOOK_SECRET is unset', () => {
      expect(verifyMonoRequest({ 'mono-webhook-secret': SECRET }, '')).toBe(false);
      delete process.env.MONO_WEBHOOK_SECRET;
      expect(verifyMonoRequest({ 'mono-webhook-secret': SECRET })).toBe(false);
      process.env.MONO_WEBHOOK_SECRET = SECRET;
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain')
        .set('mono-webhook-secret', SECRET);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await post('{not json').set('mono-webhook-secret', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const res = await post('[1,2]').set('mono-webhook-secret', SECRET);
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without a secret', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Event handling', () => {
    it.each(EVENTS)('handles %s', async (event) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload(event))).set('mono-webhook-secret', SECRET);
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const res = await post(JSON.stringify(samplePayload('mono.events.something_new')))
        .set('mono-webhook-secret', SECRET);
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    it('dedupes retries on event_id', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const body = JSON.stringify(samplePayload('direct_debit.payment_successful'));
      const first = await post(body).set('mono-webhook-secret', SECRET);
      const retry = await post(body).set('mono-webhook-secret', SECRET);
      expect(first.body).toEqual({ received: true });
      expect(retry.status).toBe(200);
      expect(retry.body).toEqual({ received: true, duplicate: true });
      expect(spy.mock.calls.filter(([m]) => String(m).startsWith('Payment successful'))).toHaveLength(1);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
