import crypto from 'node:crypto';
import { jest } from '@jest/globals';
import request from 'supertest';
import { app, secretToKey, verifyIncidentIoSignature } from '../src/index.js';

// Standard Webhooks secrets are 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
const TEST_SECRET = 'whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw==';

// Same algorithm incident.io (Svix) uses: base64(HMAC-SHA256(key, `${id}.${timestamp}.${body}`))
function sign(payload, msgId, timestamp, secret = TEST_SECRET) {
  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice('whsec_'.length), 'base64')
    : Buffer.from(secret, 'utf8');
  const signature = crypto.createHmac('sha256', key).update(`${msgId}.${timestamp}.${payload}`).digest('base64');
  return `v1,${signature}`;
}

const now = () => Math.floor(Date.now() / 1000).toString();

function send(payload, { msgId = `msg_${crypto.randomBytes(12).toString('hex')}`, timestamp = now(), signature, secret } = {}) {
  return request(app)
    .post('/webhooks/incident-io')
    .set('Content-Type', 'application/json')
    .set('webhook-id', msgId)
    .set('webhook-timestamp', timestamp)
    .set('webhook-signature', signature ?? sign(payload, msgId, timestamp, secret))
    .send(payload);
}

const envelope = (eventType, resource) => JSON.stringify({ event_type: eventType, [eventType]: resource });

describe('incident.io webhook handler', () => {
  let logSpy;

  beforeEach(() => {
    process.env.INCIDENT_IO_WEBHOOK_SECRET = TEST_SECRET;
    delete process.env.INCIDENT_IO_WEBHOOK_TOLERANCE_SECONDS;
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.each([
    ['public_incident.incident_created_v2', { id: 'inc1', reference: 'INC-123', name: 'Our database is sad', incident_status: { name: 'Triage' } }],
    ['public_incident.incident_status_updated_v2', { incident: { reference: 'INC-123' }, previous_status: { name: 'Triage' }, new_status: { name: 'Closed' } }],
    ['public_incident.follow_up_created_v2', { id: 'fu1', incident_id: 'inc1', status: 'outstanding' }],
    ['public_alert.alert_created_v1', { id: 'al1', title: 'PG::Error failed to connect', status: 'firing' }],
    ['public_escalation.escalation_status_updated_v1', { escalation: { id: 'esc1' }, previous_status: 'pending', new_status: 'acked' }],
    ['schedule.shift_change_v1', { schedule: { name: 'Primary' }, current_users: [{ name: 'Lisa' }], previous_users: [] }],
    ['status_page_incident.update_shared_v1', { status_page_incident: { name: 'Elevated API latency', incident_status: 'investigating' } }],
  ])('accepts a signed %s and reads the resource from body[event_type]', async (eventType, resource) => {
    const res = await send(envelope(eventType, resource));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, eventType });
    expect(logSpy.mock.calls.flat().join(' ')).not.toContain('undefined');
  });

  test('handles a private (id-only) event without assuming detail fields', async () => {
    const res = await send(envelope('private_incident.incident_created_v2', { id: 'abc123' }));
    expect(res.status).toBe(200);
    expect(logSpy.mock.calls.flat().join(' ')).toContain('private resource abc123');
  });

  test('handles private membership events', async () => {
    const res = await send(
      envelope('private_incident.membership_granted_v1', { actor_user_id: 'u0', incident_id: 'inc1', user_id: 'u1' })
    );
    expect(res.status).toBe(200);
    expect(logSpy.mock.calls.flat().join(' ')).toContain('user u1 on incident inc1');
  });

  test('accepts unknown event types with 200', async () => {
    const res = await send(envelope('public_incident.something_new_v9', { id: 'x' }));
    expect(res.status).toBe(200);
  });

  test('accepts an unprefixed secret as UTF-8 bytes', async () => {
    process.env.INCIDENT_IO_WEBHOOK_SECRET = 'plain-text-secret';
    const res = await send(envelope('schedule.created_v1', { id: 's1', name: 'Primary' }), { secret: 'plain-text-secret' });
    expect(res.status).toBe(200);
  });

  test('accepts when any v1 entry matches (secret rotation)', async () => {
    const payload = envelope('schedule.updated_v1', { id: 's1', name: 'Primary' });
    const msgId = 'msg_rotation';
    const ts = now();
    const old = sign(payload, msgId, ts, 'whsec_b2xkX3NlY3JldF9rZXk=');
    const current = sign(payload, msgId, ts);
    const res = await send(payload, { msgId, timestamp: ts, signature: `${old} ${current}` });
    expect(res.status).toBe(200);
  });

  test('ignores entries whose version is not exactly v1', async () => {
    const payload = envelope('schedule.deleted_v1', { id: 's1' });
    const msgId = 'msg_version';
    const ts = now();
    const digest = sign(payload, msgId, ts).slice('v1,'.length);
    const res = await send(payload, { msgId, timestamp: ts, signature: `v1a,${digest} v2,${digest}` });
    expect(res.status).toBe(400);
  });

  test('rejects a tampered body', async () => {
    const payload = envelope('public_alert.alert_resolved_v1', { id: 'al1' });
    const msgId = 'msg_tamper';
    const ts = now();
    const signature = sign(payload, msgId, ts);
    const res = await send(payload.replace('al1', 'al2'), { msgId, timestamp: ts, signature });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid signature');
  });

  test('rejects a signature made with a different secret', async () => {
    const payload = envelope('public_alert.alert_created_v1', { id: 'al1' });
    const msgId = 'msg_wrong';
    const ts = now();
    const res = await send(payload, { msgId, timestamp: ts, signature: sign(payload, msgId, ts, 'whsec_d3Jvbmc=') });
    expect(res.status).toBe(400);
  });

  test('rejects a valid digest with junk appended', async () => {
    const payload = envelope('public_alert.alert_created_v1', { id: 'al1' });
    const msgId = 'msg_junk';
    const ts = now();
    const res = await send(payload, { msgId, timestamp: ts, signature: `${sign(payload, msgId, ts)}junk` });
    expect(res.status).toBe(400);
  });

  test('rejects a non-ASCII signature header with 400, not 500', async () => {
    const payload = envelope('public_alert.alert_created_v1', { id: 'al1' });
    const res = await send(payload, { signature: 'v1,ééé' });
    expect(res.status).toBe(400);
  });

  test('rejects missing headers', async () => {
    const res = await request(app)
      .post('/webhooks/incident-io')
      .set('Content-Type', 'application/json')
      .send(envelope('schedule.created_v1', { id: 's1' }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required webhook headers');
  });

  test.each(['abc', '-5', '1676033031.5', '0'])('rejects a malformed webhook-timestamp %p', async (ts) => {
    const payload = envelope('schedule.created_v1', { id: 's1' });
    const res = await send(payload, { timestamp: ts });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid webhook-timestamp');
  });

  test('accepts an old timestamp when no tolerance is configured', async () => {
    const old = (Math.floor(Date.now() / 1000) - 6 * 3600).toString();
    const res = await send(envelope('schedule.created_v1', { id: 's1' }), { timestamp: old });
    expect(res.status).toBe(200);
  });

  test('rejects an old timestamp when a tolerance is configured', async () => {
    process.env.INCIDENT_IO_WEBHOOK_TOLERANCE_SECONDS = '300';
    const old = (Math.floor(Date.now() / 1000) - 600).toString();
    const res = await send(envelope('schedule.created_v1', { id: 's1' }), { timestamp: old });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Timestamp outside tolerance window');
  });

  test('rejects signed but invalid JSON', async () => {
    const res = await send('not json');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });

  test('rejects a body without event_type', async () => {
    const res = await send(JSON.stringify({ data: {} }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing event_type');
  });

  test('returns 500 when the secret is missing', async () => {
    delete process.env.INCIDENT_IO_WEBHOOK_SECRET;
    const res = await send(envelope('schedule.created_v1', { id: 's1' }));
    expect(res.status).toBe(500);
  });
});

describe('secretToKey', () => {
  test('base64-decodes a whsec_ secret', () => {
    expect(secretToKey(TEST_SECRET).toString()).toBe('test_secret_key_for-webhooks');
  });

  test('uses UTF-8 bytes for an unprefixed secret', () => {
    expect(secretToKey('abc').toString()).toBe('abc');
  });

  test.each(['', 'whsec_', 'whsec_!!!!', undefined])('rejects %p', (secret) => {
    expect(secretToKey(secret)).toBeNull();
  });
});

describe('verifyIncidentIoSignature', () => {
  test('matches the documented signed-content format', () => {
    const key = secretToKey(TEST_SECRET);
    const body = Buffer.from('{"event_type":"schedule.created_v1"}');
    const sig = crypto.createHmac('sha256', key).update(`123.1676033031.${body}`).digest('base64');
    const result = verifyIncidentIoSignature(body, { id: '123', timestamp: '1676033031', signature: `v1,${sig}` }, key);
    expect(result.ok).toBe(true);
  });
});
