import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/belco/route';
import { verifyBelcoSignature } from '../lib/belco';

const SECRET = 'belco_test_webhook_secret';

function sign(body: string, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/webhooks/belco', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

// Shapes from Belco's "Sample payloads" and "Supported events" docs
const created = JSON.stringify({
  requestId: 'NMbsKcBA64MchrKjQ',
  eventName: 'conversation.created',
  date: '2025-06-11T09:15:09.159Z',
  payload: {
    shopId: 'G4ag3eGyiKibrGcM7',
    conversation: { _id: 'sSzxq7tMBFmCY28o8', channel: 'chat', status: 'open' },
    conversation_item: { _id: 'rxxtPXZng45rALFjE', type: 'message', body: 'test chat' },
  },
});
const closed = JSON.stringify({
  requestId: 'HjheznXCgdmiuSTYa',
  eventName: 'conversation.closed',
  date: '2025-06-11T09:18:14.109Z',
  payload: {
    shopId: 'G4ag3eGyiKibrGcM7',
    conversation: { _id: 'sSzxq7tMBFmCY28o8', channel: 'chat', status: 'open' },
    conversation_item: { _id: '4BJMTqPwP7MDJis6G', type: 'close' },
  },
});
const answered = JSON.stringify({
  requestId: 'call-answered-1',
  eventName: 'call.answered',
  date: '2020-11-12T00:00:00Z',
  payload: { shopId: 'm5phzRDim8GMsdMhP', call: { direction: 'inbound', status: 'answered' } },
});
const unknown = JSON.stringify({ requestId: 'x-1', eventName: 'conversation.snoozed', payload: {} });

beforeAll(() => {
  process.env.BELCO_WEBHOOK_SECRET = SECRET;
});

describe('verifyBelcoSignature', () => {
  const buf = Buffer.from(created);
  it('accepts a valid signature, including uppercase hex', () => {
    expect(verifyBelcoSignature(buf, sign(created), SECRET)).toBe(true);
    expect(verifyBelcoSignature(buf, sign(created).toUpperCase(), SECRET)).toBe(true);
  });
  it('rejects wrong secret, prefix, missing header, bad hex, wrong length', () => {
    expect(verifyBelcoSignature(buf, sign(created, 'other'), SECRET)).toBe(false);
    expect(verifyBelcoSignature(buf, 'sha256=' + sign(created), SECRET)).toBe(false);
    expect(verifyBelcoSignature(buf, null, SECRET)).toBe(false);
    expect(verifyBelcoSignature(buf, '', SECRET)).toBe(false);
    expect(verifyBelcoSignature(buf, 'zz'.repeat(32), SECRET)).toBe(false);
    expect(verifyBelcoSignature(buf, 'abcd', SECRET)).toBe(false);
  });
});

describe('POST /webhooks/belco', () => {
  it.each([
    ['conversation.created', created],
    ['conversation.closed', closed],
    ['call.answered', answered],
    ['an unhandled event', unknown],
  ])('accepts a signed %s event', async (_n, body) => {
    const res = await POST(makeRequest(body, { 'x-hook-signature': sign(body) }));
    expect(res.status).toBe(200);
    expect((await res.json()).received).toBe(true);
  });

  it('flags a repeated requestId as a duplicate', async () => {
    const body = JSON.stringify({ requestId: 'dup-1', eventName: 'call.closed', payload: { call: {} } });
    const first = await POST(makeRequest(body, { 'x-hook-signature': sign(body) }));
    const second = await POST(makeRequest(body, { 'x-hook-signature': sign(body) }));
    expect(await first.json()).toEqual({ received: true });
    expect(await second.json()).toEqual({ received: true, duplicate: true });
  });

  it('rejects an unsigned request with 401', async () => {
    expect((await POST(makeRequest(created))).status).toBe(401);
  });

  it('rejects a bad signature with 401', async () => {
    expect((await POST(makeRequest(created, { 'x-hook-signature': sign(created, 'wrong') }))).status).toBe(401);
  });

  it('rejects a malformed signature with 401', async () => {
    expect((await POST(makeRequest(created, { 'x-hook-signature': 'abc' }))).status).toBe(401);
  });

  it('rejects a tampered body with 401', async () => {
    const res = await POST(makeRequest(created.replace('chat', 'mail'), { 'x-hook-signature': sign(created) }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed but malformed JSON body', async () => {
    const bad = '{not json';
    expect((await POST(makeRequest(bad, { 'x-hook-signature': sign(bad) }))).status).toBe(400);
  });

  it.each(['null', '42', '[1,2]'])('returns 400 for a signed non-object body %s', async (body) => {
    expect((await POST(makeRequest(body, { 'x-hook-signature': sign(body) }))).status).toBe(400);
  });
});
