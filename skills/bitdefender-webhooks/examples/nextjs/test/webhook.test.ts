import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/bitdefender/route';
import { verifyBitdefenderRequest } from '../lib/verify-bitdefender';

const AUTH = 'Bearer sfasdfw34243';

beforeAll(() => {
  process.env.BITDEFENDER_AUTHORIZATION = AUTH;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// Shapes from the Bitdefender "Push event JSON RPC messages" docs (trimmed)
const av = {
  module: 'av',
  computer_name: 'IRU-WIN10X64-A',
  malware_name: 'EICAR-Test-File (not a virus)',
  final_status: 'quarantined',
};
const aph = {
  module: 'aph',
  computer_name: 'FC-EXCHANGE-01',
  url: 'http://example.com/account/support/',
  status: 'aph_blocked',
};
const rpc = (events: unknown[]) => ({ jsonrpc: '2.0', method: 'addEvents', params: { events }, id: 1694701009244 });

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(rpc([av, aph])),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/bitdefender', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

describe('Bitdefender webhook route', () => {
  it('accepts the full Authorization header value', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('rejects a wrong credential', async () => {
    expect((await POST(makeRequest({ Authorization: 'Bearer nope' }))).status).toBe(401);
  });

  it('rejects the credential without its "Bearer " prefix', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH.replace('Bearer ', '') }))).status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(rpc([av])), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, 'not json'))).status).toBe(400);
  });

  it('returns 400 when params.events is missing', async () => {
    const body = JSON.stringify({ jsonrpc: '2.0', method: 'addEvents', params: {}, id: 1 });
    expect((await POST(makeRequest({ Authorization: AUTH }, body))).status).toBe(400);
  });

  it('returns 400 for a different JSON-RPC method', async () => {
    const body = JSON.stringify({ jsonrpc: '2.0', method: 'other', params: { events: [] }, id: 1 });
    expect((await POST(makeRequest({ Authorization: AUTH }, body))).status).toBe(400);
  });

  it('accepts unknown modules', async () => {
    const body = JSON.stringify(rpc([{ module: 'something-new' }]));
    expect((await POST(makeRequest({ Authorization: AUTH }, body))).status).toBe(200);
  });
});

describe('helpers', () => {
  it('never accepts when BITDEFENDER_AUTHORIZATION is unset', () => {
    expect(verifyBitdefenderRequest(new Headers({ Authorization: 'Bearer x' }), {})).toBe(false);
    expect(
      verifyBitdefenderRequest(new Headers({ Authorization: '' }), { BITDEFENDER_AUTHORIZATION: '' })
    ).toBe(false);
  });
});
