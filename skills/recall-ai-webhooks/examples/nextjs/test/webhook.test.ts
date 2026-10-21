import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/recall-ai/route';
import { verifyRecallSignature } from '../lib/recall-signature';

// Recall.ai secrets are "whsec_" + base64 of the raw HMAC key (Standard Webhooks format)
const SECRET = 'whsec_' + Buffer.from('recall-ai-test-secret-key-32byte').toString('base64');
const OTHER_SECRET = 'whsec_' + Buffer.from('another-recall-secret-key-32byte').toString('base64');

beforeAll(() => {
  process.env.RECALL_WEBHOOK_SECRET = SECRET;
});

const nowSeconds = () => Math.floor(Date.now() / 1000);

function sign(id: string, timestamp: number, payload: string, secret = SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  return crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest('base64');
}

function signedHeaders(
  payload: string,
  {
    prefix = 'webhook',
    secrets = [SECRET],
    id = 'msg_loFOjxBNrRLzqYUf',
    timestamp = nowSeconds(),
  }: { prefix?: string; secrets?: string[]; id?: string; timestamp?: number } = {}
): Record<string, string> {
  return {
    [`${prefix}-id`]: id,
    [`${prefix}-timestamp`]: String(timestamp),
    [`${prefix}-signature`]: secrets.map((s) => `v1,${sign(id, timestamp, payload, s)}`).join(' '),
  };
}

function post(payload: string, headers: Record<string, string>) {
  return POST(
    new NextRequest('http://localhost/webhooks/recall-ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: payload,
    })
  );
}

const botDone = JSON.stringify({
  event: 'bot.done',
  data: {
    data: { code: 'done', sub_code: null, updated_at: '2026-10-21T12:00:00.000Z' },
    bot: { id: '8b6e2f6a-4f1c-4d2a-9d2e-1c3b5a7d9e0f', metadata: {} },
  },
});

describe('POST /webhooks/recall-ai', () => {
  it('accepts a valid webhook-* signature', async () => {
    const res = await post(botDone, signedHeaders(botDone));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts legacy svix-* headers', async () => {
    const res = await post(botDone, signedHeaders(botDone, { prefix: 'svix' }));
    expect(res.status).toBe(200);
  });

  it('accepts when any signature in the list matches (secret rotation)', async () => {
    const res = await post(botDone, signedHeaders(botDone, { secrets: [OTHER_SECRET, SECRET] }));
    expect(res.status).toBe(200);
  });

  it('rejects missing headers', async () => {
    const res = await post(botDone, {});
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const res = await post(botDone, signedHeaders(botDone, { secrets: [OTHER_SECRET] }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const headers = signedHeaders(botDone);
    const res = await post(botDone.replace('bot.done', 'bot.fatal'), headers);
    expect(res.status).toBe(400);
  });

  it('rejects a re-serialised body', async () => {
    const pretty = JSON.stringify(JSON.parse(botDone), null, 2);
    const res = await post(pretty, signedHeaders(botDone));
    expect(res.status).toBe(400);
  });

  it('rejects a stale timestamp', async () => {
    const res = await post(botDone, signedHeaders(botDone, { timestamp: nowSeconds() - 600 }));
    expect(res.status).toBe(400);
  });

  it('ignores non-v1 signature versions', async () => {
    const headers = signedHeaders(botDone);
    headers['webhook-signature'] = headers['webhook-signature'].replace('v1,', 'v2,');
    const res = await post(botDone, headers);
    expect(res.status).toBe(400);
  });

  it('rejects malformed base64 signatures', async () => {
    const headers = signedHeaders(botDone);
    headers['webhook-signature'] = 'v1,not-base64!!';
    const res = await post(botDone, headers);
    expect(res.status).toBe(400);
  });

  it.each([
    ['bot.joining_call', { bot: { id: 'b1', metadata: {} }, data: { code: 'joining_call', sub_code: null } }],
    ['bot.in_call_recording', { bot: { id: 'b1', metadata: {} }, data: { code: 'in_call_recording', sub_code: null } }],
    ['bot.call_ended', { bot: { id: 'b1', metadata: {} }, data: { code: 'call_ended', sub_code: 'call_ended_by_host' } }],
    ['bot.fatal', { bot: { id: 'b1', metadata: {} }, data: { code: 'fatal', sub_code: 'meeting_not_found' } }],
    ['recording.done', { recording: { id: 'r1', metadata: {} }, bot: { id: 'b1', metadata: {} }, data: { code: 'done' } }],
    ['recording.failed', { recording: { id: 'r1', metadata: {} }, data: { code: 'failed', sub_code: 'x' } }],
    ['transcript.done', { transcript: { id: 't1', metadata: {} }, recording: { id: 'r1' }, data: { code: 'done' } }],
    ['transcript.failed', { transcript: { id: 't1', metadata: {} }, data: { code: 'failed', sub_code: 'x' } }],
    ['calendar.update', { calendar_id: 'c1' }],
    ['calendar.sync_events', { calendar_id: 'c1', last_updated_ts: '2026-10-21T12:00:00Z' }],
    ['participant_events.join', { data: { participant: { id: 1, name: 'Ada' } }, bot: { id: 'b1' } }],
    ['transcript.data', { data: { words: [] }, bot: { id: 'b1' } }],
    ['audio_mixed.done', { audio_mixed: { id: 'a1' } }],
  ])('handles %s', async (type, data) => {
    const payload = JSON.stringify({ event: type, data });
    const res = await post(payload, signedHeaders(payload));
    expect(res.status).toBe(200);
  });
});

describe('verifyRecallSignature', () => {
  it('rejects a secret without the whsec_ prefix', () => {
    const headers = new Headers(signedHeaders(botDone));
    expect(verifyRecallSignature(botDone, headers, 'plain-secret').valid).toBe(false);
  });

  it('skips the timestamp window when tolerance is 0', () => {
    const headers = new Headers(signedHeaders(botDone, { timestamp: 1731705121 }));
    expect(verifyRecallSignature(botDone, headers, SECRET, 0).valid).toBe(true);
  });

  it('rejects a non-numeric timestamp', () => {
    const headers = new Headers({ ...signedHeaders(botDone), 'webhook-timestamp': 'abc' });
    expect(verifyRecallSignature(botDone, headers, SECRET).valid).toBe(false);
  });
});
