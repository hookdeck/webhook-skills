import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PUT, PATCH, DELETE } from '../app/webhooks/honeycomb/route';
import { classifyAlert, verifyHoneycombRequest } from '../lib/verify-honeycomb';

const SECRET = 'test_honeycomb_shared_secret_0123456789';
const HANDLERS = { GET, POST, PUT, PATCH, DELETE } as const;
const METHODS = Object.keys(HANDLERS) as (keyof typeof HANDLERS)[];

beforeAll(() => {
  process.env.HONEYCOMB_WEBHOOK_SECRET = SECRET;
});

// Illustrative payloads: Honeycomb doesn't document the default payload field by field.
const TRIGGER = {
  name: 'Slow checkout requests',
  status: 'TRIGGERED',
  trigger_url: 'https://ui.honeycomb.io/example/triggers/abc123',
  threshold: { op: '>', value: 2000 },
};
const BURN_ALERT = { slo_name: 'Checkout availability', alert_type: 'exhaustion_time', budget_remaining: 0.12 };
const ANOMALY = { anomaly_id: 'an_123', summary: 'Error rate anomaly' };

let n = 0;
const uniqueId = () => `delivery-${++n}`;

function call(
  method: keyof typeof HANDLERS,
  { token = SECRET as string | null, body, deliveryId, contentType = 'application/json' }: {
    token?: string | null;
    body?: string;
    deliveryId?: string;
    contentType?: string;
  } = {}
) {
  const headers: Record<string, string> = {};
  if (token !== null) headers['X-Honeycomb-Webhook-Token'] = token;
  if (deliveryId) headers['X-Honeycomb-Webhook-Delivery-ID'] = deliveryId;
  if (body !== undefined) headers['content-type'] = contentType;
  const req = new NextRequest('http://localhost:3000/webhooks/honeycomb', {
    method,
    headers,
    body: method === 'GET' ? undefined : body,
  });
  return HANDLERS[method](req);
}

describe('/webhooks/honeycomb', () => {
  describe('X-Honeycomb-Webhook-Token verification', () => {
    it.each(METHODS)('accepts the correct secret on %s', async (method) => {
      const res = await call(method, { body: JSON.stringify(TRIGGER) });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it.each(METHODS)('rejects a wrong secret on %s', async (method) => {
      const res = await call(method, { token: 'wrong', body: JSON.stringify(TRIGGER) });
      expect(res.status).toBe(401);
    });

    it.each(METHODS)('rejects a missing header on %s', async (method) => {
      const res = await call(method, { token: null, body: JSON.stringify(TRIGGER) });
      expect(res.status).toBe(401);
    });

    it('checks the credential before parsing the body', async () => {
      const res = await call('POST', { token: 'wrong', body: '{not json' });
      expect(res.status).toBe(401);
    });

    it('compares the whole header value, not a prefix', async () => {
      for (const token of [`${SECRET}x`, SECRET.slice(0, -1), `Bearer ${SECRET}`]) {
        const res = await call('POST', { token, body: JSON.stringify(TRIGGER) });
        expect(res.status).toBe(401);
      }
    });

    it('accepts any content type', async () => {
      const res = await call('POST', { body: JSON.stringify(TRIGGER), contentType: 'text/plain' });
      expect(res.status).toBe(200);
    });
  });

  describe('verifyHoneycombRequest', () => {
    it('looks the header up case-insensitively', () => {
      expect(verifyHoneycombRequest(new Headers({ 'X-HONEYCOMB-WEBHOOK-TOKEN': SECRET }))).toBe(true);
    });

    it('fails closed when the secret is not configured', () => {
      expect(verifyHoneycombRequest(new Headers({ 'x-honeycomb-webhook-token': 'anything' }), '')).toBe(false);
    });

    it('does not throw on unequal lengths or non-ASCII secrets', () => {
      expect(verifyHoneycombRequest(new Headers({ 'x-honeycomb-webhook-token': 'short' }))).toBe(false);
      expect(verifyHoneycombRequest(new Headers({ 'x-honeycomb-webhook-token': 'secret' }), 'sécret-日本')).toBe(false);
    });
  });

  describe('body handling', () => {
    it('handles an empty body', async () => {
      const res = await call('POST', { body: '' });
      expect(res.status).toBe(200);
    });

    it('handles a GET with no body', async () => {
      const res = await call('GET');
      expect(res.status).toBe(200);
    });

    it('rejects invalid JSON after authentication', async () => {
      const res = await call('POST', { body: '{not json' });
      expect(res.status).toBe(400);
    });

    it('rejects a non-object JSON body', async () => {
      const res = await call('POST', { body: JSON.stringify([1, 2]) });
      expect(res.status).toBe(400);
    });
  });

  describe('alert classification', () => {
    it('classifies a trigger payload', () => expect(classifyAlert(TRIGGER)).toBe('trigger'));
    it('classifies an SLO burn alert payload', () => expect(classifyAlert(BURN_ALERT)).toBe('slo_burn_alert'));
    it('classifies an anomaly payload', () => expect(classifyAlert(ANOMALY)).toBe('anomaly'));
    it('falls back to unknown for custom templates', () => expect(classifyAlert({ foo: 1 })).toBe('unknown'));

    it.each([TRIGGER, BURN_ALERT, ANOMALY, { foo: 1 }])('returns 200 for %j', async (payload) => {
      const res = await call('POST', { body: JSON.stringify(payload) });
      expect(res.status).toBe(200);
    });
  });

  describe('idempotency', () => {
    it('acknowledges a repeated X-Honeycomb-Webhook-Delivery-ID without reprocessing', async () => {
      const id = uniqueId();
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      const first = await call('POST', { body: JSON.stringify(TRIGGER), deliveryId: id });
      const second = await call('POST', { body: JSON.stringify(TRIGGER), deliveryId: id });
      expect(await first.json()).toEqual({ received: true });
      expect(await second.json()).toEqual({ received: true, duplicate: true });
      expect(log.mock.calls.filter(([m]) => String(m).startsWith('Trigger alert'))).toHaveLength(1);
      log.mockRestore();
    });

    it('does not treat an unauthenticated request as a duplicate', async () => {
      const id = uniqueId();
      await call('POST', { body: JSON.stringify(TRIGGER), deliveryId: id });
      const res = await call('POST', { token: 'wrong', body: JSON.stringify(TRIGGER), deliveryId: id });
      expect(res.status).toBe(401);
    });
  });
});
