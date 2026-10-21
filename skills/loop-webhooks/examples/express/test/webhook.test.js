import request from 'supertest';
import crypto from 'node:crypto';

// Svix-format secret: 'whsec_' + base64 key. This is the example secret from
// Loop's docs (https://docs.loop.com/developers/webhooks).
const TEST_SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
process.env.LOOP_WEBHOOK_SECRET = TEST_SECRET;

// Imported dynamically so the env var above is set first.
const { app } = await import('../src/index.js');

const EVENT_TYPES = [
  'artifact.root-ingestion-completed',
  'business-exception.created',
  'business-exception.deleted',
  'business-exception.reopened',
  'business-exception.resolved',
  'payable-invoice-review.completed',
  'payable-invoice.shipment-job-linked',
  'payable-invoice.shipment-job-unlinked',
  'payment.completed',
  'payment.failed',
  'payment.initiated',
  'quick-pay-relationship.revised',
  'receivable-invoice.created',
  'receivable-invoice.finalized',
  'receivable-invoice.voided',
  'shipment-job-artifact.assessed',
  'shipment-job-artifact.assigned',
  'shipment-job-artifact.unassessed',
  'shipment-job-artifact.unassigned',
  'shipment-job.normalized',
  'shipment-job.rerated',
  'test-event.created',
];

// Same algorithm Loop (via Svix) uses:
// base64(HMAC-SHA256(base64decode(secret minus whsec_), `${id}.${timestamp}.${body}`))
function sign(body, timestamp, msgId, secret = TEST_SECRET) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  return crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${body}`).digest('base64');
}

function makeEvent(eventType, overrides = {}) {
  return {
    eventCreatedAt: new Date().toISOString(),
    eventId: crypto.randomBytes(32).toString('base64url'),
    eventType,
    ...overrides,
  };
}

function send(body, { msgId = 'msg_' + crypto.randomBytes(12).toString('hex'), timestamp, signature } = {}) {
  const ts = timestamp ?? Math.floor(Date.now() / 1000).toString();
  return request(app)
    .post('/webhooks/loop')
    .set('Content-Type', 'application/json')
    .set('svix-id', msgId)
    .set('svix-timestamp', ts)
    .set('svix-signature', signature ?? `v1,${sign(body, ts, msgId)}`)
    .send(body);
}

describe('Loop webhook handler', () => {
  test('signing helper reproduces the docs example signature', () => {
    expect(sign('{"test": 2432232314}', '1614265330', 'msg_p5jXN8AQM9LWM0D4loKWxJek'))
      .toBe('g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=');
  });

  test('accepts a validly signed test-event.created', async () => {
    const body = JSON.stringify(makeEvent('test-event.created', { optionalString: 'hello' }));
    const res = await send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, eventType: 'test-event.created' });
  });

  test.each(EVENT_TYPES)('handles %s', async (eventType) => {
    const res = await send(JSON.stringify(makeEvent(eventType)));
    expect(res.status).toBe(200);
    expect(res.body.eventType).toBe(eventType);
  });

  test('accepts when any of several space-separated signatures matches (rotation)', async () => {
    const body = JSON.stringify(makeEvent('payment.completed'));
    const ts = Math.floor(Date.now() / 1000).toString();
    const msgId = 'msg_rotation';
    const signature = `v1,aW52YWxpZF9zaWduYXR1cmU= v1,${sign(body, ts, msgId)}`;
    const res = await send(body, { msgId, timestamp: ts, signature });
    expect(res.status).toBe(200);
  });

  test('rejects missing svix headers', async () => {
    const res = await request(app)
      .post('/webhooks/loop')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(makeEvent('payment.completed')));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test('rejects an invalid signature', async () => {
    const res = await send(JSON.stringify(makeEvent('payment.completed')), {
      signature: 'v1,aW52YWxpZF9zaWduYXR1cmU=',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const body = JSON.stringify(makeEvent('payment.completed'));
    const ts = Math.floor(Date.now() / 1000).toString();
    const other = 'whsec_' + crypto.randomBytes(24).toString('base64');
    const res = await send(body, { msgId: 'msg_x', timestamp: ts, signature: `v1,${sign(body, ts, 'msg_x', other)}` });
    expect(res.status).toBe(400);
  });

  test('rejects a body modified after signing', async () => {
    const body = JSON.stringify(makeEvent('payment.completed'));
    const ts = Math.floor(Date.now() / 1000).toString();
    const signature = `v1,${sign(body, ts, 'msg_y')}`;
    const tampered = body.replace('payment.completed', 'payment.failed');
    const res = await send(tampered, { msgId: 'msg_y', timestamp: ts, signature });
    expect(res.status).toBe(400);
  });

  test('rejects a timestamp outside the 5-minute tolerance', async () => {
    const body = JSON.stringify(makeEvent('payment.completed'));
    const ts = (Math.floor(Date.now() / 1000) - 600).toString();
    const res = await send(body, { timestamp: ts, msgId: 'msg_old', signature: `v1,${sign(body, ts, 'msg_old')}` });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp outside tolerance');
  });

  test('dedupes on payload eventId even when svix-id differs', async () => {
    const body = JSON.stringify(makeEvent('receivable-invoice.finalized'));
    const first = await send(body, { msgId: 'msg_first' });
    const second = await send(body, { msgId: 'msg_resend' });
    expect(first.status).toBe(200);
    expect(first.body.duplicate).toBeUndefined();
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
  });

  test('acknowledges unknown event types', async () => {
    const res = await send(JSON.stringify(makeEvent('something.new')));
    expect(res.status).toBe(200);
    expect(res.body.eventType).toBe('something.new');
  });

  test('health check', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
