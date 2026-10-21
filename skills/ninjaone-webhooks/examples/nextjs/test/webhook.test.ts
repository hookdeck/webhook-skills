import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/ninjaone/route';
import { dedupeKey, verifyNinjaOneSecret, type NinjaOneActivity } from '../lib/ninjaone';

// NinjaOne issues no signing secret and signs nothing. The secret is a random value you
// generate (openssl rand -hex 32) and register as the X-Webhook-Secret header value.
const SECRET = 'a7c3e9015b2d48f6aa11bb22cc33dd44ee55ff66778899aabbccddeeff001122';

let counter = 0;
// Activity object with the field names from the NinjaOne API v2 Activity schema.
// Each call gets a fresh id because the route's dedupe Set is shared across tests.
function makeActivity(overrides: Partial<NinjaOneActivity> = {}): NinjaOneActivity {
  counter += 1;
  return {
    id: 2000 + counter,
    activityTime: 1792577730.5,
    deviceId: 42,
    severity: 'MAJOR',
    priority: 'HIGH',
    seriesUid: '6bcedd3a-fe26-4bcb-9ce9-d3850e38d42c',
    activityType: 'CONDITION',
    statusCode: 'TRIGGERED',
    status: 'Triggered',
    subject: 'Disk free space low',
    message: 'C: has less than 10% free space',
    data: {},
    ...overrides,
  };
}

function post(body: unknown, headers: Record<string, string> = { 'X-Webhook-Secret': SECRET }) {
  return POST(
    new NextRequest('http://localhost/webhooks/ninjaone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );
}

describe('verifyNinjaOneSecret', () => {
  it('accepts the exact secret', () => {
    expect(verifyNinjaOneSecret(SECRET, SECRET)).toBe(true);
  });
  it('rejects a wrong secret', () => {
    expect(verifyNinjaOneSecret('nope', SECRET)).toBe(false);
  });
  it('rejects a secret of a different length without throwing', () => {
    expect(verifyNinjaOneSecret(SECRET + 'x', SECRET)).toBe(false);
  });
  it('rejects a missing header', () => {
    expect(verifyNinjaOneSecret(null, SECRET)).toBe(false);
  });
  it('fails closed when no secret is configured', () => {
    expect(verifyNinjaOneSecret('', '')).toBe(false);
    expect(verifyNinjaOneSecret('anything', undefined)).toBe(false);
  });
});

describe('dedupeKey', () => {
  it('combines id and statusCode', () => {
    expect(dedupeKey({ id: 7, activityType: 'CONDITION', statusCode: 'RESET' })).toBe('7:RESET');
  });
  it('returns null without an id', () => {
    expect(dedupeKey({ activityType: 'CONDITION' })).toBeNull();
  });
});

describe('POST /webhooks/ninjaone', () => {
  beforeEach(() => {
    process.env.NINJAONE_WEBHOOK_SECRET = SECRET;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('accepts a CONDITION / TRIGGERED activity', async () => {
    const res = await post(makeActivity());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts a CONDITION / RESET activity', async () => {
    expect((await post(makeActivity({ statusCode: 'RESET' }))).status).toBe(200);
  });

  it('accepts ACTION / COMPLETED and ACTIONSET / STARTED activities', async () => {
    expect((await post(makeActivity({ activityType: 'ACTION', statusCode: 'COMPLETED' }))).status).toBe(200);
    expect((await post(makeActivity({ activityType: 'ACTIONSET', statusCode: 'STARTED' }))).status).toBe(200);
  });

  it('accepts an activity type it does not handle', async () => {
    const res = await post(makeActivity({ activityType: 'SYSTEM', statusCode: 'NODE_CREATED' }));
    expect(res.status).toBe(200);
  });

  it('rejects a missing secret header with 401', async () => {
    expect((await post(makeActivity(), {})).status).toBe(401);
  });

  it('rejects a wrong secret with 401', async () => {
    expect((await post(makeActivity(), { 'X-Webhook-Secret': 'wrong' })).status).toBe(401);
  });

  it('does not accept the secret in a different header', async () => {
    expect((await post(makeActivity(), { Authorization: SECRET })).status).toBe(401);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.NINJAONE_WEBHOOK_SECRET;
    expect((await post(makeActivity())).status).toBe(500);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await post('{not json')).status).toBe(400);
  });

  it('returns 400 when activityType is missing', async () => {
    expect((await post({ id: 1, statusCode: 'TRIGGERED' })).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await post([makeActivity()])).status).toBe(400);
  });

  it('acknowledges a redelivery without processing it twice', async () => {
    const activity = makeActivity();
    expect(await (await post(activity)).json()).toEqual({ received: true });
    expect(await (await post(activity)).json()).toEqual({ received: true, duplicate: true });
  });

  it('treats a new statusCode on the same activity id as a new event', async () => {
    const activity = makeActivity();
    await post(activity);
    const res = await post({ ...activity, statusCode: 'RESET' });
    expect(await res.json()).toEqual({ received: true });
  });
});
