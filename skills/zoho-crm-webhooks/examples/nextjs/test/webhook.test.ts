// Generated with: zoho-crm-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST, PUT } from '../app/webhooks/zoho-crm/route';
import { parseBody, verifyZohoCrmRequest } from '../lib/verify-zoho-crm';

// Test-only values. In Zoho these are the Custom Parameter's name and value.
const HEADER = 'X-Webhook-Secret';
const SECRET = 'zcrm-test-secret-6f1c2a9d4b7e';

const leadBody = JSON.stringify({
  module: 'Leads',
  id: '5725767000000412001',
  last_name: 'Lovelace',
  email: 'ada@example.com',
});

function makeRequest(body: string, headers: Record<string, string>, method = 'POST'): Request {
  return new Request('http://localhost/webhooks/zoho-crm', { method, headers, body });
}

beforeEach(() => {
  process.env.ZOHO_CRM_WEBHOOK_HEADER = HEADER;
  process.env.ZOHO_CRM_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('verifyZohoCrmRequest', () => {
  it('accepts the exact value and rejects anything else', () => {
    expect(verifyZohoCrmRequest(new Headers({ [HEADER]: SECRET }), HEADER, SECRET)).toBe(true);
    expect(verifyZohoCrmRequest(new Headers({ [HEADER]: 'nope' }), HEADER, SECRET)).toBe(false);
    expect(verifyZohoCrmRequest(new Headers(), HEADER, SECRET)).toBe(false);
    expect(verifyZohoCrmRequest(new Headers({ [HEADER]: SECRET }), HEADER, '')).toBe(false);
  });
});

describe('parseBody', () => {
  it('parses JSON, form-encoded and text bodies', () => {
    expect(parseBody(leadBody, 'application/json')?.format).toBe('json');
    expect(parseBody('module=Deals&id=1', 'application/x-www-form-urlencoded')).toEqual({
      format: 'form',
      data: { module: 'Deals', id: '1' },
    });
    expect(parseBody('<lead id="1"/>', 'application/xml')?.format).toBe('text');
    expect(parseBody('{bad', 'application/json')).toBeNull();
  });
});

describe('/webhooks/zoho-crm', () => {
  it('accepts a POST with the right header and a raw JSON body', async () => {
    const res = await POST(makeRequest(leadBody, { 'content-type': 'application/json', [HEADER]: SECRET }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Lead 5725767000000412001 changed'));
  });

  it('accepts a PUT', async () => {
    const res = await PUT(makeRequest(leadBody, { 'content-type': 'application/json', [HEADER]: SECRET }, 'PUT'));
    expect(res.status).toBe(200);
  });

  it('accepts form-data parameters sent form-encoded', async () => {
    const res = await POST(
      makeRequest('module=Deals&id=5725767000000412077&stage=Closed+Won', {
        'content-type': 'application/x-www-form-urlencoded',
        [HEADER]: SECRET,
      })
    );
    expect(res.status).toBe(200);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('stage: Closed Won'));
  });

  it('accepts a raw XML body', async () => {
    const res = await POST(makeRequest('<lead><id>1</id></lead>', { 'content-type': 'application/xml', [HEADER]: SECRET }));
    expect(res.status).toBe(200);
  });

  it('looks the header up case-insensitively', async () => {
    const res = await POST(makeRequest(leadBody, { 'x-webhook-secret': SECRET }));
    expect(res.status).toBe(200);
  });

  it('uses the header name from ZOHO_CRM_WEBHOOK_HEADER', async () => {
    process.env.ZOHO_CRM_WEBHOOK_HEADER = 'X-Zoho-Token';
    expect((await POST(makeRequest(leadBody, { 'X-Zoho-Token': SECRET }))).status).toBe(200);
    expect((await POST(makeRequest(leadBody, { [HEADER]: SECRET }))).status).toBe(401);
  });

  it('rejects a missing header, a wrong value and a prefixed value with 401', async () => {
    expect((await POST(makeRequest(leadBody, {}))).status).toBe(401);
    expect((await POST(makeRequest(leadBody, { [HEADER]: 'wrong-secret' }))).status).toBe(401);
    expect((await POST(makeRequest(leadBody, { [HEADER]: `Bearer ${SECRET}` }))).status).toBe(401);
  });

  it('returns 400 for a body labelled JSON that does not parse', async () => {
    const res = await POST(makeRequest('{"module": "Leads",', { 'content-type': 'application/json', [HEADER]: SECRET }));
    expect(res.status).toBe(400);
  });

  it('returns 500 when ZOHO_CRM_WEBHOOK_SECRET is not set', async () => {
    delete process.env.ZOHO_CRM_WEBHOOK_SECRET;
    const res = await POST(makeRequest(leadBody, { [HEADER]: SECRET }));
    expect(res.status).toBe(500);
  });
});
