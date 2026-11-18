// Generated with: zoho-flow-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DELETE, GET, PATCH, POST, PUT } from '../app/webhooks/zoho-flow/route';
import { parsePayload, verifyZohoFlowRequest } from '../lib/verify-zoho-flow';

// Test-only values. In Zoho Flow these are the auth profile's Parameter Name
// and the key entered on the connection.
const HEADER = 'X-Webhook-Secret';
const SECRET = 'zflow-test-secret-3b8e0d71c5a2';

const formBody = JSON.stringify({
  event: 'form.submitted',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  submitted_at: '2026-11-18T10:15:00Z',
});

function makeRequest(method: string, body: string | null, headers: Record<string, string>, query = ''): Request {
  return new Request(`http://localhost/webhooks/zoho-flow${query}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : body ?? undefined,
  });
}

const json = { 'content-type': 'application/json' };

beforeEach(() => {
  process.env.ZOHO_FLOW_WEBHOOK_HEADER = HEADER;
  process.env.ZOHO_FLOW_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('verifyZohoFlowRequest', () => {
  it('accepts the exact value and rejects anything else', () => {
    expect(verifyZohoFlowRequest(new Headers({ [HEADER]: SECRET }), HEADER, SECRET)).toBe(true);
    expect(verifyZohoFlowRequest(new Headers({ [HEADER]: 'nope' }), HEADER, SECRET)).toBe(false);
    expect(verifyZohoFlowRequest(new Headers(), HEADER, SECRET)).toBe(false);
    expect(verifyZohoFlowRequest(new Headers({ [HEADER]: SECRET }), HEADER, '')).toBe(false);
  });
});

describe('parsePayload', () => {
  it('parses JSON, form-encoded, text and query-only requests', () => {
    expect(parsePayload(formBody, 'application/json')?.format).toBe('json');
    expect(parsePayload('event=deal.won&deal_id=D-1', 'application/x-www-form-urlencoded')?.data).toEqual({
      event: 'deal.won',
      deal_id: 'D-1',
    });
    expect(parsePayload('hello', 'text/plain')?.format).toBe('text');
    expect(parsePayload('', '', new URLSearchParams('event=deal.won'))).toEqual({
      format: 'query',
      data: { event: 'deal.won' },
    });
    expect(parsePayload('{bad', 'application/json')).toBeNull();
  });
});

describe('/webhooks/zoho-flow', () => {
  it('accepts a POST with the right header and a JSON body', async () => {
    const res = await POST(makeRequest('POST', formBody, { ...json, [HEADER]: SECRET }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith('Form submitted by ada@example.com');
  });

  it('accepts PUT, PATCH and DELETE', async () => {
    const headers = { ...json, [HEADER]: SECRET };
    expect((await PUT(makeRequest('PUT', formBody, headers))).status).toBe(200);
    expect((await PATCH(makeRequest('PATCH', formBody, headers))).status).toBe(200);
    expect((await DELETE(makeRequest('DELETE', formBody, headers))).status).toBe(200);
  });

  it('accepts a GET and uses the query string as the payload', async () => {
    const res = await GET(makeRequest('GET', null, { [HEADER]: SECRET }, '?event=deal.won&deal_id=D-1042'));
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith('Deal D-1042 won');
  });

  it('looks the header up case-insensitively', async () => {
    const res = await POST(makeRequest('POST', formBody, { ...json, 'x-webhook-secret': SECRET }));
    expect(res.status).toBe(200);
  });

  it('uses the header name from ZOHO_FLOW_WEBHOOK_HEADER', async () => {
    process.env.ZOHO_FLOW_WEBHOOK_HEADER = 'X-Api-Key';
    expect((await POST(makeRequest('POST', formBody, { 'X-Api-Key': SECRET }))).status).toBe(200);
    expect((await POST(makeRequest('POST', formBody, { [HEADER]: SECRET }))).status).toBe(401);
  });

  it('rejects a missing, wrong or prefixed value, and a key in the query string', async () => {
    expect((await POST(makeRequest('POST', formBody, json))).status).toBe(401);
    expect((await POST(makeRequest('POST', formBody, { [HEADER]: 'wrong-secret' }))).status).toBe(401);
    expect((await POST(makeRequest('POST', formBody, { [HEADER]: `Bearer ${SECRET}` }))).status).toBe(401);
    expect((await GET(makeRequest('GET', null, {}, `?${HEADER}=${SECRET}`))).status).toBe(401);
  });

  it('returns 400 for a body labelled JSON that does not parse', async () => {
    const res = await POST(makeRequest('POST', '{"event":', { ...json, [HEADER]: SECRET }));
    expect(res.status).toBe(400);
  });

  it('returns 500 when ZOHO_FLOW_WEBHOOK_SECRET is not set', async () => {
    delete process.env.ZOHO_FLOW_WEBHOOK_SECRET;
    const res = await POST(makeRequest('POST', formBody, { [HEADER]: SECRET }));
    expect(res.status).toBe(500);
  });
});
