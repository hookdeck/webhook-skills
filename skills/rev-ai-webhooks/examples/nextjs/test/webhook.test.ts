import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/rev-ai/route';
import { verifyRevAiRequest } from '../lib/verify-rev-ai';

const CREDENTIAL = 'Bearer 7f3c9a1e-5b2d-4c68-8e0a-91d4b6c2f375';

beforeAll(() => {
  process.env.REV_AI_AUTHORIZATION = CREDENTIAL;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// Shapes taken from the Rev AI webhooks documentation
const transcribed = {
  job: {
    id: 'Umx5c6F7pH7r',
    status: 'transcribed',
    created_on: '2018-05-05T23:23:22.29Z',
    duration_seconds: 356.24,
  },
};
const failed = {
  job: {
    id: 'Umx5c6F7pH7r',
    status: 'failed',
    created_on: '2018-05-05T23:23:22.29Z',
    failure: 'download_failure',
    failure_detail: 'Failed to download media file. Please check your url and file type',
  },
};

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(transcribed),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/rev-ai', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

describe('Rev AI webhook', () => {
  it('accepts the full Authorization header value (transcribed)', async () => {
    const res = await POST(makeRequest({ Authorization: CREDENTIAL }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a failed job', async () => {
    const res = await POST(makeRequest({ Authorization: CREDENTIAL }, JSON.stringify(failed)));
    expect(res.status).toBe(200);
  });

  it('rejects a missing Authorization header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('rejects a wrong credential', async () => {
    expect((await POST(makeRequest({ Authorization: 'Bearer wrong' }))).status).toBe(401);
  });

  it('rejects the token without the scheme prefix', async () => {
    const res = await POST(makeRequest({ Authorization: CREDENTIAL.replace('Bearer ', '') }));
    expect(res.status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await POST(makeRequest({ Authorization: CREDENTIAL }, JSON.stringify(transcribed), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('rejects before parsing: bad credential with invalid JSON is 401', async () => {
    expect((await POST(makeRequest({ Authorization: 'Bearer wrong' }, 'not json'))).status).toBe(401);
  });

  it('returns 400 for invalid JSON and JSON arrays', async () => {
    expect((await POST(makeRequest({ Authorization: CREDENTIAL }, 'not json'))).status).toBe(400);
    expect((await POST(makeRequest({ Authorization: CREDENTIAL }, '[1,2]'))).status).toBe(400);
  });

  it('acknowledges unknown statuses with 200', async () => {
    const body = JSON.stringify({ job: { id: 'x', status: 'in_progress' } });
    expect((await POST(makeRequest({ Authorization: CREDENTIAL }, body))).status).toBe(200);
  });

  it('never accepts when REV_AI_AUTHORIZATION is unset', () => {
    const h = new Headers({ Authorization: 'Bearer x' });
    expect(verifyRevAiRequest(h, {})).toBe(false);
    expect(verifyRevAiRequest(new Headers({ Authorization: CREDENTIAL }), { REV_AI_AUTHORIZATION: '' })).toBe(false);
  });
});
