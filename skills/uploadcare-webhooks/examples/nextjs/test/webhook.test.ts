import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET = 'test_signing_secret';
process.env.UPLOADCARE_WEBHOOK_SECRET = SECRET;

import { POST } from '../app/webhooks/uploadcare/route';
import { verifyUploadcareSignature } from '../lib/verify-uploadcare';

const sign = (body: string, secret = SECRET) =>
  crypto.createHmac('sha256', secret).update(body).digest('hex');

const payload = (event: string) =>
  JSON.stringify({
    hook: { id: 1, event, project_pub_key: 'pub' },
    data: { uuid: '3f2c1a5e-0000-4000-8000-000000000000', size: 10 },
    file: 'https://ucarecdn.com/3f2c1a5e-0000-4000-8000-000000000000/',
  });

const post = (body: string, headers: Record<string, string> = {}) =>
  POST(
    new NextRequest('http://localhost:3000/webhooks/uploadcare', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    })
  );

describe('Uploadcare webhook', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => logSpy.mockRestore());

  it.each(['file.uploaded', 'file.info_updated', 'file.deleted', 'file.stored', 'file.infected'])(
    'accepts a signed %s event',
    async (event) => {
      const body = payload(event);
      const res = await post(body, { 'x-uc-signature': `v1=${sign(body)}` });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled'));
    }
  );

  it('logs unknown events and still returns 200', async () => {
    const body = payload('file.something_new');
    const res = await post(body, { 'x-uc-signature': `v1=${sign(body)}` });
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Unhandled event: file.something_new');
  });

  it('accepts the bare digest without the v1= prefix', async () => {
    const body = payload('file.uploaded');
    expect((await post(body, { 'x-uc-signature': sign(body) })).status).toBe(200);
  });

  it('accepts an uppercase hex digest', async () => {
    const body = payload('file.uploaded');
    expect((await post(body, { 'x-uc-signature': `v1=${sign(body).toUpperCase()}` })).status).toBe(200);
  });

  it('verifies the exact bytes, whatever the content type', async () => {
    const body = '{"hook":{"event":"file.uploaded"},   "data":{}}';
    const res = await post(body, { 'content-type': 'text/plain', 'x-uc-signature': `v1=${sign(body)}` });
    expect(res.status).toBe(200);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(payload('file.uploaded'))).status).toBe(401);
  });

  it('rejects an empty signature header', async () => {
    expect((await post(payload('file.uploaded'), { 'x-uc-signature': '' })).status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = payload('file.uploaded');
    expect((await post(body, { 'x-uc-signature': `v1=${sign(body, 'other')}` })).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const body = payload('file.uploaded');
    const res = await post(body.replace('"size":10', '"size":11'), { 'x-uc-signature': `v1=${sign(body)}` });
    expect(res.status).toBe(401);
  });

  it.each([
    ['too short', 'v1=abc123'],
    ['non-hex characters', `v1=${'z'.repeat(64)}`],
    ['trailing junk', `v1=${sign('x')}zz`],
    ['wrong prefix', `v2=${sign('x')}`],
  ])('rejects a malformed signature (%s)', async (_name, value) => {
    expect((await post(payload('file.uploaded'), { 'x-uc-signature': value })).status).toBe(401);
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const body = 'not json';
    expect((await post(body, { 'x-uc-signature': `v1=${sign(body)}` })).status).toBe(400);
  });

  it('returns 400 for a validly signed JSON array', async () => {
    const body = '[1,2]';
    expect((await post(body, { 'x-uc-signature': `v1=${sign(body)}` })).status).toBe(400);
  });

  it('rejects everything when no secret is configured', () => {
    const body = Buffer.from('{}');
    expect(verifyUploadcareSignature(body, `v1=${sign('{}')}`, '')).toBe(false);
    delete process.env.UPLOADCARE_WEBHOOK_SECRET; // unset env var: default secret is undefined
    expect(verifyUploadcareSignature(body, `v1=${sign('{}')}`)).toBe(false);
    process.env.UPLOADCARE_WEBHOOK_SECRET = SECRET;
  });
});
