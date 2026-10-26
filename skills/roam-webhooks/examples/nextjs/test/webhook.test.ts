import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/roam/route';

// Roam signing secrets are 'whsec_' + base64-encoded key bytes
const WEBHOOK_SECRET = 'whsec_' + Buffer.from('test_roam_signing_secret_key').toString('base64');

/**
 * Sign a payload as Roam does (Standard Webhooks):
 * base64(HMAC-SHA256(base64decode(secret after whsec_), "{id}.{timestamp}.{body}"))
 */
function sign(body: string, id: string, timestamp: number, secret = WEBHOOK_SECRET): string {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return `v1,${signature}`;
}

let counter = 0;
// Each test uses a fresh webhook-id unless it is testing dedupe
const freshId = () => `msg_${++counter}`;

interface Overrides {
  id?: string;
  timestamp?: number;
  signature?: string;
  secret?: string;
  omit?: string;
  sendBody?: string;
  contentType?: string;
}

function buildRequest(body: string, o: Overrides = {}): NextRequest {
  const id = o.id ?? freshId();
  const timestamp = o.timestamp ?? Math.floor(Date.now() / 1000);
  const headers: Record<string, string> = {
    'content-type': o.contentType ?? 'application/json',
    'webhook-id': id,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': o.signature ?? sign(body, id, timestamp, o.secret),
  };
  if (o.omit) delete headers[o.omit];
  return new NextRequest('http://localhost/webhooks/roam', {
    method: 'POST',
    headers,
    body: o.sendBody ?? body,
  });
}

const envelope = (type: string, data: Record<string, unknown>) => ({
  type,
  eventId: '0197f9a1-7d2e-7cc3-9f6a-8b1c2d3e4f5a',
  timestamp: '2026-07-07T18:23:45.123456Z',
  apiVersion: '2026-07-07',
  data,
});

const chatMessage = envelope('chat.message', { chatId: 'c1', userId: 'u1', version: 1, text: 'hi' });
const chatDeleted = envelope('chat.message', { chatId: 'c1', userId: 'u1', version: 2, contentType: 'deleted' });
const chatReaction = envelope('chat.reaction', { chatId: 'c1', userId: 'u1' });
const meetingStarted = envelope('meeting.started', { id: 'm1' });
const meetingEnded = envelope('meeting.ended', { id: 'm1', title: 'Weekly Team Standup', hasVideo: true });
const lobbyBooked = envelope('lobby.booked', { lobbyId: 'l1' });
const magicastCreated = envelope('magicast.created', { id: 'mg1' });
const onairCreated = envelope('onair.event.created', { id: 'e1' });
const legacyBody = { type: 'message', sender: 'B-123', chat: 'D-456', text: 'hi' };

describe('POST /webhooks/roam', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.ROAM_WEBHOOK_SIGNING_SECRET = WEBHOOK_SECRET;
  });

  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['chat.message', chatMessage],
    ['chat.message (deleted)', chatDeleted],
    ['chat.reaction', chatReaction],
    ['meeting.started', meetingStarted],
    ['meeting.ended', meetingEnded],
    ['lobby.booked', lobbyBooked],
    ['magicast.created', magicastCreated],
    ['onair.event.created', onairCreated],
  ])('accepts a correctly signed %s event', async (_name, payload) => {
    const res = await POST(buildRequest(JSON.stringify(payload)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts any content type (raw body is read for every type)', async () => {
    const res = await POST(buildRequest(JSON.stringify(chatMessage), { contentType: 'text/plain' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts when one of several space-delimited signatures matches', async () => {
    const body = JSON.stringify(chatMessage);
    const id = freshId();
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = `v1,aW52YWxpZHNpZ25hdHVyZQ== ${sign(body, id, timestamp)}`;
    const res = await POST(buildRequest(body, { id, timestamp, signature }));
    expect(res.status).toBe(200);
  });

  it('dedupes a repeated webhook-id', async () => {
    const body = JSON.stringify(chatMessage);
    const id = freshId();
    const first = await POST(buildRequest(body, { id }));
    const second = await POST(buildRequest(body, { id }));
    expect(await first.json()).toEqual({ received: true });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ received: true, duplicate: true });
  });

  it('skips the legacy body without consuming the webhook-id', async () => {
    const id = freshId();
    const a = await POST(buildRequest(JSON.stringify(legacyBody), { id }));
    const b = await POST(buildRequest(JSON.stringify(chatMessage), { id }));
    expect(await a.json()).toEqual({ received: true, ignored: 'legacy body' });
    expect(await b.json()).toEqual({ received: true });
  });

  it('rejects an invalid signature', async () => {
    const res = await POST(buildRequest(JSON.stringify(chatMessage), { signature: 'v1,aW52YWxpZHNpZ25hdHVyZQ==' }));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with a different secret', async () => {
    const other = 'whsec_' + Buffer.from('some_other_secret').toString('base64');
    const res = await POST(buildRequest(JSON.stringify(chatMessage), { secret: other }));
    expect(res.status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    const tampered = JSON.stringify({ ...chatMessage, data: { ...chatMessage.data, text: 'tampered' } });
    const res = await POST(buildRequest(JSON.stringify(chatMessage), { sendBody: tampered }));
    expect(res.status).toBe(400);
  });

  it('rejects a timestamp older than 5 minutes (library window)', async () => {
    const timestamp = Math.floor(Date.now() / 1000) - 600;
    const res = await POST(buildRequest(JSON.stringify(chatMessage), { timestamp }));
    expect(res.status).toBe(400);
  });

  it.each(['webhook-id', 'webhook-timestamp', 'webhook-signature'])('rejects a request missing %s (unsigned delivery)', async (header) => {
    const res = await POST(buildRequest(JSON.stringify(chatMessage), { omit: header }));
    expect(res.status).toBe(400);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.ROAM_WEBHOOK_SIGNING_SECRET;
    const res = await POST(buildRequest(JSON.stringify(chatMessage)));
    expect(res.status).toBe(500);
  });
});
