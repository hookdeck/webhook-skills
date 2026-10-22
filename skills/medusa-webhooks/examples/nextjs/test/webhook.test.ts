import { describe, it, expect, beforeAll, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { verifyMedusaWebhook } from '../lib/medusa';

// The endpoint signing secret is used as a raw UTF-8 string
const SECRET = 'test_signing_secret';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.MEDUSA_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/medusa/route'));
});

function sign(body: string, secret = SECRET, t = Math.floor(Date.now() / 1000)): string {
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

const event = (type: string, data: Record<string, unknown> = {}) => ({
  id: 'whev_01HXYZ4567ABCDEF',
  type,
  created_at: '2024-11-12T10:03:00.000Z',
  data: {
    organization: { id: 'org_01HXYZ9012ABCDEF', name: 'Acme Corp' },
    project: { id: 'proj_01HXYZ3456ABCDEF', name: 'My Storefront', handle: 'my-storefront' },
    environment: { id: 'projenv_01HXYZ7890ABCDEF', name: 'Production', handle: 'production', branch: 'main' },
    ...data,
  },
});

function makeRequest(body: string, header?: string, contentType = 'application/json'): NextRequest {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (header) headers['x-medusa-signature'] = header;
  return new NextRequest('http://localhost:3000/webhooks/medusa', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyMedusaWebhook', () => {
  const body = JSON.stringify(event('build.created'));

  it('accepts a valid signature', () => {
    expect(verifyMedusaWebhook(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects wrong secret', () => {
    expect(verifyMedusaWebhook(body, sign(body, 'other_secret'), SECRET)).toBe(false);
  });

  it('rejects tampered body', () => {
    expect(verifyMedusaWebhook(body + ' ', sign(body), SECRET)).toBe(false);
  });

  it('accepts an old timestamp by default (Hookdeck retries keep the original t)', () => {
    delete process.env.MEDUSA_TIMESTAMP_TOLERANCE_SECONDS;
    const old = Math.floor(Date.now() / 1000) - 86400;
    expect(verifyMedusaWebhook(body, sign(body, SECRET, old), SECRET)).toBe(true);
  });

  it('rejects an old timestamp with an explicit tolerance', () => {
    const old = Math.floor(Date.now() / 1000) - 600;
    expect(verifyMedusaWebhook(body, sign(body, SECRET, old), SECRET, 300)).toBe(false);
  });

  it('rejects an old timestamp when MEDUSA_TIMESTAMP_TOLERANCE_SECONDS is set', () => {
    process.env.MEDUSA_TIMESTAMP_TOLERANCE_SECONDS = '300';
    try {
      const old = Math.floor(Date.now() / 1000) - 600;
      expect(verifyMedusaWebhook(body, sign(body, SECRET, old), SECRET)).toBe(false);
    } finally {
      delete process.env.MEDUSA_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  it('treats a non-numeric MEDUSA_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', () => {
    process.env.MEDUSA_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const old = Math.floor(Date.now() / 1000) - 600;
      expect(verifyMedusaWebhook(body, sign(body, SECRET, old), SECRET)).toBe(true);
    } finally {
      delete process.env.MEDUSA_TIMESTAMP_TOLERANCE_SECONDS;
      warn.mockRestore();
    }
  });

  it('stale timestamp passes with a wider tolerance', () => {
    const old = Math.floor(Date.now() / 1000) - 600;
    expect(verifyMedusaWebhook(body, sign(body, SECRET, old), SECRET, 3600)).toBe(true);
  });

  it('rejects malformed headers', () => {
    expect(verifyMedusaWebhook(body, 'garbage', SECRET)).toBe(false);
    expect(verifyMedusaWebhook(body, 't=abc,v1=00', SECRET)).toBe(false);
    expect(verifyMedusaWebhook(body, null, SECRET)).toBe(false);
  });

  it('accepts when any v1 signature matches', () => {
    expect(verifyMedusaWebhook(body, `${sign(body)},v1=deadbeef`, SECRET)).toBe(true);
  });
});

describe('POST /webhooks/medusa', () => {
  const types = [
    'build.created',
    'build.succeeded',
    'build.failed',
    'build.canceled',
    'deployment.created',
    'deployment.succeeded',
    'deployment.failed',
    'deployment.canceled',
    'something.new',
  ];

  it.each(types)('returns 200 for %s', async (type) => {
    const body = JSON.stringify(event(type, { build: { id: 'build_1' }, deployment: { id: 'depl_1' } }));
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
  });

  it('verifies regardless of content type', async () => {
    const body = JSON.stringify(event('build.succeeded'));
    const res = await POST(makeRequest(body, sign(body), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for an invalid signature', async () => {
    const body = JSON.stringify(event('build.created'));
    const res = await POST(makeRequest(body, sign(body, 'wrong_secret')));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a missing header', async () => {
    const res = await POST(makeRequest(JSON.stringify(event('build.created'))));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a validly signed array body', async () => {
    const body = JSON.stringify([event('build.created')]);
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(400);
  });

  it('returns 400 for validly signed invalid JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(400);
  });
});
