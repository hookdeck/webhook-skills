// Generated with: appsflyer-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  POST,
  headerName,
  verifyAppsflyerToken,
  eventName,
  idempotencyKey,
} from '../app/webhooks/appsflyer/route';

// AppsFlyer has no signature: the "real credential" is the custom header
// name/value configured in the Push API settings.
const TOKEN = 'af_test_token_9f8e7d6c5b4a';

const INSTALL = {
  event_name: 'install',
  appsflyer_id: '1700000000000-1234567',
  app_id: 'id123456789',
  event_time: '2026-10-21 09:30:00',
  media_source: 'organic',
};
const PURCHASE = {
  ...INSTALL,
  event_name: 'af_purchase',
  event_value: '{"af_revenue":"9.99","af_currency":"USD"}',
};

const ORIGINAL_ENV = { ...process.env };

function send(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest('http://localhost:3000/webhooks/appsflyer', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  process.env.APPSFLYER_AUTH_TOKEN = TOKEN;
  delete process.env.APPSFLYER_AUTH_HEADER_NAME;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe('authorization header', () => {
  test('accepts the correct token in Authorization', async () => {
    const res = await send(INSTALL, { Authorization: TOKEN });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  test('accepts a custom header name, case-insensitively', async () => {
    process.env.APPSFLYER_AUTH_HEADER_NAME = 'X-AF-Token';
    const res = await send(PURCHASE, { 'x-af-token': TOKEN });
    expect(res.status).toBe(200);
  });

  test('rejects the token in the wrong header when a custom name is set', async () => {
    process.env.APPSFLYER_AUTH_HEADER_NAME = 'X-AF-Token';
    const res = await send(INSTALL, { Authorization: TOKEN });
    expect(res.status).toBe(401);
  });

  test('rejects a wrong token', async () => {
    const res = await send(INSTALL, { Authorization: 'wrong-token' });
    expect(res.status).toBe(401);
  });

  test('rejects a token of a different length without throwing', async () => {
    const res = await send(INSTALL, { Authorization: TOKEN + 'x' });
    expect(res.status).toBe(401);
  });

  test('rejects a missing header', async () => {
    const res = await send(INSTALL);
    expect(res.status).toBe(401);
  });

  test('fails closed with 500 when no token is configured', async () => {
    delete process.env.APPSFLYER_AUTH_TOKEN;
    const res = await send(INSTALL, { Authorization: TOKEN });
    expect(res.status).toBe(500);
  });
});

describe('body handling', () => {
  test('returns 400 for invalid JSON after authenticating', async () => {
    const res = await send('not json', { Authorization: TOKEN });
    expect(res.status).toBe(400);
  });

  test('does not parse the body before authenticating', async () => {
    const res = await send('not json', { Authorization: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('accepts an unknown in-app event name', async () => {
    const res = await send({ ...INSTALL, event_name: 'level_up' }, { Authorization: TOKEN });
    expect(res.status).toBe(200);
  });
});

describe('helpers', () => {
  test('verifyAppsflyerToken', () => {
    expect(verifyAppsflyerToken(TOKEN, TOKEN)).toBe(true);
    expect(verifyAppsflyerToken('nope', TOKEN)).toBe(false);
    expect(verifyAppsflyerToken(undefined, TOKEN)).toBe(false);
    expect(verifyAppsflyerToken(TOKEN, undefined)).toBe(false);
  });

  test('headerName defaults to authorization and lowercases', () => {
    expect(headerName({})).toBe('authorization');
    expect(headerName({ APPSFLYER_AUTH_HEADER_NAME: 'X-AF-Token' })).toBe('x-af-token');
  });

  test('eventName reads event_name', () => {
    expect(eventName(INSTALL)).toBe('install');
    expect(eventName(PURCHASE)).toBe('af_purchase');
    expect(eventName({})).toBe('unknown');
  });

  test('idempotencyKey combines id, event and time', () => {
    expect(idempotencyKey(INSTALL)).toBe('1700000000000-1234567|install|2026-10-21 09:30:00');
  });
});
