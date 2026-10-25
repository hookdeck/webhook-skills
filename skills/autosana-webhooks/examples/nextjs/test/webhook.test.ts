import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET = 'test_autosana_signing_secret';

let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.AUTOSANA_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/autosana/route'));
});

function sign(body: string, secret = SECRET) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function payload(event = 'batch.completed') {
  return JSON.stringify({
    event,
    timestamp: '2025-01-31T12:34:56.789Z',
    app: { id: 'com.example.myapp', bundle_id: 'com.example.myapp', name: 'My App', platform: 'android' },
    git: { commit_sha: 'a1b2c3d4e5f6', branch: 'main' },
    summary: { total_groups: 3, passed_groups: 2, failed_groups: 1 },
    run_groups: [
      {
        name: 'Login Suite',
        status: 'passed',
        url: 'https://autosana.ai/runs/groups/f1e2d3c4',
        runs: [{ name: 'User can sign in with email', status: 'passed', url: 'https://autosana.ai/runs/flow/1234' }],
      },
    ],
  });
}

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/webhooks/autosana', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('Autosana webhook', () => {
  it('accepts a valid batch.completed event', async () => {
    const body = payload();
    const res = await POST(makeRequest(body, { 'x-autosana-signature-256': sign(body) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies any content type (raw body)', async () => {
    const body = payload();
    const res = await POST(
      makeRequest(body, { 'content-type': 'text/plain', 'x-autosana-signature-256': sign(body) })
    );
    expect(res.status).toBe(200);
  });

  it('accepts an uppercase hex digest', async () => {
    const body = payload();
    const upper = 'sha256=' + sign(body).slice('sha256='.length).toUpperCase();
    const res = await POST(makeRequest(body, { 'x-autosana-signature-256': upper }));
    expect(res.status).toBe(200);
  });

  it('accepts unhandled event names with a valid signature', async () => {
    const body = payload('batch.started');
    const res = await POST(makeRequest(body, { 'x-autosana-signature-256': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('rejects missing signature (unsigned delivery)', async () => {
    const res = await POST(makeRequest(payload()));
    expect(res.status).toBe(400);
  });

  it('rejects wrong secret', async () => {
    const body = payload();
    const res = await POST(makeRequest(body, { 'x-autosana-signature-256': sign(body, 'wrong') }));
    expect(res.status).toBe(400);
  });

  it('rejects tampered body', async () => {
    const body = payload();
    const res = await POST(
      makeRequest(body.replace('My App', 'Other App'), { 'x-autosana-signature-256': sign(body) })
    );
    expect(res.status).toBe(400);
  });

  it('rejects signature without sha256= prefix', async () => {
    const body = payload();
    const res = await POST(
      makeRequest(body, { 'x-autosana-signature-256': sign(body).slice('sha256='.length) })
    );
    expect(res.status).toBe(400);
  });

  it('rejects non-hex or wrong-length digests', async () => {
    const body = payload();
    const good = sign(body).slice('sha256='.length);
    for (const bad of ['sha256=', 'sha256=zz' + good.slice(2), 'sha256=' + good.slice(2), 'sha256=' + good + 'ab']) {
      const res = await POST(makeRequest(body, { 'x-autosana-signature-256': bad }));
      expect(res.status).toBe(400);
    }
  });

  it('rejects valid signature over invalid JSON', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, { 'x-autosana-signature-256': sign(body) }));
    expect(res.status).toBe(400);
  });
});
