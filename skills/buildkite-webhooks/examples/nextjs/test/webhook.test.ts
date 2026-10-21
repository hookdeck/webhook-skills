import { describe, it, expect, beforeAll, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Buildkite tokens are opaque strings; this one is only for tests
const TOKEN = 'test_buildkite_token_309c9c842';

let POST: (request: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.BUILDKITE_WEBHOOK_TOKEN = TOKEN;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  ({ POST } = await import('../app/webhooks/buildkite/route'));
});

function sign(body: string, timestamp = Math.floor(Date.now() / 1000), token = TOKEN): string {
  const signature = crypto.createHmac('sha256', token).update(`${timestamp}.${body}`).digest('hex');
  return `timestamp=${timestamp},signature=${signature}`;
}

function post(body: string, headers: Record<string, string>) {
  return POST(
    new NextRequest('http://localhost:3000/webhooks/buildkite', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    })
  );
}

const finished = JSON.stringify({ event: 'build.finished', build: { number: 7, state: 'passed' } });

describe('Buildkite webhook (token mode)', () => {
  it('accepts a valid X-Buildkite-Token', async () => {
    const res = await post(finished, { 'x-buildkite-event': 'build.finished', 'x-buildkite-token': TOKEN });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects a wrong token', async () => {
    const res = await post(finished, { 'x-buildkite-token': 'nope' });
    expect(res.status).toBe(400);
  });

  it('rejects a token of different length without throwing', async () => {
    const res = await post(finished, { 'x-buildkite-token': TOKEN + 'x' });
    expect(res.status).toBe(400);
  });

  it('rejects when neither header is present', async () => {
    const res = await post(finished, { 'x-buildkite-event': 'build.finished' });
    expect(res.status).toBe(400);
  });
});

describe('Buildkite webhook (signature mode)', () => {
  it('accepts a valid X-Buildkite-Signature', async () => {
    const res = await post(finished, {
      'x-buildkite-event': 'build.finished',
      'x-buildkite-signature': sign(finished),
    });
    expect(res.status).toBe(200);
  });

  it('rejects a tampered body', async () => {
    const res = await post(finished.replace('passed', 'failed'), {
      'x-buildkite-signature': sign(finished),
    });
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the wrong token', async () => {
    const res = await post(finished, { 'x-buildkite-signature': sign(finished, undefined, 'other_token') });
    expect(res.status).toBe(400);
  });

  it('accepts an old timestamp by default (retries and replays keep the original)', async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    const res = await post(finished, { 'x-buildkite-signature': sign(finished, old) });
    expect(res.status).toBe(200);
  });

  it('rejects an old timestamp when BUILDKITE_TIMESTAMP_TOLERANCE_SECONDS is set', async () => {
    process.env.BUILDKITE_TIMESTAMP_TOLERANCE_SECONDS = '300';
    try {
      const old = Math.floor(Date.now() / 1000) - 3600;
      const res = await post(finished, { 'x-buildkite-signature': sign(finished, old) });
      expect(res.status).toBe(400);
    } finally {
      delete process.env.BUILDKITE_TIMESTAMP_TOLERANCE_SECONDS;
    }
  });

  it('treats a non-numeric BUILDKITE_TIMESTAMP_TOLERANCE_SECONDS as 0 (check off)', async () => {
    process.env.BUILDKITE_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const old = Math.floor(Date.now() / 1000) - 3600;
      const res = await post(finished, { 'x-buildkite-signature': sign(finished, old) });
      expect(res.status).toBe(200);
    } finally {
      delete process.env.BUILDKITE_TIMESTAMP_TOLERANCE_SECONDS;
      warn.mockRestore();
    }
  });

  it('rejects a malformed signature header', async () => {
    const res = await post(finished, { 'x-buildkite-signature': 'garbage' });
    expect(res.status).toBe(400);
  });

  it('does not fall back to the token when a signature is present but invalid', async () => {
    const res = await post(finished, {
      'x-buildkite-signature': 'timestamp=1,signature=abc',
      'x-buildkite-token': TOKEN,
    });
    expect(res.status).toBe(400);
  });
});

describe('Buildkite events', () => {
  const events: Array<[string, object]> = [
    ['ping', { event: 'ping', organization: { slug: 'acme' } }],
    ['build.scheduled', { event: 'build.scheduled', build: { number: 1 } }],
    ['build.running', { event: 'build.running', build: { number: 1 } }],
    ['build.failing', { event: 'build.failing', build: { number: 1 } }],
    ['build.finished', { event: 'build.finished', build: { number: 1, state: 'failed' } }],
    ['job.started', { event: 'job.started', job: { id: 'j1' } }],
    ['job.finished', { event: 'job.finished', job: { id: 'j1' } }],
    ['agent.connected', { event: 'agent.connected', agent: { name: 'agent-1' } }],
    ['agent.lost', { event: 'agent.lost', agent: { name: 'agent-1' } }],
  ];

  it.each(events)('handles %s', async (event, payload) => {
    const body = JSON.stringify(payload);
    const res = await post(body, { 'x-buildkite-event': event, 'x-buildkite-signature': sign(body) });
    expect(res.status).toBe(200);
  });

  it('rejects verified but invalid JSON', async () => {
    const body = '{not json';
    const res = await post(body, { 'x-buildkite-signature': sign(body) });
    expect(res.status).toBe(400);
  });
});
