import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Jamie signing secrets are used as plain strings (not decoded); this one is only for tests
const SECRET = 'test_signing_secret_for_jamie';

let POST: (request: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.JAMIE_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  ({ POST } = await import('../app/webhooks/jamie/route'));
});

afterEach(() => {
  delete process.env.JAMIE_TIMESTAMP_TOLERANCE_SECONDS;
  process.env.JAMIE_WEBHOOK_SECRET = SECRET;
});

const now = () => Math.floor(Date.now() / 1000);

function v0For(body: string, timestamp: number, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

function sign(body: string, timestamp = now(), secret = SECRET): string {
  return `t=${timestamp},v0=${v0For(body, timestamp, secret)}`;
}

function post(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature) headers['x-jamie-signature'] = signature;
  return POST(
    new NextRequest('http://localhost:3000/webhooks/jamie', { method: 'POST', headers, body })
  );
}

const event = (type = 'meeting.completed') =>
  JSON.stringify({
    metadata: { id: '7893456789012345678', event: type, created: 1701234567 },
    data: {
      title: 'Q4 Planning Meeting',
      startTime: '2024-11-27T14:00:00.000Z',
      endTime: '2024-11-27T15:00:00.000Z',
      user: { id: 'user-456', email: 'sarah.johnson@example.com' },
      summary: { markdown: '# Meeting Summary', html: '<h1>Meeting Summary</h1>', short: 'Q4 planning' },
      transcript: [{ speakerId: '1', speakerName: 'Sarah Johnson', text: 'Hi everyone!' }],
      participants: [{ id: '1', name: 'Sarah Johnson', email: 'sarah.johnson@example.com' }],
      tasks: [{ content: 'Schedule follow-up', completed: false, assignee: null }],
      tags: [{ name: 'Planning', color: '#50C878' }],
    },
  });

describe('Jamie webhook', () => {
  it('accepts a valid signature for meeting.completed', async () => {
    const body = event();
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a valid signature for an unknown event', async () => {
    const body = event('meeting.unknown');
    expect((await post(body, sign(body))).status).toBe(200);
  });

  it('verifies any content type', async () => {
    const body = event();
    expect((await post(body, sign(body), 'text/plain')).status).toBe(200);
  });

  it('uses the secret as its UTF-8 bytes, not decoded', async () => {
    const body = event();
    const t = now();
    const v0 = crypto
      .createHmac('sha256', Buffer.from(SECRET, 'base64'))
      .update(`${t}.${body}`)
      .digest('hex');
    expect((await post(body, `t=${t},v0=${v0}`)).status).toBe(401);
  });

  it('accepts v0 before t', async () => {
    const body = event();
    const [t, v0] = sign(body).split(',');
    expect((await post(body, `${v0},${t}`)).status).toBe(200);
  });

  it('accepts any matching v0 entry', async () => {
    const body = event();
    const t = now();
    const res = await post(body, `t=${t},v0=${'0'.repeat(64)},v0=${v0For(body, t)}`);
    expect(res.status).toBe(200);
  });

  it('rejects a tampered body', async () => {
    const body = event();
    expect((await post(body.replace('Q4 Planning', 'Evil Planning'), sign(body))).status).toBe(401);
  });

  it('rejects a wrong secret', async () => {
    const body = event();
    expect((await post(body, sign(body, now(), 'other_secret'))).status).toBe(401);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(event())).status).toBe(401);
  });

  it.each([
    ['no v0', () => `t=${now()}`],
    ['no t', () => `v0=${'a'.repeat(64)}`],
    ['garbage', () => 'not-a-signature'],
    ['non-numeric t', () => `t=abc,v0=${'a'.repeat(64)}`],
    ['short v0', () => `t=${now()},v0=abcd`],
  ])('rejects a malformed header (%s)', async (_name, make) => {
    expect((await post(event(), make())).status).toBe(401);
  });

  it('rejects invalid JSON with a valid signature', async () => {
    const body = '{not json';
    expect((await post(body, sign(body))).status).toBe(400);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.JAMIE_WEBHOOK_SECRET;
    const body = event();
    expect((await post(body, sign(body))).status).toBe(500);
  });

  describe('timestamp window', () => {
    it('is off by default, so old timestamps (Hookdeck retries) verify', async () => {
      const body = event();
      expect((await post(body, sign(body, now() - 86400))).status).toBe(200);
    });

    it('rejects a timestamp older than 300 seconds when opted in', async () => {
      process.env.JAMIE_TIMESTAMP_TOLERANCE_SECONDS = '300';
      const body = event();
      expect((await post(body, sign(body, now() - 301))).status).toBe(401);
      expect((await post(body, sign(body, now() - 120))).status).toBe(200);
    });

    it('is disabled by JAMIE_TIMESTAMP_TOLERANCE_SECONDS=0', async () => {
      process.env.JAMIE_TIMESTAMP_TOLERANCE_SECONDS = '0';
      const body = event();
      expect((await post(body, sign(body, now() - 86400))).status).toBe(200);
    });

    it('honours a custom window', async () => {
      process.env.JAMIE_TIMESTAMP_TOLERANCE_SECONDS = '3600';
      const body = event();
      expect((await post(body, sign(body, now() - 1800))).status).toBe(200);
      expect((await post(body, sign(body, now() - 7200))).status).toBe(401);
    });

    it('leaves the check off for an invalid value', async () => {
      process.env.JAMIE_TIMESTAMP_TOLERANCE_SECONDS = 'soon';
      const body = event();
      expect((await post(body, sign(body, now() - 1000))).status).toBe(200);
    });
  });
});
