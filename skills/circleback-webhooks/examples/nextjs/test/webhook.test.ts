import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/circleback/route';

const SIGNING_SECRET = 'test_circleback_signing_secret';

// Sign exactly as Circleback does: hex(HMAC-SHA256(secret, raw body))
function sign(body: string, secret = SIGNING_SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

const meeting = {
  id: 'WRweb12iCBimU6Vo8cD7z',
  name: 'Event Venue Review',
  createdAt: '2023-07-25T20:30:57.926Z',
  duration: 1306.09,
  url: 'https://meet.google.com/abc-defgh-xyz',
  recordingUrl: null,
  tags: ['Events'],
  attendees: [{ name: 'John Appleseed', email: 'john@example.com' }],
  notes: '#### Overview\n*   Several options for event venues were reviewed...',
  actionItems: [
    { id: 252, title: 'Contact event venues', description: 'Reach out.', assignee: null, status: 'PENDING' },
  ],
  transcript: [{ speaker: 'John Appleseed', text: "Hey, how's it going?", timestamp: 4.56 }],
};
const body = JSON.stringify(meeting);

function buildRequest(payload: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/webhooks/circleback', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: payload,
  });
}

describe('Circleback webhook', () => {
  beforeEach(() => {
    process.env.CIRCLEBACK_SIGNING_SECRET = SIGNING_SECRET;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('accepts a valid signature', async () => {
    const res = await POST(buildRequest(body, { 'x-signature': sign(body) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts uppercase hex', async () => {
    const res = await POST(buildRequest(body, { 'x-signature': sign(body).toUpperCase() }));
    expect(res.status).toBe(200);
  });

  it('verifies any content type', async () => {
    const res = await POST(buildRequest(body, { 'content-type': 'text/plain', 'x-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('rejects a wrong signature', async () => {
    const res = await POST(buildRequest(body, { 'x-signature': sign(body, 'other_secret') }));
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const res = await POST(buildRequest(body.replace('Event Venue Review', 'Tampered'), { 'x-signature': sign(body) }));
    expect(res.status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    const res = await POST(buildRequest(body));
    expect(res.status).toBe(401);
  });

  it('rejects a signature of the wrong length', async () => {
    const res = await POST(buildRequest(body, { 'x-signature': sign(body).slice(0, 32) }));
    expect(res.status).toBe(401);
  });

  it('rejects 64 characters that are not all hex', async () => {
    const res = await POST(buildRequest(body, { 'x-signature': 'g' + sign(body).slice(1) }));
    expect(res.status).toBe(401);
  });

  it('rejects a valid signature followed by junk', async () => {
    const res = await POST(buildRequest(body, { 'x-signature': sign(body) + 'zz' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid JSON with a valid signature', async () => {
    const bad = '{not json';
    const res = await POST(buildRequest(bad, { 'x-signature': sign(bad) }));
    expect(res.status).toBe(400);
  });

  it('returns 500 when the signing secret is not configured', async () => {
    delete process.env.CIRCLEBACK_SIGNING_SECRET;
    const res = await POST(buildRequest(body, { 'x-signature': sign(body) }));
    expect(res.status).toBe(500);
  });
});
