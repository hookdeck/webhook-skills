import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/planning-center/route';
import { verifyPlanningCenter } from '../lib/planning-center';

// Worked example from the Authenticity section of the Planning Center docs
const DOC_SECRET = '2608ab74db02d670279278a90585fca300953f0a19fd96529cb61bb92ed39d86';
const DOC_SIGNATURE = 'a0782fde663e7ee25a99b9d44f45434120ff027ba98ef333a83a4590fcc97828';
// The docs show the body as a Ruby single-quoted string; this file holds the real bytes
const DOC_BODY = readFileSync(join(__dirname, 'fixtures', 'authenticity-example.json'), 'utf8');

const sign = (body: string, secret = DOC_SECRET) =>
  createHmac('sha256', secret).update(body).digest('hex');

function post(body: string, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest('http://localhost:3000/webhooks/planning-center', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    })
  );
}

describe('Planning Center webhook', () => {
  beforeEach(() => {
    process.env.PLANNING_CENTER_AUTHENTICITY_SECRET = DOC_SECRET;
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('reproduces the documented signature', () => {
    expect(sign(DOC_BODY)).toBe(DOC_SIGNATURE);
  });

  it('accepts the documented example', async () => {
    const res = await post(DOC_BODY, { 'x-pco-webhooks-authenticity': DOC_SIGNATURE });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts any content type (raw body)', async () => {
    const res = await POST(
      new NextRequest('http://localhost:3000/webhooks/planning-center', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', 'x-pco-webhooks-authenticity': DOC_SIGNATURE },
        body: DOC_BODY,
      })
    );
    expect(res.status).toBe(200);
  });

  it('accepts an uppercase hex signature', async () => {
    const res = await post(DOC_BODY, { 'x-pco-webhooks-authenticity': DOC_SIGNATURE.toUpperCase() });
    expect(res.status).toBe(200);
  });

  it('parses the nested payload string', async () => {
    await post(DOC_BODY, { 'x-pco-webhooks-authenticity': DOC_SIGNATURE });
    expect(console.log).toHaveBeenCalledWith('Person updated (attempt 1):', '125587227', 'Kid 222');
  });

  it('rejects a missing header', async () => {
    expect((await post(DOC_BODY)).status).toBe(400);
  });

  it('rejects a wrong signature', async () => {
    const res = await post(DOC_BODY, { 'x-pco-webhooks-authenticity': 'a'.repeat(64) });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const res = await post(DOC_BODY.replace('Kid 222', 'Kid 333'), {
      'x-pco-webhooks-authenticity': DOC_SIGNATURE,
    });
    expect(res.status).toBe(401);
  });

  it('rejects a signature made with the secret hex-decoded', async () => {
    const wrong = createHmac('sha256', Buffer.from(DOC_SECRET, 'hex')).update(DOC_BODY).digest('hex');
    const res = await post(DOC_BODY, { 'x-pco-webhooks-authenticity': wrong });
    expect(res.status).toBe(401);
  });

  it('rejects malformed signatures without throwing', async () => {
    for (const bad of ['short', 'z'.repeat(64), DOC_SIGNATURE + '00', DOC_SIGNATURE.slice(0, 62) + 'zz']) {
      const res = await post(DOC_BODY, { 'x-pco-webhooks-authenticity': bad });
      expect(res.status).toBe(401);
    }
  });

  it('returns 400 for a validly signed body that is not JSON', async () => {
    const body = 'not json';
    const res = await post(body, { 'x-pco-webhooks-authenticity': sign(body) });
    expect(res.status).toBe(400);
  });

  it('acknowledges unhandled event names', async () => {
    const body = JSON.stringify({
      data: [{ id: 'x', type: 'EventDelivery', attributes: { name: 'people.v2.events.other.thing', attempt: 2, payload: '{}' } }],
    });
    const res = await post(body, { 'x-pco-webhooks-authenticity': sign(body) });
    expect(res.status).toBe(200);
  });

  it('verifyPlanningCenter rejects a missing secret', () => {
    expect(verifyPlanningCenter(DOC_BODY, DOC_SIGNATURE, undefined)).toBe(false);
  });
});
