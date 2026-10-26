import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const secret = 'ahywqn676nwh8';

let POST: (request: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.AUTOTASK_WEBHOOK_SECRET = secret;
  ({ POST } = await import('../app/webhooks/autotask/route'));
});

// Generate a real Autotask signature: sha1=base64(HMAC_SHA1(secret, body))
function sign(payload: string, key: string = secret): string {
  return 'sha1=' + crypto.createHmac('sha1', key).update(payload).digest('base64');
}

function makeRequest(body: string, headers: Record<string, string> = {}, contentType = 'application/json') {
  return new NextRequest('http://localhost:3000/webhooks/autotask', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

const ticketCreate = JSON.stringify({
  Action: 'Create',
  Guid: '8f1c1d5e-2f4b-4b1e-9d0e-3a0f1d2c3b4a',
  EntityType: 'Ticket',
  Id: 12345,
  Fields: { Title: 'Printer offline' },
  EventTime: '2026-10-22T10:00:00Z',
  SequenceNumber: 7,
  PersonID: 29682894,
});

describe('POST /webhooks/autotask', () => {
  it('accepts a signed Ticket Create', async () => {
    const res = await POST(makeRequest(ticketCreate, { 'x-hook-signature': sign(ticketCreate) }));
    expect(res.status).toBe(200);
  });

  it.each([
    ['Company', 'Update'],
    ['Contact', 'Delete'],
    ['TicketNote', 'Create'],
    ['Company', 'Deactivated'],
    ['ConfigurationItem', 'Create'],
  ])('accepts a signed %s %s', async (EntityType, Action) => {
    const body = JSON.stringify({ Action, EntityType, Id: 1, Fields: {} });
    const res = await POST(makeRequest(body, { 'x-hook-signature': sign(body) }));
    expect(res.status).toBe(200);
  });

  it('verifies any content type', async () => {
    const res = await POST(makeRequest(ticketCreate, { 'x-hook-signature': sign(ticketCreate) }, 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 401 when the signature header is missing', async () => {
    expect((await POST(makeRequest(ticketCreate))).status).toBe(401);
  });

  it('returns 401 for a wrong secret', async () => {
    const res = await POST(makeRequest(ticketCreate, { 'x-hook-signature': sign(ticketCreate, 'other') }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a tampered body', async () => {
    const res = await POST(makeRequest(ticketCreate + ' ', { 'x-hook-signature': sign(ticketCreate) }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a missing sha1= prefix', async () => {
    const res = await POST(makeRequest(ticketCreate, { 'x-hook-signature': sign(ticketCreate).slice(5) }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a signature with the padding stripped', async () => {
    const res = await POST(makeRequest(ticketCreate, { 'x-hook-signature': sign(ticketCreate).replace(/=+$/, '') }));
    expect(res.status).toBe(401);
  });

  it('returns 401 (not 500) for a non-ASCII signature header', async () => {
    const res = await POST(makeRequest(ticketCreate, { 'x-hook-signature': 'sha1=café' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a signed body that is not JSON', async () => {
    const res = await POST(makeRequest('not json', { 'x-hook-signature': sign('not json') }));
    expect(res.status).toBe(400);
  });
});
