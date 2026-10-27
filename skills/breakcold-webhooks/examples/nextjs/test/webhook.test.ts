// Generated with: breakcold-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const TEST_SECRET = 'breakcold_test_signing_secret';
process.env.BREAKCOLD_WEBHOOK_SECRET = TEST_SECRET;

import { POST } from '../app/webhooks/breakcold/route';
import { isTimestampFresh, verifyBreakcoldSignature } from '../lib/breakcold';

// Same algorithm as Breakcold: hex HMAC-SHA256 over `${timestamp}.${rawBody}`.
function sign(body: string | Buffer, timestamp: string, secret = TEST_SECRET): string {
  const bytes = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.'), Buffer.from(body)]);
  return crypto.createHmac('sha256', secret).update(bytes).digest('hex');
}

const envelope = (event: string, data: unknown) => ({
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

const EVENTS: Record<string, unknown> = {
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
function makeRequest(opts: {
  event?: string;
  body?: string;
  ts?: string | null;
  sig?: string | null;
  contentType?: string;
  headers?: Record<string, string>;
} = {}) {
  const event = opts.event ?? 'record.created';
  const ts = opts.ts === undefined ? String(Math.floor(Date.now() / 1000)) : opts.ts;
  const raw = opts.body ?? JSON.stringify(envelope(event, EVENTS[event]));
  const sig = opts.sig === undefined ? `sha256=${sign(raw, ts ?? '')}` : opts.sig;
  const headers: Record<string, string> = {
    'content-type': opts.contentType ?? 'application/json',
    'x-webhook-event': event,
    'x-webhook-delivery-id': `delivery_${++n}`,
    ...opts.headers,
  };
  if (sig !== null) headers['x-webhook-signature'] = sig;
  if (ts !== null) headers['x-webhook-timestamp'] = ts;
  return new NextRequest('http://localhost:3000/webhooks/breakcold', { method: 'POST', headers, body: raw });
}

describe('verifyBreakcoldSignature', () => {
  const body = Buffer.from('{"event":"webhook.test"}');
  const ts = '1773921600';
  const hex = sign(body, ts);

  it('accepts sha256= prefixed and bare digests, any hex case', () => {
    expect(verifyBreakcoldSignature(body, `sha256=${hex}`, ts, TEST_SECRET)).toBe(true);
    expect(verifyBreakcoldSignature(body, hex, ts, TEST_SECRET)).toBe(true);
    expect(verifyBreakcoldSignature(body, `sha256=${hex.toUpperCase()}`, ts, TEST_SECRET)).toBe(true);
  });

  it('signs bytes: non-UTF-8 body bytes are not decoded', () => {
    const binary = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]);
    expect(verifyBreakcoldSignature(binary, sign(binary, ts), ts, TEST_SECRET)).toBe(true);
  });

  it('rejects wrong secret, tampered body, changed timestamp and the body-only MAC', () => {
    expect(verifyBreakcoldSignature(body, hex, ts, 'other_secret')).toBe(false);
    expect(verifyBreakcoldSignature(Buffer.from('{"event":"record.deleted"}'), hex, ts, TEST_SECRET)).toBe(false);
    expect(verifyBreakcoldSignature(body, hex, '1773921601', TEST_SECRET)).toBe(false);
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
    expect(verifyBreakcoldSignature(body, hex, null, TEST_SECRET)).toBe(false);
    expect(verifyBreakcoldSignature(body, null, ts, TEST_SECRET)).toBe(false);
    expect(verifyBreakcoldSignature(body, hex, ts, '')).toBe(false);
  });
});

describe('isTimestampFresh', () => {
  it('is off by default and enforces the window when enabled', () => {
    expect(isTimestampFresh('1', 0, 1e9)).toBe(true);
    expect(isTimestampFresh('1', NaN, 1e9)).toBe(true);
    expect(isTimestampFresh('1000', 300, 1100)).toBe(true);
    expect(isTimestampFresh('1000', 300, 1400)).toBe(false);
    expect(isTimestampFresh('abc', 300, 1000)).toBe(false);
  });
});

describe('POST /webhooks/breakcold', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.BREAKCOLD_WEBHOOK_TOLERANCE_SECONDS;
    process.env.BREAKCOLD_WEBHOOK_SECRET = TEST_SECRET;
  });

  it.each(Object.keys(EVENTS))('accepts a signed %s event', async (event) => {
    const res = await POST(makeRequest({ event }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts any Content-Type (raw bytes are verified)', async () => {
    expect((await POST(makeRequest({ contentType: 'text/plain' }))).status).toBe(200);
  });

  it('accepts a bare digest without the sha256= prefix', async () => {
    const raw = JSON.stringify(envelope('record.created', record));
    const ts = '1773921600';
    expect((await POST(makeRequest({ body: raw, ts, sig: sign(raw, ts) }))).status).toBe(200);
  });

  it('accepts old timestamps by default, rejects them when the tolerance is enabled', async () => {
    expect((await POST(makeRequest({ ts: '1000000000' }))).status).toBe(200);
    process.env.BREAKCOLD_WEBHOOK_TOLERANCE_SECONDS = '300';
    expect((await POST(makeRequest({ ts: '1000000000' }))).status).toBe(401);
    expect((await POST(makeRequest())).status).toBe(200);
  });

  it('returns 401 for a missing signature or timestamp', async () => {
    expect((await POST(makeRequest({ sig: null }))).status).toBe(401);
    expect((await POST(makeRequest({ ts: null, sig: 'sha256=' + 'a'.repeat(64) }))).status).toBe(401);
  });

  it('returns 401 for an invalid signature or altered body', async () => {
    expect((await POST(makeRequest({ sig: `sha256=${'0'.repeat(64)}` }))).status).toBe(401);
    expect((await POST(makeRequest({ sig: 'garbage' }))).status).toBe(401);
    const ts = '1773921600';
    const signed = JSON.stringify(envelope('record.created', record));
    const res = await POST(makeRequest({ body: signed.replace('Ada', 'Eve'), ts, sig: `sha256=${sign(signed, ts)}` }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    expect((await POST(makeRequest({ body: 'not json' }))).status).toBe(400);
  });

  it('ignores duplicate deliveries', async () => {
    const raw = JSON.stringify(envelope('note.created', note));
    const send = () => POST(makeRequest({ body: raw, headers: { 'x-webhook-delivery-id': 'dup_1' } }));
    expect(await (await send()).json()).toEqual({ received: true });
    expect(await (await send()).json()).toEqual({ received: true, duplicate: true });
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.BREAKCOLD_WEBHOOK_SECRET;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await POST(makeRequest())).status).toBe(500);
  });
});
