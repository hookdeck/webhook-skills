// Generated with: azure-logic-apps-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { POST, verifyBasicAuth, verifySharedSecret } from '../app/webhooks/azure-logic-apps/route';

// Logic Apps Basic authentication sends base64("username:password") in the
// Authorization header. These are test credentials, not real ones.
const USERNAME = 'logicapps';
const PASSWORD = 'p@ss:word-with-colon';
const SHARED_SECRET = 'la_shared_secret_0123456789abcdef';
const URL = 'http://localhost:3000/webhooks/azure-logic-apps';

const PAYLOAD = {
  orderId: 'ORD-1001',
  status: 'approved',
  runId: '08584123456789012345678901234CU00',
};

const ENV_KEYS = [
  'AZURE_LOGIC_APPS_USERNAME',
  'AZURE_LOGIC_APPS_PASSWORD',
  'AZURE_LOGIC_APPS_SHARED_SECRET',
  'AZURE_LOGIC_APPS_SECRET_HEADER',
];

function setEnv(env: Record<string, string>) {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, env);
}

function basicHeader(username: string, password: string): string {
  return 'Basic ' + Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
}

function makeRequest(headers: Record<string, string>, body: string = JSON.stringify(PAYLOAD)) {
  return new NextRequest(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('verifyBasicAuth', () => {
  it('accepts matching credentials', () => {
    expect(verifyBasicAuth(basicHeader(USERNAME, PASSWORD), USERNAME, PASSWORD)).toBe(true);
  });

  it('splits on the first colon so passwords may contain colons', () => {
    expect(verifyBasicAuth(basicHeader('u', 'a:b:c'), 'u', 'a:b:c')).toBe(true);
  });

  it('rejects wrong credentials, other schemes and garbage', () => {
    expect(verifyBasicAuth(basicHeader(USERNAME, 'nope'), USERNAME, PASSWORD)).toBe(false);
    expect(verifyBasicAuth(basicHeader('admin', PASSWORD), USERNAME, PASSWORD)).toBe(false);
    expect(verifyBasicAuth(`Bearer ${PASSWORD}`, USERNAME, PASSWORD)).toBe(false);
    expect(verifyBasicAuth('Basic bm9jb2xvbg==', USERNAME, PASSWORD)).toBe(false); // "nocolon"
    expect(verifyBasicAuth(null, USERNAME, PASSWORD)).toBe(false);
  });
});

describe('verifySharedSecret', () => {
  it('accepts the exact secret and rejects others without throwing', () => {
    expect(verifySharedSecret(SHARED_SECRET, SHARED_SECRET)).toBe(true);
    expect(verifySharedSecret('short', SHARED_SECRET)).toBe(false);
    expect(verifySharedSecret(null, SHARED_SECRET)).toBe(false);
  });
});

describe('POST with Basic authentication', () => {
  beforeEach(() => {
    setEnv({ AZURE_LOGIC_APPS_USERNAME: USERNAME, AZURE_LOGIC_APPS_PASSWORD: PASSWORD });
  });

  it('returns 200 for valid credentials', async () => {
    const res = await POST(makeRequest({ authorization: basicHeader(USERNAME, PASSWORD) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('returns 401 with WWW-Authenticate when the header is missing', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toMatch(/^Basic/);
  });

  it('returns 401 for a wrong password', async () => {
    const res = await POST(makeRequest({ authorization: basicHeader(USERNAME, 'wrong') }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for malformed JSON after authenticating', async () => {
    const res = await POST(
      makeRequest({ authorization: basicHeader(USERNAME, PASSWORD) }, '{"orderId":')
    );
    expect(res.status).toBe(400);
  });

  it('accepts non-JSON bodies', async () => {
    const res = await POST(
      makeRequest(
        { authorization: basicHeader(USERNAME, PASSWORD), 'content-type': 'text/plain' },
        'plain text from a Compose action'
      )
    );
    expect(res.status).toBe(200);
  });
});

describe('POST with a shared-secret header', () => {
  it('accepts the secret in the default x-logic-apps-secret header', async () => {
    setEnv({ AZURE_LOGIC_APPS_SHARED_SECRET: SHARED_SECRET });
    const res = await POST(makeRequest({ 'x-logic-apps-secret': SHARED_SECRET }));
    expect(res.status).toBe(200);
  });

  it('rejects a wrong secret', async () => {
    setEnv({ AZURE_LOGIC_APPS_SHARED_SECRET: SHARED_SECRET });
    const res = await POST(makeRequest({ 'x-logic-apps-secret': 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('supports Raw authentication via the Authorization header', async () => {
    // Raw auth "Value" is sent verbatim as the Authorization header.
    const rawValue = `Bearer ${SHARED_SECRET}`;
    setEnv({
      AZURE_LOGIC_APPS_SHARED_SECRET: rawValue,
      AZURE_LOGIC_APPS_SECRET_HEADER: 'Authorization',
    });
    expect((await POST(makeRequest({ authorization: rawValue }))).status).toBe(200);
    expect((await POST(makeRequest({ authorization: SHARED_SECRET }))).status).toBe(401);
  });
});

describe('both methods configured', () => {
  it('requires both to pass', async () => {
    setEnv({
      AZURE_LOGIC_APPS_USERNAME: USERNAME,
      AZURE_LOGIC_APPS_PASSWORD: PASSWORD,
      AZURE_LOGIC_APPS_SHARED_SECRET: SHARED_SECRET,
    });
    const basicOnly = await POST(makeRequest({ authorization: basicHeader(USERNAME, PASSWORD) }));
    expect(basicOnly.status).toBe(401);

    const both = await POST(
      makeRequest({
        authorization: basicHeader(USERNAME, PASSWORD),
        'x-logic-apps-secret': SHARED_SECRET,
      })
    );
    expect(both.status).toBe(200);
  });
});

describe('nothing configured', () => {
  it('fails closed with 500', async () => {
    setEnv({});
    const res = await POST(makeRequest({ authorization: basicHeader(USERNAME, PASSWORD) }));
    expect(res.status).toBe(500);
  });
});
