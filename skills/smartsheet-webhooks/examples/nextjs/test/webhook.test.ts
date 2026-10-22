import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/smartsheet/route';

// Smartsheet assigns each webhook a random sharedSecret; it is used as-is as the HMAC key
const SHARED_SECRET = 'test_smartsheet_shared_secret';

beforeAll(() => {
  process.env.SMARTSHEET_SHARED_SECRET = SHARED_SECRET;
});

// Smartsheet-Hmac-SHA256: hex HMAC-SHA256 of the raw request body
function sign(payload: string, secret = SHARED_SECRET): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function callback(events: Record<string, unknown>[]): string {
  return JSON.stringify({
    nonce: 'f1f8a8e6-5d2b-4a6c-9d0a-7f0f3a1b2c3d',
    timestamp: '2026-10-22T10:00:00.000+00:00',
    webhookId: 8444254503626628,
    scope: 'sheet',
    scopeObjectId: 3285357287499652,
    events,
  });
}

function makeRequest(body: string, headers: Record<string, string> = {}): NextRequest {
  return new Request('http://localhost:3000/webhooks/smartsheet', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  }) as unknown as NextRequest;
}

describe('Smartsheet webhook', () => {
  describe('verification challenge', () => {
    it('echoes the challenge in the response header and JSON body', async () => {
      const body = JSON.stringify({ challenge: 'abc-123', webhookId: 8444254503626628 });
      const res = await POST(makeRequest(body, { 'Smartsheet-Hook-Challenge': 'abc-123' }));
      expect(res.status).toBe(200);
      expect(res.headers.get('Smartsheet-Hook-Response')).toBe('abc-123');
      expect(await res.json()).toEqual({ smartsheetHookResponse: 'abc-123' });
    });

    it('answers the challenge without a signature', async () => {
      const res = await POST(makeRequest('{}', { 'Smartsheet-Hook-Challenge': 'unsigned' }));
      expect(res.status).toBe(200);
      expect(res.headers.get('Smartsheet-Hook-Response')).toBe('unsigned');
    });

    it('answers the challenge even with a bad signature', async () => {
      const res = await POST(
        makeRequest('{}', { 'Smartsheet-Hook-Challenge': 'c1', 'Smartsheet-Hmac-SHA256': 'deadbeef' })
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('Smartsheet-Hook-Response')).toBe('c1');
    });
  });

  describe('signature verification', () => {
    const body = callback([{ objectType: 'row', eventType: 'created', id: 1, userId: 2 }]);

    it('accepts a valid signature', async () => {
      const res = await POST(makeRequest(body, { 'Smartsheet-Hmac-SHA256': sign(body) }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('accepts an upper-case hex signature (case-insensitive)', async () => {
      const res = await POST(makeRequest(body, { 'Smartsheet-Hmac-SHA256': sign(body).toUpperCase() }));
      expect(res.status).toBe(200);
    });

    it('verifies against the raw body whatever the Content-Type', async () => {
      const res = await POST(
        makeRequest(body, { 'content-type': 'text/plain', 'Smartsheet-Hmac-SHA256': sign(body) })
      );
      expect(res.status).toBe(200);
    });

    it('rejects a missing signature header', async () => {
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(400);
    });

    it('rejects a signature made with the wrong secret', async () => {
      const res = await POST(makeRequest(body, { 'Smartsheet-Hmac-SHA256': sign(body, 'wrong_secret') }));
      expect(res.status).toBe(400);
    });

    it('rejects a tampered body', async () => {
      const res = await POST(
        makeRequest(body.replace('"row"', '"cell"'), { 'Smartsheet-Hmac-SHA256': sign(body) })
      );
      expect(res.status).toBe(400);
    });

    it('rejects a signature of the wrong length', async () => {
      const res = await POST(makeRequest(body, { 'Smartsheet-Hmac-SHA256': 'abc' }));
      expect(res.status).toBe(400);
    });

    it('rejects invalid JSON that is correctly signed', async () => {
      const bad = 'not json';
      const res = await POST(makeRequest(bad, { 'Smartsheet-Hmac-SHA256': sign(bad) }));
      expect(res.status).toBe(400);
    });
  });

  describe('event handling', () => {
    const events = [
      { objectType: 'row', eventType: 'created', id: 1 },
      { objectType: 'row', eventType: 'updated', id: 1 },
      { objectType: 'row', eventType: 'deleted', id: 1 },
      { objectType: 'cell', eventType: 'updated', rowId: 1, columnId: 2 },
      { objectType: 'sheet', eventType: 'updated', id: 3 },
      { objectType: 'comment', eventType: 'created', id: 4 },
    ];

    it.each(events)('acknowledges $objectType.$eventType', async (event) => {
      const body = callback([event]);
      const res = await POST(makeRequest(body, { 'Smartsheet-Hmac-SHA256': sign(body) }));
      expect(res.status).toBe(200);
    });

    it('handles several events in one callback', async () => {
      const body = callback(events);
      const res = await POST(makeRequest(body, { 'Smartsheet-Hmac-SHA256': sign(body) }));
      expect(res.status).toBe(200);
    });

    it('acknowledges a status change callback', async () => {
      const body = JSON.stringify({
        nonce: 'n1',
        webhookId: 8444254503626628,
        scope: 'sheet',
        scopeObjectId: 3285357287499652,
        newWebhookStatus: 'DISABLED_SCOPE_INACCESSIBLE',
      });
      const res = await POST(makeRequest(body, { 'Smartsheet-Hmac-SHA256': sign(body) }));
      expect(res.status).toBe(200);
    });
  });
});
