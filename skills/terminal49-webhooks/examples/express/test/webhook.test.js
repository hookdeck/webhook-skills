const crypto = require('crypto');
const request = require('supertest');

// Test secret: Terminal49's `secret` attribute is an opaque string, used as UTF-8 bytes as-is.
process.env.TERMINAL49_WEBHOOK_SECRET = 'test_terminal49_webhook_secret_0123456789';

const app = require('../src/index');
const { verifyTerminal49Signature, processedNotificationIds } = require('../src/index');

const SECRET = process.env.TERMINAL49_WEBHOOK_SECRET;

// Shaped like Terminal49's documented webhook_notification payloads (trimmed `included`).
let counter = 0;
function notification(event, referenceType = 'transport_event', included = []) {
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
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function send(body, headers = {}) {
  return request(app)
    .post('/webhooks/terminal49')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);
}

beforeEach(() => {
  processedNotificationIds.clear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('signature verification', () => {
  const body = JSON.stringify(notification('tracking_request.succeeded', 'tracking_request'));

  it('accepts a valid signature', async () => {
    const res = await send(body, { 'X-T49-Webhook-Signature': sign(body) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts an uppercase hex signature (hex is case-insensitive)', async () => {
    const res = await send(body, { 'X-T49-Webhook-Signature': sign(body).toUpperCase() });
    expect(res.status).toBe(200);
  });

  it('verifies the exact bytes, whatever the content type', async () => {
    const pretty = JSON.stringify(JSON.parse(body), null, 4);
    const res = await request(app)
      .post('/webhooks/terminal49')
      .set('Content-Type', 'application/vnd.api+json')
      .set('X-T49-Webhook-Signature', sign(pretty))
      .send(pretty);
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature', async () => {
    expect((await send(body)).status).toBe(401);
  });

  it('rejects an empty signature', async () => {
    expect((await send(body, { 'X-T49-Webhook-Signature': '' })).status).toBe(401);
  });

  it('rejects a wrong signature', async () => {
    const res = await send(body, { 'X-T49-Webhook-Signature': sign(body, 'another_secret') });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const res = await send(body.replace('succeeded', 'failed'), { 'X-T49-Webhook-Signature': sign(body) });
    expect(res.status).toBe(401);
  });

  it.each([
    ['too short', 'abcdef'],
    ['too long', sign(body) + '00'],
    ['non-hex characters', 'z'.repeat(64)],
    ['prefixed', `sha256=${sign(body)}`],
  ])('rejects a malformed signature (%s)', async (_name, signature) => {
    expect((await send(body, { 'X-T49-Webhook-Signature': signature })).status).toBe(401);
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
  const post = (payload) => {
    const body = JSON.stringify(payload);
    return send(body, { 'X-T49-Webhook-Signature': sign(body) });
  };

  it.each([
    ['tracking_request.succeeded', 'tracking_request'],
    ['tracking_request.failed', 'tracking_request'],
    ['container.transport.vessel_arrived', 'transport_event'],
    ['container.transport.vessel_departed', 'transport_event'],
    ['container.transport.available', 'transport_event'],
    ['container.updated', 'container_updated_event'],
    ['shipment.estimated.arrival', 'estimated_event'],
  ])('handles %s', async (event, referenceType) => {
    const res = await post(notification(event, referenceType));
    expect(res.status).toBe(200);
  });

  it('accepts events it does not handle', async () => {
    const spy = console.log;
    const res = await post(notification('container.transport.rail_loaded'));
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith('Unhandled event: container.transport.rail_loaded');
  });

  it('skips a duplicate delivery of the same data.id', async () => {
    const payload = notification('container.updated', 'container_updated_event');
    const spy = console.log;
    expect((await post(payload)).status).toBe(200);
    expect((await post(payload)).status).toBe(200);
    expect(spy).toHaveBeenCalledWith(`Duplicate notification ${payload.data.id}, skipping`);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await send(body, { 'X-T49-Webhook-Signature': sign(body) });
    expect(res.status).toBe(400);
  });

  it('returns 400 when data.attributes.event is missing', async () => {
    const res = await post({ data: { id: 'x', type: 'webhook_notification', attributes: {} } });
    expect(res.status).toBe(400);
  });
});
