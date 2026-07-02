import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, verifyAuth0Token } from '../app/webhooks/auth0/route';

const TOKEN = 'test_log_stream_token';

beforeAll(() => {
  process.env.AUTH0_LOG_STREAM_TOKEN = TOKEN;
});

function sampleBatch() {
  return [
    {
      log_id: '90020210714154213417000000000000000000000000000000',
      data: {
        date: '2021-07-14T15:42:13.410Z',
        type: 's',
        description: 'Successful login',
        client_id: 'AbC123ClientId',
        ip: '203.0.113.10',
        user_id: 'auth0|64f0000000000000000000001',
        user_name: 'user@example.com',
      },
    },
  ];
}

function makeRequest(body: unknown, authHeader?: string): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (authHeader !== undefined) headers['authorization'] = authHeader;
  return new NextRequest('http://localhost:3000/webhooks/auth0', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('verifyAuth0Token', () => {
  it('accepts a matching token', () => {
    expect(verifyAuth0Token(TOKEN, TOKEN)).toBe(true);
  });

  it('rejects a wrong token of equal length', () => {
    expect(verifyAuth0Token('test_log_stream_XXXXX', TOKEN)).toBe(false);
  });

  it('rejects a token of different length', () => {
    expect(verifyAuth0Token('short', TOKEN)).toBe(false);
  });

  it('rejects a null header', () => {
    expect(verifyAuth0Token(null, TOKEN)).toBe(false);
  });

  it('rejects when no expected token is configured', () => {
    expect(verifyAuth0Token(TOKEN, undefined)).toBe(false);
  });
});

describe('POST /webhooks/auth0', () => {
  it('returns 401 for missing Authorization header', async () => {
    const res = await POST(makeRequest(sampleBatch()));
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid Authorization token', async () => {
    const res = await POST(makeRequest(sampleBatch(), 'wrong_token'));
    expect(res.status).toBe(401);
  });

  it('returns 200 for a valid token', async () => {
    const res = await POST(makeRequest(sampleBatch(), TOKEN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: 1 });
  });

  it('processes a batch of multiple events', async () => {
    const batch = [
      { data: { type: 's', user_name: 'a@example.com' } },
      { data: { type: 'f', ip: '203.0.113.10', description: 'wrong password' } },
      { data: { type: 'ss', user_name: 'b@example.com' } },
      { data: { type: 'fs', description: 'invalid email' } },
      { data: { type: 'sepft', user_name: 'a@example.com' } },
      { data: { type: 'unknown_code' } },
    ];
    const res = await POST(makeRequest(batch, TOKEN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: 6 });
  });
});
