import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyMortaWebhook } from '../lib/morta';

// The hub signing secret is used as-is, as UTF-8 text
const SECRET = 'morta_test_signing_secret';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.MORTA_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/morta/route'));
});

function sign(body: string, secret = SECRET, t = String(Math.floor(Date.now() / 1000))): string {
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

const envelope = (event: string, extra: Record<string, unknown> = {}) => ({
  id: '1df6bd8a-b8a3-49a2-b07b-0de3f3cecbed',
  event,
  resourceId: '4e687ada-900a-4562-b493-6c6f67ffca6e',
  change: null,
  context: {},
  user: null,
  createdAt: '2020-08-27T14:20:28.405158',
  contextProjectId: '9f1c0e2a-1b2c-4d3e-8f4a-5b6c7d8e9f00',
  ...extra,
});

function makeRequest(body: string, header?: string, contentType = 'application/json'): NextRequest {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (header) headers['morta-signature'] = header;
  return new NextRequest('http://localhost:3000/webhooks/morta', { method: 'POST', headers, body });
}

const bytes = (s: string) => new TextEncoder().encode(s);

describe('verifyMortaWebhook', () => {
  const body = JSON.stringify(envelope('project.created'));

  it('accepts a valid signature', () => {
    expect(verifyMortaWebhook(bytes(body), sign(body), SECRET)).toBe(true);
  });

  it('rejects wrong secret', () => {
    expect(verifyMortaWebhook(bytes(body), sign(body, 'other'), SECRET)).toBe(false);
  });

  it('rejects tampered body', () => {
    expect(verifyMortaWebhook(bytes(body + ' '), sign(body), SECRET)).toBe(false);
  });

  it('rejects a missing t', () => {
    expect(verifyMortaWebhook(bytes(body), sign(body).split(',')[1], SECRET)).toBe(false);
  });

  it('signs t exactly as sent (not re-formatted as a number)', () => {
    const t = '0001700000000';
    expect(verifyMortaWebhook(bytes(body), sign(body, SECRET, t), SECRET)).toBe(true);
    expect(verifyMortaWebhook(bytes(body), sign(body, SECRET, t).replace(t, '1700000000'), SECRET)).toBe(false);
  });

  it('accepts uppercase hex', () => {
    const [t, v1] = sign(body).split(',');
    expect(verifyMortaWebhook(bytes(body), `${t},v1=${v1.slice(3).toUpperCase()}`, SECRET)).toBe(true);
  });

  it('accepts any matching v1 and ignores other keys', () => {
    const [t, v1] = sign(body).split(',');
    expect(verifyMortaWebhook(bytes(body), `${t},v0=abc,v1=${'a'.repeat(64)},${v1}`, SECRET)).toBe(true);
  });

  it('rejects malformed v1 values (wrong length or alphabet)', () => {
    const t = String(Math.floor(Date.now() / 1000));
    expect(verifyMortaWebhook(bytes(body), `t=${t},v1=abcd`, SECRET)).toBe(false);
    expect(verifyMortaWebhook(bytes(body), `t=${t},v1=${'z'.repeat(64)}`, SECRET)).toBe(false);
  });

  it('accepts an old timestamp by default (retries keep the original t)', () => {
    delete process.env.MORTA_WEBHOOK_TOLERANCE_SECONDS;
    const old = String(Math.floor(Date.now() / 1000) - 86400);
    expect(verifyMortaWebhook(bytes(body), sign(body, SECRET, old), SECRET)).toBe(true);
  });

  it('rejects an old timestamp with an explicit tolerance', () => {
    const old = String(Math.floor(Date.now() / 1000) - 600);
    expect(verifyMortaWebhook(bytes(body), sign(body, SECRET, old), SECRET, 300)).toBe(false);
    expect(verifyMortaWebhook(bytes(body), sign(body, SECRET, old), SECRET, 900)).toBe(true);
  });

  it('rejects an old timestamp when MORTA_WEBHOOK_TOLERANCE_SECONDS is set', () => {
    process.env.MORTA_WEBHOOK_TOLERANCE_SECONDS = '300';
    try {
      const old = String(Math.floor(Date.now() / 1000) - 600);
      expect(verifyMortaWebhook(bytes(body), sign(body, SECRET, old), SECRET)).toBe(false);
    } finally {
      delete process.env.MORTA_WEBHOOK_TOLERANCE_SECONDS;
    }
  });
});

describe('POST /webhooks/morta', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('accepts a validly signed table.row_created event', async () => {
    const body = JSON.stringify(envelope('table.row_created', { change: '{"added": 2}', context: { rows: [{}, {}] } }));
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('2 row(s) created'));
  });

  it('verifies the exact bytes whatever the content type', async () => {
    const body = JSON.stringify(envelope('project.created'));
    expect((await POST(makeRequest(body, sign(body), 'text/plain'))).status).toBe(200);
  });

  it.each(['project.created', 'member.created', 'process.response_submitted'])('handles %s', async (name) => {
    const body = JSON.stringify(envelope(name));
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
  });

  it('logs events it does not handle and still answers 200', async () => {
    const body = JSON.stringify(envelope('table.view_read'));
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Unhandled event type: table.view_read');
  });

  it('reads the double-encoded change field safely', async () => {
    const body = JSON.stringify(envelope('project.duplication_failed', { change: '{"error": "Duplication timed out"}' }));
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Duplication timed out'));
  });

  it('ignores wrong-typed fields instead of failing', async () => {
    const body = JSON.stringify({ event: 'table.row_created', resourceId: 5, change: 7, context: { rows: 'nope' } });
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
    const bad = JSON.stringify({ event: 'project.duplication_failed', change: '[1,2', context: [] });
    expect((await POST(makeRequest(bad, sign(bad)))).status).toBe(200);
  });

  it('returns 400 for a validly signed body that is not an object', async () => {
    for (const body of ['[1,2]', '"x"', 'null', '42']) {
      expect((await POST(makeRequest(body, sign(body)))).status).toBe(400);
    }
  });

  it('returns 400 for validly signed invalid JSON', async () => {
    const body = '{not json';
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(400);
  });

  it('returns 401 for a missing header', async () => {
    const body = JSON.stringify(envelope('project.created'));
    expect((await POST(makeRequest(body))).status).toBe(401);
  });

  it('returns 401 for a malformed header', async () => {
    const body = JSON.stringify(envelope('project.created'));
    expect((await POST(makeRequest(body, 'garbage'))).status).toBe(401);
  });

  it('returns 401 for a bad signature', async () => {
    const body = JSON.stringify(envelope('project.created'));
    expect((await POST(makeRequest(body, sign(body, 'wrong')))).status).toBe(401);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.MORTA_WEBHOOK_SECRET;
    try {
      const body = JSON.stringify(envelope('project.created'));
      expect((await POST(makeRequest(body, sign(body)))).status).toBe(500);
    } finally {
      process.env.MORTA_WEBHOOK_SECRET = SECRET;
    }
  });
});
