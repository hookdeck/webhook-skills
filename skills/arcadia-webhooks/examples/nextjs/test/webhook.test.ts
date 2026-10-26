import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/arcadia/route';
import { verifyArcadiaRequest } from '../lib/verify-arcadia';

const HEADER = 'X-Arcadia-Token';
const SECRET = 'test_arcadia_secret_0123456789';

beforeAll(() => {
  process.env.ARCADIA_WEBHOOK_HEADER = HEADER;
  process.env.ARCADIA_WEBHOOK_SECRET = SECRET;
});

// Compact versions of the documented sample payloads: [eventType, resource, data]
const CREDENTIAL = { id: 'crd_0c5d396f-f11c-c76b-9be8-89343463af21', connectionHealth: 'CONNECTION_SUCCESS', isCustomerActionRequired: false };
const METER = { id: 'mtr_1', accounts: [{ id: 'act_831b8c55-77b6-3341-c922-aa371ad3c2a9', accountNumber: '9207895340384735758' }] };
const EVENTS: [string, string, unknown][] = [
  ['STATUS_CHANGE', 'CREDENTIAL', CREDENTIAL],
  ['NEW_DATA_AVAILABLE', 'METER', METER],
  ['EXISTING_DATA_UPDATED', 'METER', METER],
  ['DATA_DELETED', 'BUSINESS_UNIT_DELETION', { businessUnitId: 'bus_69dc6270-0dbe-cd39-cadf-40f83ecfd416', movedToBusinessUnitId: 'bus_fb71b140-b933-9c35-4a40-3aca987b6583', totalAccountsMoved: 4 }],
  ['BUSINESS_UNIT_ASSIGNMENT', 'ROOT_BUSINESS_UNIT_ACCOUNT', { account: { id: 'act_02e0642e-e303-f82e-fd8a-47c5dc3bcab3' } }],
  ['REAL_TIME_CREDENTIAL_VALIDATION_SUCCESS', 'CREDENTIAL', CREDENTIAL],
  ['REAL_TIME_CREDENTIAL_VALIDATION_FAILURE', 'CREDENTIAL', { ...CREDENTIAL, connectionHealth: 'CONNECTION_FAILURE', isCustomerActionRequired: true }],
  ['MFA_CHALLENGE_METHOD', 'MFA_METHOD_PROMPT', { credential: CREDENTIAL, verificationMethods: ['sms', 'email'] }],
  ['MFA_CHALLENGE_CODE', 'MFA_CODE_PROMPT', { credential: CREDENTIAL, isResubmission: false }],
];

let counter = 0;
function samplePayload(eventType = 'STATUS_CHANGE', resource = 'CREDENTIAL', data: unknown = CREDENTIAL) {
  counter += 1;
  return {
    id: `whk_00000000-0000-0000-0000-${String(counter).padStart(12, '0')}`,
    eventType,
    resource,
    createdAt: '2024-02-21T00:00:00.000+00:00',
    businessUnitIds: ['bus_5ab42908-c08f-260c-466c-49a3904a86eb'],
    errors: [],
    data,
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(samplePayload()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/arcadia', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

describe('Arcadia webhook endpoint', () => {
  describe('custom header verification', () => {
    it('accepts the correct header value', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await POST(makeRequest({ 'x-arcadia-token': SECRET }));
      expect(res.status).toBe(200);
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

    it('does not accept the secret in an Authorization header', async () => {
      const res = await POST(makeRequest({ Authorization: `Bearer ${SECRET}` }));
      expect(res.status).toBe(401);
    });

    it('compares the whole value without parsing a Bearer prefix', () => {
      const env = { ARCADIA_WEBHOOK_HEADER: 'X-Arcadia-Token', ARCADIA_WEBHOOK_SECRET: 'Bearer_abc' };
      expect(verifyArcadiaRequest(new Headers({ 'x-arcadia-token': 'Bearer_abc' }), env)).toBe(true);
      expect(verifyArcadiaRequest(new Headers({ 'x-arcadia-token': 'abc' }), env)).toBe(false);
    });

    it('uses a custom header name from ARCADIA_WEBHOOK_HEADER', () => {
      const env = { ARCADIA_WEBHOOK_HEADER: 'X-Utility-Key', ARCADIA_WEBHOOK_SECRET: SECRET };
      expect(verifyArcadiaRequest(new Headers({ 'x-utility-key': SECRET }), env)).toBe(true);
      expect(verifyArcadiaRequest(new Headers({ 'x-arcadia-token': SECRET }), env)).toBe(false);
    });

    it('defaults the header name to X-Arcadia-Token', () => {
      expect(verifyArcadiaRequest(new Headers({ 'x-arcadia-token': SECRET }), { ARCADIA_WEBHOOK_SECRET: SECRET })).toBe(true);
    });

    it('rejects everything when ARCADIA_WEBHOOK_SECRET is unset', () => {
      expect(verifyArcadiaRequest(new Headers({ 'x-arcadia-token': SECRET }), {})).toBe(false);
      expect(verifyArcadiaRequest(new Headers({ 'x-arcadia-token': '' }), { ARCADIA_WEBHOOK_SECRET: '' })).toBe(false);
    });
  });

  describe('body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload()), 'text/plain'));
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON after authenticating', async () => {
      const res = await POST(makeRequest({ [HEADER]: SECRET }, '{not json'));
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

  describe('event handling', () => {
    it.each(EVENTS)('handles %s (%s)', async (eventType, resource, data) => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload(eventType, resource, data))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges unknown events', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const res = await POST(makeRequest({ [HEADER]: SECRET }, JSON.stringify(samplePayload('SOMETHING_NEW', 'THING', {}))));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(true);
      spy.mockRestore();
    });

    it('de-duplicates on the payload id', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const body = JSON.stringify(samplePayload('NEW_DATA_AVAILABLE', 'METER', METER));
      const first = await POST(makeRequest({ [HEADER]: SECRET }, body));
      const second = await POST(makeRequest({ [HEADER]: SECRET }, body));
      expect(await first.json()).toEqual({ received: true });
      expect(second.status).toBe(200);
      expect(await second.json()).toEqual({ received: true, duplicate: true });
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });
});
