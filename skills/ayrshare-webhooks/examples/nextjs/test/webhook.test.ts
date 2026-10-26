import { describe, it, expect, afterEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST, verifyAyrshareSignature } from '../app/webhooks/ayrshare/route';

const SECRET = 'test_ayrshare_signing_secret';
process.env.AYRSHARE_WEBHOOK_SECRET = SECRET;
const HEADER = 'X-Authorization-Content-SHA256-V2';


// hex(HMAC-SHA256(secret, raw body)), exactly as Ayrshare computes it
function sign(body: string | Buffer, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// Payloads based on Ayrshare's documented examples
const messageEvent = {
  action: 'messages',
  attachments: [{ type: 'image', url: 'https://images.ayrshare.com/abc123/whatsapp_image_x9aB2pK7.jpg' }],
  conversationId: '14155551234',
  created: '2026-05-18T17:08:41Z',
  hookId: 'JC6IgqFjvDliTJ8MLqzE',
  id: 'wamid.HBgLMTQxNTU1NTEyMzQVAgARGBI4OUYxRkExNzE0M0EwQTYwM0EA',
  message: "Here's the photo you asked for.",
  platform: 'whatsapp',
  recipientId: '123456789012345',
  refId: '9abf1426d6ce9122ef11c72bd62e59807c5cc083',
  senderDetails: { id: '14155551234', name: 'Jane Customer' },
  senderId: '14155551234',
  timeStamp: 1747588121,
  title: 'Primary Profile',
  url: 'https://mysite.com/webhook',
};

const adsEvent = {
  action: 'ads',
  type: 'accountRevoked',
  platform: 'google',
  accountId: null,
  id: 'c4e6a8b0d2f4e6a8c0b2d4f6e8a0c2b4d6f8e0a2c4b6d8f0a2c4e6b8d0f2a4c6',
  created: '2026-10-21T08:15:00.000Z',
  hookId: 'c4e6a8b0d2f4e6a8c0b2d4f6e8a0c2b4d6f8e0a2c4b6d8f0a2c4e6b8d0f2a4c7',
  refId: '9abf1426d6ce9122ef11c72bd62e59807c5cc083',
  url: 'https://api.myapp.com/Webhook/Ayrshare/Ads',
};

const scheduledEvent = {
  action: 'scheduled',
  created: '2023-01-05T01:18:47Z',
  code: 200,
  refId: '140b8700bd6ade089b242d845e268fb886130c53',
  status: 'success',
  id: 'TBAAAqAMMpoweA9wKHUp',
  errors: [],
  postIds: [{ postUrl: 'https://www.facebook.com/102775127855689_361718068618052', platform: 'facebook', status: 'success', id: '102775127855689_361718068618052' }],
  url: 'https://mysite.com/webhook',
};

const socialEvent = {
  action: 'social',
  created: '2023-01-05T01:18:47Z',
  code: 200,
  hookId: 'TKLc30192HLGw5UeJ46',
  platform: 'youtube',
  refId: '140b8700bd6ade089b242d845e268fb886130c53',
  title: 'User Profile Name',
  type: 'unlink',
  url: 'https://mysite.com/webhook',
};


function post(body: string | Buffer, headerValue?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'Content-Type': contentType };
  if (headerValue !== undefined) headers[HEADER] = headerValue;
  return POST(
    new NextRequest('http://localhost:3000/webhooks/ayrshare', { method: 'POST', headers, body: new Uint8Array(Buffer.from(body)) })
  );
}

afterEach(() => {
  process.env.AYRSHARE_WEBHOOK_SECRET = SECRET;
});

describe('verifyAyrshareSignature', () => {
  const raw = Buffer.from(JSON.stringify(messageEvent));
  const sig = sign(raw);

  it('accepts v1=<hex>', () => {
    expect(verifyAyrshareSignature(raw, `v1=${sig}`, SECRET)).toBe(true);
  });

  it('accepts a bare hex digest', () => {
    expect(verifyAyrshareSignature(raw, sig, SECRET)).toBe(true);
  });

  it('accepts uppercase hex', () => {
    expect(verifyAyrshareSignature(raw, `v1=${sig.toUpperCase()}`, SECRET)).toBe(true);
  });

  it('accepts when only the previous secret entry matches (rotation window)', () => {
    const previous = sign(raw, 'old_secret');
    expect(verifyAyrshareSignature(raw, `v1=${previous},v1=${sig}`, SECRET)).toBe(true);
    expect(verifyAyrshareSignature(raw, `v1=${sig}, v1=${previous}`, SECRET)).toBe(true);
  });

  it('ignores entries with other keys', () => {
    expect(verifyAyrshareSignature(raw, `v2=${sig}`, SECRET)).toBe(false);
    expect(verifyAyrshareSignature(raw, `v2=${sig},v1=${sig}`, SECRET)).toBe(true);
  });

  it('rejects a wrong secret, tampered body and missing header', () => {
    expect(verifyAyrshareSignature(raw, `v1=${sign(raw, 'other')}`, SECRET)).toBe(false);
    expect(verifyAyrshareSignature(Buffer.from('{}'), `v1=${sig}`, SECRET)).toBe(false);
    expect(verifyAyrshareSignature(raw, undefined, SECRET)).toBe(false);
    expect(verifyAyrshareSignature(raw, '', SECRET)).toBe(false);
  });

  it('rejects malformed values without throwing', () => {
    expect(verifyAyrshareSignature(raw, 'v1=abc', SECRET)).toBe(false);
    expect(verifyAyrshareSignature(raw, `v1=${sig}00`, SECRET)).toBe(false);
    expect(verifyAyrshareSignature(raw, `v1=${'zz'.repeat(32)}`, SECRET)).toBe(false);
    expect(verifyAyrshareSignature(raw, `v1=${sig.slice(0, 62)}  `, SECRET)).toBe(false);
  });
});

describe('POST /webhooks/ayrshare', () => {
  it('accepts a signed messages event', async () => {
    const body = JSON.stringify(messageEvent);
    const res = await post(body, `v1=${sign(body)}`);
    expect(res.status).toBe(200);
  });

  it('accepts a signed ads event', async () => {
    const body = JSON.stringify(adsEvent);
    const res = await post(body, `v1=${sign(body)}`);
    expect(res.status).toBe(200);
  });

  it('accepts signed scheduled and social events', async () => {
    for (const event of [scheduledEvent, socialEvent]) {
      const body = JSON.stringify(event);
      expect((await post(body, `v1=${sign(body)}`)).status).toBe(200);
    }
  });

  it('verifies the exact bytes, including non-ASCII and any content type', async () => {
    const body = JSON.stringify({ ...messageEvent, message: 'Café ☕ — ünïcode' }, null, 2);
    const res = await post(Buffer.from(body), `v1=${sign(Buffer.from(body))}`, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('accepts a rotation header carrying current and previous signatures', async () => {
    const body = JSON.stringify(messageEvent);
    const res = await post(body, `v1=${sign(body)},v1=${sign(body, 'old_secret')}`);
    expect(res.status).toBe(200);
  });

  it('logs and accepts an unhandled action', async () => {
    const body = JSON.stringify({ action: 'demo', type: 'upgradeWarning', hookId: 'h1' });
    expect((await post(body, `v1=${sign(body)}`)).status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    const res = await post(JSON.stringify(messageEvent));
    expect(res.status).toBe(401);
  });

  it('rejects an empty signature header', async () => {
    const res = await post(JSON.stringify(messageEvent), '');
    expect(res.status).toBe(401);
  });

  it('rejects an invalid signature', async () => {
    const res = await post(JSON.stringify(messageEvent), `v1=${'0'.repeat(64)}`);
    expect(res.status).toBe(401);
  });

  it('rejects a malformed signature', async () => {
    const res = await post(JSON.stringify(messageEvent), 'v1=not-hex');
    expect(res.status).toBe(401);
  });

  it('rejects a body modified after signing', async () => {
    const body = JSON.stringify(messageEvent);
    const res = await post(body.replace('Jane', 'Mallory'), `v1=${sign(body)}`);
    expect(res.status).toBe(401);
  });

  it('rejects a re-serialized body (signature covers the raw bytes)', async () => {
    const pretty = JSON.stringify(messageEvent, null, 2);
    const res = await post(JSON.stringify(messageEvent), `v1=${sign(pretty)}`);
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const body = 'not json';
    expect((await post(body, `v1=${sign(body)}`, 'text/plain')).status).toBe(400);
  });

  it('returns 400 for signed JSON that is not an object', async () => {
    const body = '[1,2,3]';
    expect((await post(body, `v1=${sign(body)}`)).status).toBe(400);
  });

  it('ignores wrong-typed fields instead of failing', async () => {
    const event = { action: 'messages', senderDetails: 'x', message: 42, hookId: 7 };
    const body = JSON.stringify(event);
    expect((await post(body, `v1=${sign(body)}`)).status).toBe(200);
    for (const bad of [{ action: 5 }, { action: 'comments', from: [] }, { action: 'scheduled', errors: 'x' }]) {
      const b = JSON.stringify(bad);
      expect((await post(b, `v1=${sign(b)}`)).status).toBe(200);
    }
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.AYRSHARE_WEBHOOK_SECRET;
    const body = JSON.stringify(messageEvent);
    const res = await post(body, `v1=${sign(body)}`);
    expect(res.status).toBe(500);
  });
});
