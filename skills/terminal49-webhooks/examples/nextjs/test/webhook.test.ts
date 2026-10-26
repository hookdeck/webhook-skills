import crypto from 'crypto';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/terminal49/route';
import { verifyTerminal49Signature } from '../lib/verify-terminal49';

// Test secret: Terminal49's `secret` attribute is an opaque string, used as UTF-8 bytes as-is.
const SECRET = 'test_terminal49_webhook_secret_0123456789';

beforeAll(() => {
  process.env.TERMINAL49_WEBHOOK_SECRET = SECRET;
});

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Shaped like Terminal49's documented webhook_notification payloads (trimmed `included`).
let counter = 0;
function notification(event: string, referenceType = 'transport_event', included: unknown[] = []) {
  counter += 1;
  return {
    data: {
      id: `a3baf7bb-3ffe-485e-bf9d-${String(counter).padStart(12, '0')}`,
      type: 'webhook_notification',
      attributes: { id: `n-${counter}`, event, delivery_status: 'succeeded', created_at: '2022-10-21T20:16:47Z' },
      relationships: {
        reference_object: { data: { id: '58114b8d-7aab-491d-97ce-7b32c0c1d198', type: referenceType } },
        webhook: { data: { id: '7c353e67-cab6-422e-a17f-8483bf250dd9', type: 'webhook' } },
        webhook_notification_logs: { data: [] },
      },
    },
    included,
  };
}

// Same algorithm as Terminal49: lowercase hex HMAC-SHA256 of the raw body, secret as-is.
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeRequest(body: string, headers: Record<string, string> = {}, contentType = 'application/json') {
  return new NextRequest('http://localhost:3000/webhooks/terminal49', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

function postSigned(payload: unknown) {
  const body = JSON.stringify(payload);
  return POST(makeRequest(body, { 'x-t49-webhook-signature': sign(body) }));
}

describe('signature verification', () => {
  const body = JSON.stringify(notification('tracking_request.succeeded', 'tracking_request'));

  it('accepts a valid signature', async () => {
    const res = await POST(makeRequest(body, { 'x-t49-webhook-signature': sign(body) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts an uppercase hex signature (hex is case-insensitive)', async () => {
    const res = await POST(makeRequest(body, { 'x-t49-webhook-signature': sign(body).toUpperCase() }));
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes, whatever the content type', async () => {
    const pretty = JSON.stringify(JSON.parse(body), null, 4);
    const res = await POST(
      makeRequest(pretty, { 'x-t49-webhook-signature': sign(pretty) }, 'application/vnd.api+json')
    );
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature', async () => {
    expect((await POST(makeRequest(body))).status).toBe(401);
  });

  it('rejects an empty signature', async () => {
    expect((await POST(makeRequest(body, { 'x-t49-webhook-signature': '' }))).status).toBe(401);
  });

  it('rejects a wrong signature', async () => {
    const res = await POST(makeRequest(body, { 'x-t49-webhook-signature': sign(body, 'another_secret') }));
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const res = await POST(
      makeRequest(body.replace('succeeded', 'failed'), { 'x-t49-webhook-signature': sign(body) })
    );
    expect(res.status).toBe(401);
  });

  it.each([
    ['too short', 'abcdef'],
    ['too long', sign(body) + '00'],
    ['non-hex characters', 'z'.repeat(64)],
    ['prefixed', `sha256=${sign(body)}`],
  ])('rejects a malformed signature (%s)', async (_name, signature) => {
    const res = await POST(makeRequest(body, { 'x-t49-webhook-signature': signature }));
    expect(res.status).toBe(401);
  });

  it('verifyTerminal49Signature rejects a whitespace-padded digest', () => {
    expect(verifyTerminal49Signature(Buffer.from(body), ` ${sign(body)} `)).toBe(false);
  });

  it('verifyTerminal49Signature fails closed when no secret is configured', () => {
    const raw = Buffer.from(body);
    expect(verifyTerminal49Signature(raw, sign(body), '')).toBe(false);
    expect(verifyTerminal49Signature(raw, sign(body), SECRET)).toBe(true);
  });
});

describe('event handling', () => {
  it.each([
    ['tracking_request.succeeded', 'tracking_request'],
    ['tracking_request.failed', 'tracking_request'],
    ['container.transport.vessel_arrived', 'transport_event'],
    ['container.transport.vessel_departed', 'transport_event'],
    ['container.transport.available', 'transport_event'],
    ['container.updated', 'container_updated_event'],
    ['shipment.estimated.arrival', 'estimated_event'],
  ])('handles %s', async (event, referenceType) => {
    const res = await postSigned(notification(event, referenceType));
    expect(res.status).toBe(200);
  });

  it('accepts events it does not handle', async () => {
    const res = await postSigned(notification('container.transport.rail_loaded'));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith('Unhandled event: container.transport.rail_loaded');
  });

  it('skips a duplicate delivery of the same data.id', async () => {
    const payload = notification('container.updated', 'container_updated_event');
    expect((await postSigned(payload)).status).toBe(200);
    expect((await postSigned(payload)).status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(`Duplicate notification ${payload.data.id}, skipping`);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, { 'x-t49-webhook-signature': sign(body) }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when data.attributes.event is missing', async () => {
    const res = await postSigned({ data: { id: 'x', type: 'webhook_notification', attributes: {} } });
    expect(res.status).toBe(400);
  });
});
