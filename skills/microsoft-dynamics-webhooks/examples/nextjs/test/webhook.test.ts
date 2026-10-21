import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  POST,
  EVENTS,
  verifyDynamicsSecret,
  flattenAttributes,
  getTarget,
  dedupeKey,
  dispatch,
} from '../app/webhooks/microsoft-dynamics/route';

// Dataverse does not sign webhooks. The "secret" is a random value YOU register
// under the HttpHeader authentication option; tests send it the same way.
const SECRET = '3f9c0e7b5a1d4c2e8f6b0a9d7c5e3f1a2b4c6d8e0f1a3b5c7d9e1f2a4b6c8d0e';
const URL = 'http://localhost:3000/webhooks/microsoft-dynamics';
const CONTACT_ID = '6d81597f-0f9f-e711-8122-000d3aa2331c';

// A trimmed RemoteExecutionContext, shaped like the example in Microsoft's docs.
function context(messageName: string, overrides: Record<string, unknown> = {}) {
  return {
    MessageName: messageName,
    PrimaryEntityName: 'contact',
    PrimaryEntityId: CONTACT_ID,
    OperationId: '4af10637-4ea2-e711-8122-000d3aa2331c',
    OrganizationName: 'OrgName',
    Stage: 40,
    Mode: 1,
    InputParameters: [
      {
        key: 'Target',
        value: {
          __type: 'Entity:http://schemas.microsoft.com/xrm/2011/Contracts',
          Id: CONTACT_ID,
          LogicalName: 'contact',
          Attributes: [
            { key: 'firstname', value: 'James' },
            { key: 'fullname', value: 'James Glynn (sample)' },
          ],
        },
      },
    ],
    OwningExtension: { Id: '75417616-4ea2-e711-8122-000d3aa2331c', LogicalName: 'sdkmessageprocessingstep' },
    ...overrides,
  };
}

function makeRequest(
  body: unknown,
  {
    header = 'X-Webhook-Secret',
    secret = SECRET as string | null,
    contentType = 'application/json',
    extra = {} as Record<string, string>,
  } = {}
) {
  const headers: Record<string, string> = { 'Content-Type': contentType, ...extra };
  if (secret !== null) headers[header] = secret;
  return new NextRequest(URL, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.DYNAMICS_WEBHOOK_SECRET = SECRET;
  delete process.env.DYNAMICS_WEBHOOK_HEADER;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyDynamicsSecret', () => {
  it('accepts the matching secret', () => {
    expect(verifyDynamicsSecret(SECRET)).toBe(true);
  });

  it('rejects a wrong secret of the same length', () => {
    expect(verifyDynamicsSecret('a'.repeat(SECRET.length))).toBe(false);
  });

  it('rejects a secret of a different length without throwing', () => {
    expect(verifyDynamicsSecret('short')).toBe(false);
    expect(verifyDynamicsSecret(SECRET + 'x')).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyDynamicsSecret(null)).toBe(false);
  });

  it('throws when the secret is not configured', () => {
    delete process.env.DYNAMICS_WEBHOOK_SECRET;
    expect(() => verifyDynamicsSecret(SECRET)).toThrow(/not set/);
  });
});

describe('RemoteExecutionContext helpers', () => {
  it('flattens [{key, value}] attributes', () => {
    const attrs = flattenAttributes(getTarget(context('Update')));
    expect(attrs).toEqual({ firstname: 'James', fullname: 'James Glynn (sample)' });
  });

  it('returns no target when InputParameters were removed (payload over 256 KB)', () => {
    const ctx = context('Update', { InputParameters: undefined });
    expect(getTarget(ctx)).toBeUndefined();
    expect(flattenAttributes(getTarget(ctx))).toEqual({});
  });

  it('builds a dedupe key from OperationId and step id', () => {
    expect(dedupeKey(context('Create'))).toBe(
      '4af10637-4ea2-e711-8122-000d3aa2331c:75417616-4ea2-e711-8122-000d3aa2331c'
    );
    expect(dedupeKey({ MessageName: 'Create' })).toBeNull();
  });
});

describe('POST /webhooks/microsoft-dynamics', () => {
  it.each([EVENTS.CREATE, EVENTS.UPDATE, EVENTS.DELETE])('accepts a %s event', async (name) => {
    const res = await POST(makeRequest(context(name)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts an unknown message and acknowledges it', async () => {
    const res = await POST(makeRequest(context('Assign')));
    expect(res.status).toBe(200);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Assign'));
  });

  it('accepts a payload with InputParameters removed (size exceeded)', async () => {
    const res = await POST(
      makeRequest(context('Update', { InputParameters: undefined }), {
        extra: { 'x-ms-dynamics-msg-size-exceeded': 'true' },
      })
    );
    expect(res.status).toBe(200);
  });

  it('matches the header name case-insensitively', async () => {
    const res = await POST(makeRequest(context('Create'), { header: 'x-webhook-secret' }));
    expect(res.status).toBe(200);
  });

  it('honours DYNAMICS_WEBHOOK_HEADER', async () => {
    process.env.DYNAMICS_WEBHOOK_HEADER = 'X-Dynamics-Key';
    expect((await POST(makeRequest(context('Create'), { header: 'X-Dynamics-Key' }))).status).toBe(200);
    expect((await POST(makeRequest(context('Create')))).status).toBe(401);
  });

  it('accepts a body with a non-JSON content type', async () => {
    const res = await POST(makeRequest(context('Create'), { contentType: 'text/plain' }));
    expect(res.status).toBe(200);
  });

  it('rejects a missing secret header with 401', async () => {
    const res = await POST(makeRequest(context('Create'), { secret: null }));
    expect(res.status).toBe(401);
  });

  it('rejects a wrong secret with 401', async () => {
    const res = await POST(makeRequest(context('Create'), { secret: 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('checks the secret before parsing the body', async () => {
    const res = await POST(makeRequest('not json', { secret: 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('returns 500 (fail closed) when the secret is not configured', async () => {
    delete process.env.DYNAMICS_WEBHOOK_SECRET;
    const res = await POST(makeRequest(context('Create')));
    expect(res.status).toBe(500);
  });

  it('rejects invalid JSON with 400', async () => {
    const res = await POST(makeRequest('{not json'));
    expect(res.status).toBe(400);
  });

  it('rejects a body without MessageName with 400', async () => {
    const res = await POST(makeRequest({ PrimaryEntityName: 'contact' }));
    expect(res.status).toBe(400);
  });

  it('tolerates malformed InputParameters', async () => {
    const res = await POST(makeRequest(context('Create', { InputParameters: 'broken' })));
    expect(res.status).toBe(200);
  });
});

describe('dispatch', () => {
  it('returns true for handled messages and false otherwise', async () => {
    expect(await dispatch(context('Create'))).toBe(true);
    expect(await dispatch(context('Update'))).toBe(true);
    expect(await dispatch(context('Delete'))).toBe(true);
    expect(await dispatch(context('Assign'))).toBe(false);
  });
});
