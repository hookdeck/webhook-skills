import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifySendbirdWebhook } from '../lib/sendbird';
import { POST } from '../app/webhooks/sendbird/route';

// Sendbird master API token: an opaque 40-character hex string
const API_TOKEN = '0123456789abcdef0123456789abcdef01234567';

beforeAll(() => {
  process.env.SENDBIRD_API_TOKEN = API_TOKEN;
});

// Sendbird: hex HMAC-SHA256 of the raw body, keyed with the master API token
function sign(body: string, token: string = API_TOKEN): string {
  return crypto.createHmac('sha256', token).update(body).digest('hex');
}

function event(category: string): string {
  return JSON.stringify({
    category,
    sender: { user_id: 'Jeff', nickname: 'Oldies but goodies' },
    channel: { channel_url: 'sendbird_group_channel_1' },
    payload: { message: 'Hello 👋 café' },
  });
}

function makeRequest(body: string, signature: string | null = sign(body), contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature) headers['x-sendbird-signature'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/sendbird', { method: 'POST', headers, body });
}

describe('verifySendbirdWebhook', () => {
  it('accepts a valid signature (non-ASCII body)', () => {
    const body = event('group_channel:message_send');
    expect(verifySendbirdWebhook(body, sign(body), API_TOKEN)).toBe(true);
  });

  it('accepts uppercase hex', () => {
    const body = event('user:block');
    expect(verifySendbirdWebhook(body, sign(body).toUpperCase(), API_TOKEN)).toBe(true);
  });

  it('rejects invalid, empty, missing and wrong-token signatures', () => {
    const body = event('user:block');
    expect(verifySendbirdWebhook(body, 'deadbeef', API_TOKEN)).toBe(false);
    expect(verifySendbirdWebhook(body, '', API_TOKEN)).toBe(false);
    expect(verifySendbirdWebhook(body, null, API_TOKEN)).toBe(false);
    expect(verifySendbirdWebhook(body, sign(body, 'a_secondary_token'), API_TOKEN)).toBe(false);
    expect(verifySendbirdWebhook(body, sign(body), undefined)).toBe(false);
  });
});

describe('POST /webhooks/sendbird', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([
    'group_channel:create',
    'group_channel:join',
    'group_channel:leave',
    'group_channel:message_send',
    'open_channel:message_send',
    'user:block',
    'user:unblock',
  ])('handles %s', async (category) => {
    const res = await POST(makeRequest(event(category)));
    expect(res.status).toBe(200);
    expect(logSpy).not.toHaveBeenCalledWith(`Unhandled event: ${category}`);
  });

  it('acknowledges unhandled categories', async () => {
    const res = await POST(makeRequest(event('group_channel:freeze_unfreeze')));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Unhandled event: group_channel:freeze_unfreeze');
  });

  it('verifies regardless of content type', async () => {
    const body = event('group_channel:create');
    const res = await POST(makeRequest(body, sign(body), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('rejects an invalid signature', async () => {
    const res = await POST(makeRequest(event('group_channel:create'), 'deadbeef'));
    expect(res.status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    const res = await POST(makeRequest(event('group_channel:create'), null));
    expect(res.status).toBe(400);
  });

  it('rejects valid-signature invalid JSON', async () => {
    const res = await POST(makeRequest('not json'));
    expect(res.status).toBe(400);
  });
});
