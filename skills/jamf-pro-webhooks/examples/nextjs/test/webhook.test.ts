import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/jamf-pro/route';
import { verifyJamfProRequest } from '../lib/verify-jamf-pro';
import { EVENT_LABELS } from '../lib/events';

const HEADER = 'X-Jamf-Secret';
const SECRET = 'Bearer test_jamf_secret_0123456789';
const EVENTS = Object.keys(EVENT_LABELS);

beforeAll(() => {
  process.env.JAMF_PRO_WEBHOOK_HEADER = HEADER;
  process.env.JAMF_PRO_WEBHOOK_SECRET = SECRET;
});

function samplePayload(webhookEvent = 'ComputerAdded') {
  return {
    webhook: { id: 1, name: 'Test webhook', webhookEvent, eventTimestamp: 1761400000000 },
    event: { udid: 'A1B2C3D4-0000-1111-2222-333344445555', deviceName: 'Mac-1', serialNumber: 'C02XXXXXXXXX', jssID: 42 },
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/jamf-pro', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('Header Authentication', () => {
  it('accepts the correct header value', async () => {
    const res = await POST(makeRequest({ [HEADER]: SECRET }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('looks the header name up case-insensitively', async () => {
    const res = await POST(makeRequest({ [HEADER.toLowerCase()]: SECRET }));
    expect(res.status).toBe(200);
  });

  it('compares the whole value, including the Bearer prefix', async () => {
    const res = await POST(makeRequest({ [HEADER]: SECRET.replace('Bearer ', '') }));
    expect(res.status).toBe(401);
  });

  it('rejects a wrong value of the same length', async () => {
    const res = await POST(makeRequest({ [HEADER]: 'x'.repeat(SECRET.length) }));
    expect(res.status).toBe(401);
  });

  it('rejects a value of a different length without throwing', async () => {
    const res = await POST(makeRequest({ [HEADER]: 'short' }));
    expect(res.status).toBe(401);
  });

  it('rejects a missing header', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it('rejects the secret sent under a different header name', async () => {
    const res = await POST(makeRequest({ authorization: SECRET }));
    expect(res.status).toBe(401);
  });

  it('defaults the header name to Authorization', () => {
    const saved = process.env.JAMF_PRO_WEBHOOK_HEADER;
    delete process.env.JAMF_PRO_WEBHOOK_HEADER;
    expect(verifyJamfProRequest(new Headers({ authorization: SECRET }))).toBe(true);
    expect(verifyJamfProRequest(new Headers({ [HEADER]: SECRET }))).toBe(false);
    process.env.JAMF_PRO_WEBHOOK_HEADER = saved;
  });

  it('rejects everything when the secret is unset', () => {
    const headers = new Headers({ [HEADER]: SECRET });
    expect(verifyJamfProRequest(headers, HEADER, '')).toBe(false);
    const saved = process.env.JAMF_PRO_WEBHOOK_SECRET;
    delete process.env.JAMF_PRO_WEBHOOK_SECRET;
    expect(verifyJamfProRequest(headers, HEADER)).toBe(false);
    process.env.JAMF_PRO_WEBHOOK_SECRET = saved;
  });
});

describe('Body handling', () => {
  it('accepts any content type (raw body)', async () => {
    const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload()), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON (e.g. XML) after authenticating', async () => {
    const res = await POST(makeRequest({ [HEADER]: SECRET }, '<JSSEvent></JSSEvent>', 'application/xml'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-object JSON body', async () => {
    const res = await POST(makeRequest({ [HEADER]: SECRET }, '[1,2]'));
    expect(res.status).toBe(400);
  });

  it('returns 401, not 400, for invalid JSON without the header', async () => {
    const res = await POST(makeRequest({}, '{not json'));
    expect(res.status).toBe(401);
  });
});

describe('Event handling', () => {
  it('covers the 22 documented webhookEvent values', () => {
    expect(EVENTS).toHaveLength(22);
  });

  it.each(EVENTS)('handles %s', async (webhookEvent) => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(webhookEvent))));
    expect(res.status).toBe(200);
    expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
    spy.mockRestore();
  });

  it('acknowledges unknown events', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload('SomethingNew'))));
    expect(res.status).toBe(200);
    spy.mockRestore();
  });
});
