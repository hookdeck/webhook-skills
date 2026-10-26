// Generated with: referralhero-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, afterEach } from 'vitest';
import crypto from 'crypto';
import { POST } from '../app/webhooks/referralhero/route';

const SECRET = 'rh_test_webhook_secret_key_0123456789';
process.env.REFERRALHERO_WEBHOOK_SECRET = SECRET;

/** Sign exactly like ReferralHero: base64 (standard, padded) HMAC-SHA256 of the raw body. */
function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

interface SendOptions {
  signature?: string | null;
  contentType?: string;
  secret?: string;
}

async function send(body: string, { signature, contentType = 'application/json', secret }: SendOptions = {}) {
  const headers: Record<string, string> = { 'content-type': contentType };
  const sig = signature === undefined ? sign(body, secret) : signature;
  if (sig !== null) headers['x-referralhero-signature'] = sig;
  const res = await POST(new Request('http://localhost/webhooks/referralhero', { method: 'POST', headers, body }));
  return { status: res.status, text: await res.text() };
}

const event = (name: string, extra: Record<string, unknown> = {}) => JSON.stringify({ response: name, ...extra });

describe('ReferralHero webhook', () => {
  afterEach(() => {
    process.env.REFERRALHERO_WEBHOOK_SECRET = SECRET;
  });

  it.each([
    'new_registration',
    'subscriber_promoted',
    'subscriber_updated',
    'subscriber_fields_updated',
    'subscriber_deleted',
    'reward_unlocked',
    'reward_sent',
  ])('accepts a validly signed %s with a blank 200 body', async (name) => {
    const res = await send(event(name, { subscriber: { id: 'sub_1' } }));
    expect(res.status).toBe(200);
    expect(res.text).toBe('');
  });

  it('accepts and logs an unknown event type', async () => {
    expect((await send(event('something_new'))).status).toBe(200);
  });

  it('verifies the exact bytes, whitespace included', async () => {
    expect((await send('{ "response" :  "new_registration" }\n')).status).toBe(200);
  });

  it('accepts any content type', async () => {
    expect((await send(event('reward_sent'), { contentType: 'text/plain' })).status).toBe(200);
  });

  it('rejects a missing signature with 401', async () => {
    expect((await send(event('new_registration'), { signature: null })).status).toBe(401);
  });

  it('rejects an empty signature with 401', async () => {
    expect((await send(event('new_registration'), { signature: '' })).status).toBe(401);
  });

  it('rejects a tampered body with 401', async () => {
    const body = event('new_registration');
    const res = await send(body.replace('new_registration', 'reward_sent'), { signature: sign(body) });
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    expect((await send(event('new_registration'), { secret: 'another-secret' })).status).toBe(401);
  });

  it('rejects a hex-encoded digest', async () => {
    const body = event('new_registration');
    const hex = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    expect((await send(body, { signature: hex })).status).toBe(401);
  });

  it('rejects a prefixed signature value', async () => {
    const body = event('new_registration');
    expect((await send(body, { signature: `sha256=${sign(body)}` })).status).toBe(401);
  });

  it('rejects base64 that decodes to the same bytes but is not canonical', async () => {
    const body = event('new_registration');
    const good = sign(body);
    // The last base64 character before "=" carries 4 unused bits; flip one.
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const variant = good.slice(0, 42) + alphabet[alphabet.indexOf(good[42]) ^ 1] + '=';
    expect(Buffer.from(variant, 'base64').equals(Buffer.from(good, 'base64'))).toBe(true);
    expect((await send(body, { signature: variant })).status).toBe(401);
  });

  it('rejects a signed body that is not JSON with 400', async () => {
    expect((await send('not json')).status).toBe(400);
  });

  it('fails closed with 500 when no secret is configured', async () => {
    delete process.env.REFERRALHERO_WEBHOOK_SECRET;
    expect((await send(event('new_registration'))).status).toBe(500);
  });
});
