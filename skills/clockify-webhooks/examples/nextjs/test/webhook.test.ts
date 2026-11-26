// Generated with: clockify-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST } from '../app/webhooks/clockify/route';
import { verifyClockifySignature, parseTokens } from '../lib/verify-clockify';

// Synthetic, JWT-shaped tokens (not real Clockify tokens)
const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJjbG9ja2lmeSIsInN1YiI6InN5bnRoZXRpYyJ9.c3ludGhldGljLXNpZ25hdHVyZS0x';
const TOKEN2 = 'eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJjbG9ja2lmeSIsInN1YiI6InN5bnRoZXRpYzIifQ.c3ludGhldGljLXNpZ25hdHVyZS0y';
const ENTRY = '{"id":"6740a1b2c3d4e5f601234567","description":"Synthetic task","userId":"5a0ab5acb07987125438b60f","workspaceId":"64a687e29ae1f428e7ebe303","projectId":"5b641568b07987035750505e","billable":true,"timeInterval":{"start":"2026-11-18T09:00:00Z","end":"2026-11-18T10:00:00Z","duration":"PT1H"}}';

const post = (body: string, signature?: string, eventType?: string) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature !== undefined) headers['clockify-signature'] = signature;
  if (eventType !== undefined) headers['clockify-webhook-event-type'] = eventType;
  return POST(new Request('http://localhost/webhooks/clockify', { method: 'POST', headers, body }));
};

beforeEach(() => {
  process.env.CLOCKIFY_WEBHOOK_SIGNING_SECRET = TOKEN;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyClockifySignature', () => {
  it('accepts a configured token and rejects others', () => {
    expect(verifyClockifySignature(TOKEN, [TOKEN])).toBe(true);
    expect(verifyClockifySignature(TOKEN2, parseTokens(`${TOKEN}, ${TOKEN2}`))).toBe(true);
    expect(verifyClockifySignature(TOKEN2, [TOKEN])).toBe(false);
    expect(verifyClockifySignature('', [TOKEN])).toBe(false);
  });
});

describe('POST /webhooks/clockify', () => {
  it('accepts the webhook token and reads the event type header', async () => {
    const res = await post(ENTRY, TOKEN, 'NEW_TIME_ENTRY');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, event_type: 'NEW_TIME_ENTRY', id: '6740a1b2c3d4e5f601234567' });
  });

  it('rejects a different token and a missing header', async () => {
    expect((await post(ENTRY, TOKEN2)).status).toBe(401);
    expect((await post(ENTRY)).status).toBe(401);
  });

  it('returns 400 for invalid JSON with a valid token', async () => {
    expect((await post('{"truncated": ', TOKEN)).status).toBe(400);
  });

  it('returns 500 when the token is not set', async () => {
    delete process.env.CLOCKIFY_WEBHOOK_SIGNING_SECRET;
    expect((await post(ENTRY, TOKEN)).status).toBe(500);
  });
});
