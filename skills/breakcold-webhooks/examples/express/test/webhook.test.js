// Generated with: breakcold-webhooks skill
// https://github.com/hookdeck/webhook-skills

const request = require('supertest');
const crypto = require('crypto');

const TEST_SECRET = 'breakcold_test_signing_secret';
process.env.BREAKCOLD_WEBHOOK_SECRET = TEST_SECRET;

const { app, verifyBreakcoldSignature, isTimestampFresh } = require('../src/index');

// Same algorithm as Breakcold: hex HMAC-SHA256 over `${timestamp}.${rawBody}`.
function sign(body, timestamp, secret = TEST_SECRET) {
  const bytes = Buffer.concat([Buffer.from(String(timestamp), 'latin1'), Buffer.from('.'), Buffer.from(body)]);
  return crypto.createHmac('sha256', secret).update(bytes).digest('hex');
}

const envelope = (event, data) => ({
  eventId: 'evt_abc123',
  timestamp: '2026-03-19T12:00:00.000Z',
  workspaceId: 'workspace_id',
  event,
  data,
});

// Payloads as shown in https://docs.breakcold.com/api/webhooks
const record = { id: 'record_id', objectType: 'person', objectTypeName: 'Person', name: 'Ada Lovelace',
  fields: { name: 'Ada Lovelace', email: 'ada@example.com' } };
const note = { recordId: 'record_id', noteId: 'note_id', title: 'Follow up' };
const task = { recordId: 'record_id', taskId: 'task_id', title: 'Send proposal', status: 'todo', dueAt: '2026-03-20T09:00:00.000Z' };
const relation = { sourceRecordId: 'record_id', targetRecordId: 'related_record_id', fieldDefinitionId: 'field_definition_id', fieldSlug: 'company' };
const call = { recordId: 'record_id', callId: 'call_recording_id', recordName: 'Ada Lovelace', meetingTitle: 'Discovery call' };
const file = { recordId: 'record_id', fileName: 'contract.pdf' };

const EVENTS = {
  'record.created': record,
  'record.updated': record,
  'record.deleted': { id: 'record_id', deleted: true },
  'note.created': note,
  'note.updated': note,
  'note.deleted': note,
  'task.created': task,
  'task.completed': { ...task, status: 'done' },
  'relation.added': relation,
  'relation.removed': relation,
  'call.linked': call,
  'call.unlinked': call,
  'file.uploaded': file,
  'file.deleted': file,
  'webhook.test': { message: 'This is a test webhook delivery from Breakcold.' },
};

let n = 0;
function post({ event = 'record.created', data, body, ts = String(Math.floor(Date.now() / 1000)), sig, headers = {}, contentType = 'application/json' } = {}) {
  const raw = body ?? JSON.stringify(envelope(event, data ?? EVENTS[event]));
  const signature = sig === undefined ? `sha256=${sign(raw, ts)}` : sig;
  const req = request(app).post('/webhooks/breakcold').set('Content-Type', contentType)
    .set('X-Webhook-Event', event).set('X-Webhook-Delivery-Id', `delivery_${++n}`);
  if (signature !== null) req.set('X-Webhook-Signature', signature);
  if (ts !== null) req.set('X-Webhook-Timestamp', ts);
  for (const [k, v] of Object.entries(headers)) req.set(k, v);
  return req.send(raw);
}

describe('verifyBreakcoldSignature', () => {
  const body = Buffer.from('{"event":"webhook.test"}');
  const ts = '1773921600';
  const hex = sign(body, ts);

  it('accepts sha256= prefixed and bare digests', () => {
    expect(verifyBreakcoldSignature(body, `sha256=${hex}`, ts, TEST_SECRET)).toBe(true);
    expect(verifyBreakcoldSignature(body, hex, ts, TEST_SECRET)).toBe(true);
  });

  it('compares hex case-insensitively', () => {
    expect(verifyBreakcoldSignature(body, `sha256=${hex.toUpperCase()}`, ts, TEST_SECRET)).toBe(true);
  });

  it('signs bytes: non-UTF-8 body bytes are not decoded', () => {
    const binary = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]);
    expect(verifyBreakcoldSignature(binary, sign(binary, ts), ts, TEST_SECRET)).toBe(true);
  });

  it('rejects wrong secret, tampered body and changed timestamp', () => {
    expect(verifyBreakcoldSignature(body, hex, ts, 'other_secret')).toBe(false);
    expect(verifyBreakcoldSignature(Buffer.from('{"event":"record.deleted"}'), hex, ts, TEST_SECRET)).toBe(false);
    expect(verifyBreakcoldSignature(body, hex, '1773921601', TEST_SECRET)).toBe(false);
  });

  it('rejects the body-only MAC (the timestamp is signed)', () => {
    const bodyOnly = crypto.createHmac('sha256', TEST_SECRET).update(body).digest('hex');
    expect(verifyBreakcoldSignature(body, bodyOnly, ts, TEST_SECRET)).toBe(false);
  });

  it.each([
    ['empty', ''],
    ['prefix only', 'sha256='],
    ['short', 'sha256=abcd'],
    ['too long', `sha256=${hex}00`],
    ['non-hex', `sha256=${'z'.repeat(64)}`],
    ['wrong prefix', `sha1=${hex}`],
  ])('rejects malformed signature: %s', (_name, value) => {
    expect(verifyBreakcoldSignature(body, value, ts, TEST_SECRET)).toBe(false);
  });

  it('rejects missing timestamp, signature or secret', () => {
    expect(verifyBreakcoldSignature(body, hex, undefined, TEST_SECRET)).toBe(false);
    expect(verifyBreakcoldSignature(body, undefined, ts, TEST_SECRET)).toBe(false);
    expect(verifyBreakcoldSignature(body, hex, ts, '')).toBe(false);
  });
});

describe('isTimestampFresh', () => {
  it('is off by default (0, NaN)', () => {
    expect(isTimestampFresh('1', 0, 1e9)).toBe(true);
    expect(isTimestampFresh('1', NaN, 1e9)).toBe(true);
  });

  it('enforces the window when enabled', () => {
    expect(isTimestampFresh('1000', 300, 1100)).toBe(true);
    expect(isTimestampFresh('1000', 300, 1400)).toBe(false);
    expect(isTimestampFresh('abc', 300, 1000)).toBe(false);
  });
});

describe('POST /webhooks/breakcold', () => {
  let logSpy;
  beforeEach(() => { logSpy = jest.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => { logSpy.mockRestore(); delete process.env.BREAKCOLD_WEBHOOK_TOLERANCE_SECONDS; });

  it.each(Object.keys(EVENTS))('accepts a signed %s event', async (event) => {
    const res = await post({ event });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts any Content-Type (raw bytes are verified)', async () => {
    const res = await post({ contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  it('accepts a bare digest without the sha256= prefix', async () => {
    const raw = JSON.stringify(envelope('record.created', record));
    const ts = '1773921600';
    const res = await post({ body: raw, ts, sig: sign(raw, ts) });
    expect(res.status).toBe(200);
  });

  it('accepts old timestamps by default (retries and replays keep the original)', async () => {
    const res = await post({ ts: '1000000000' });
    expect(res.status).toBe(200);
  });

  it('rejects an old timestamp when the tolerance is enabled', async () => {
    process.env.BREAKCOLD_WEBHOOK_TOLERANCE_SECONDS = '300';
    expect((await post({ ts: '1000000000' })).status).toBe(401);
    expect((await post()).status).toBe(200);
  });

  it('returns 401 for a missing signature or timestamp', async () => {
    expect((await post({ sig: null })).status).toBe(401);
    expect((await post({ ts: null, sig: 'sha256=' + 'a'.repeat(64) })).status).toBe(401);
  });

  it('returns 401 for an invalid signature', async () => {
    expect((await post({ sig: `sha256=${'0'.repeat(64)}` })).status).toBe(401);
    expect((await post({ sig: 'garbage' })).status).toBe(401);
  });

  it('returns 401 when the body was altered after signing', async () => {
    const ts = '1773921600';
    const signed = JSON.stringify(envelope('record.created', record));
    const res = await post({ body: signed.replace('Ada', 'Eve'), ts, sig: `sha256=${sign(signed, ts)}` });
    expect(res.status).toBe(401);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    expect((await post({ body: 'not json' })).status).toBe(400);
  });

  it('ignores duplicate deliveries', async () => {
    const raw = JSON.stringify(envelope('note.created', note));
    const send = () => post({ body: raw, headers: { 'X-Webhook-Delivery-Id': 'dup_1' } });
    expect((await send()).body).toEqual({ received: true });
    expect((await send()).body).toEqual({ received: true, duplicate: true });
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.BREAKCOLD_WEBHOOK_SECRET;
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await post();
    errSpy.mockRestore();
    process.env.BREAKCOLD_WEBHOOK_SECRET = TEST_SECRET;
    expect(res.status).toBe(500);
  });
});
