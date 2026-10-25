import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET = 'pLjUpNQu8a4YjeCrf2KseA';
process.env.DENTALLY_WEBHOOK_SECRET = SECRET;

import { POST } from '../app/webhooks/dentally/route';

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function payload(event: string): string {
  return JSON.stringify({ data: { id: 2181 }, event, object: event.split('.')[0], user: { id: 1 } });
}

function makeRequest(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/dentally', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('Dentally webhook route', () => {
  beforeAll(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(() => vi.restoreAllMocks());

  const events = [
    'appointment.created', 'appointment.updated', 'appointment.deleted',
    'patient.created', 'patient.updated', 'patient.deleted',
    'payment.created', 'payment.updated', 'payment.deleted',
  ];

  it.each(events)('accepts a validly signed %s event', async (event) => {
    const body = payload(event);
    const res = await POST(makeRequest(body, { 'x-dentally-signature': sign(body) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('verifies regardless of Content-Type', async () => {
    const body = payload('patient.updated');
    const res = await POST(
      makeRequest(body, { 'content-type': 'text/plain', 'x-dentally-signature': sign(body) })
    );
    expect(res.status).toBe(200);
  });

  it('accepts an uppercase hex signature', async () => {
    const body = payload('appointment.created');
    const res = await POST(makeRequest(body, { 'x-dentally-signature': sign(body).toUpperCase() }));
    expect(res.status).toBe(200);
  });

  it('returns 204 for unknown events', async () => {
    const body = payload('invoice.created');
    const res = await POST(makeRequest(body, { 'x-dentally-signature': sign(body) }));
    expect(res.status).toBe(204);
  });

  it('rejects a missing signature header', async () => {
    const res = await POST(makeRequest(payload('appointment.created')));
    expect(res.status).toBe(400);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = payload('appointment.created');
    const res = await POST(makeRequest(body, { 'x-dentally-signature': sign(body, 'wrong-secret') }));
    expect(res.status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    const signed = payload('appointment.created');
    const res = await POST(
      makeRequest(payload('appointment.deleted'), { 'x-dentally-signature': sign(signed) })
    );
    expect(res.status).toBe(401);
  });

  it.each([
    ['too short', 'abc123'],
    ['non-hex of right length', 'z'.repeat(64)],
    ['valid hex prefix with junk suffix', sign('x').slice(0, 60) + 'zzzz'],
    ['prefixed', 'sha256=' + sign('x')],
  ])('rejects a malformed signature (%s)', async (_name, sig) => {
    const res = await POST(makeRequest(payload('appointment.created'), { 'x-dentally-signature': sig }));
    expect(res.status).toBe(401);
  });

  it('rejects invalid JSON that is correctly signed', async () => {
    const body = 'not json';
    const res = await POST(makeRequest(body, { 'x-dentally-signature': sign(body) }));
    expect(res.status).toBe(400);
  });
});
