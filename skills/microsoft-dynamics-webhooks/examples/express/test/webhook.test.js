const request = require('supertest');

// Dataverse does not sign webhooks. The "secret" is a random value YOU register
// under the HttpHeader authentication option; tests send it the same way.
const SECRET = '3f9c0e7b5a1d4c2e8f6b0a9d7c5e3f1a2b4c6d8e0f1a3b5c7d9e1f2a4b6c8d0e';
process.env.DYNAMICS_WEBHOOK_SECRET = SECRET;
delete process.env.DYNAMICS_WEBHOOK_HEADER;

const { app, EVENTS, verifyDynamicsSecret, flattenAttributes, getTarget, dedupeKey, dispatch } = require('../src/index');

const PATH = '/webhooks/microsoft-dynamics';
const CONTACT_ID = '6d81597f-0f9f-e711-8122-000d3aa2331c';

// A trimmed RemoteExecutionContext, shaped like the example in Microsoft's docs.
function context(messageName, overrides = {}) {
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

function send(body, { header = 'X-Webhook-Secret', secret = SECRET, contentType = 'application/json', extra = {} } = {}) {
  const req = request(app).post(PATH).set('Content-Type', contentType);
  if (secret !== null) req.set(header, secret);
  for (const [k, v] of Object.entries(extra)) req.set(k, v);
  return req.send(typeof body === 'string' ? body : JSON.stringify(body));
}

beforeEach(() => {
  process.env.DYNAMICS_WEBHOOK_SECRET = SECRET;
  delete process.env.DYNAMICS_WEBHOOK_HEADER;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
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
    expect(verifyDynamicsSecret(undefined)).toBe(false);
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
    const ctx = context('Update');
    delete ctx.InputParameters;
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
    const res = await send(context(name));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts an unknown message and acknowledges it', async () => {
    const res = await send(context('Assign'));
    expect(res.status).toBe(200);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Assign'));
  });

  it('accepts a payload with InputParameters removed (size exceeded)', async () => {
    const ctx = context('Update');
    delete ctx.InputParameters;
    const res = await send(ctx, { extra: { 'x-ms-dynamics-msg-size-exceeded': 'true' } });
    expect(res.status).toBe(200);
  });

  it('matches the header name case-insensitively', async () => {
    const res = await send(context('Create'), { header: 'x-webhook-secret' });
    expect(res.status).toBe(200);
  });

  it('honours DYNAMICS_WEBHOOK_HEADER', async () => {
    process.env.DYNAMICS_WEBHOOK_HEADER = 'X-Dynamics-Key';
    expect((await send(context('Create'), { header: 'X-Dynamics-Key' })).status).toBe(200);
    expect((await send(context('Create'))).status).toBe(401);
  });

  it('accepts a body with a non-JSON content type', async () => {
    const res = await send(context('Create'), { contentType: 'text/plain' });
    expect(res.status).toBe(200);
  });

  it('rejects a missing secret header with 401', async () => {
    const res = await send(context('Create'), { secret: null });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong secret with 401', async () => {
    const res = await send(context('Create'), { secret: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('checks the secret before parsing the body', async () => {
    const res = await send('not json', { secret: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('returns 500 (fail closed) when the secret is not configured', async () => {
    delete process.env.DYNAMICS_WEBHOOK_SECRET;
    const res = await send(context('Create'));
    expect(res.status).toBe(500);
  });

  it('rejects invalid JSON with 400', async () => {
    const res = await send('{not json');
    expect(res.status).toBe(400);
  });

  it('rejects a body without MessageName with 400', async () => {
    const res = await send({ PrimaryEntityName: 'contact' });
    expect(res.status).toBe(400);
  });

  it('tolerates malformed InputParameters', async () => {
    const res = await send(context('Create', { InputParameters: 'broken', PrimaryEntityName: null }));
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

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
