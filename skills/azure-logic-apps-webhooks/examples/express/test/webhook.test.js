// Generated with: azure-logic-apps-webhooks skill
// https://github.com/hookdeck/webhook-skills

const request = require('supertest');

// Logic Apps Basic authentication sends base64("username:password") in the
// Authorization header. These are test credentials, not real ones.
const USERNAME = 'logicapps';
const PASSWORD = 'p@ss:word-with-colon';
const SHARED_SECRET = 'la_shared_secret_0123456789abcdef';

function basicHeader(username, password) {
  return 'Basic ' + Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
}

function setEnv(env) {
  for (const key of [
    'AZURE_LOGIC_APPS_USERNAME',
    'AZURE_LOGIC_APPS_PASSWORD',
    'AZURE_LOGIC_APPS_SHARED_SECRET',
    'AZURE_LOGIC_APPS_SECRET_HEADER',
  ]) {
    delete process.env[key];
  }
  Object.assign(process.env, env);
}

const { app, verifyBasicAuth, verifySharedSecret } = require('../src/index');

// A typical body from an HTTP action that forwards trigger output.
const PAYLOAD = {
  orderId: 'ORD-1001',
  status: 'approved',
  runId: '08584123456789012345678901234CU00',
};

describe('verifyBasicAuth', () => {
  it('accepts matching credentials', () => {
    expect(verifyBasicAuth(basicHeader(USERNAME, PASSWORD), USERNAME, PASSWORD)).toBe(true);
  });

  it('splits on the first colon so passwords may contain colons', () => {
    expect(verifyBasicAuth(basicHeader('u', 'a:b:c'), 'u', 'a:b:c')).toBe(true);
  });

  it('accepts a lowercase scheme', () => {
    const header = basicHeader(USERNAME, PASSWORD).replace('Basic', 'basic');
    expect(verifyBasicAuth(header, USERNAME, PASSWORD)).toBe(true);
  });

  it('rejects a wrong password', () => {
    expect(verifyBasicAuth(basicHeader(USERNAME, 'nope'), USERNAME, PASSWORD)).toBe(false);
  });

  it('rejects a wrong username', () => {
    expect(verifyBasicAuth(basicHeader('admin', PASSWORD), USERNAME, PASSWORD)).toBe(false);
  });

  it('rejects other schemes and garbage', () => {
    expect(verifyBasicAuth(`Bearer ${PASSWORD}`, USERNAME, PASSWORD)).toBe(false);
    expect(verifyBasicAuth('Basic', USERNAME, PASSWORD)).toBe(false);
    expect(verifyBasicAuth('Basic bm9jb2xvbg==', USERNAME, PASSWORD)).toBe(false); // "nocolon"
    expect(verifyBasicAuth(undefined, USERNAME, PASSWORD)).toBe(false);
  });
});

describe('verifySharedSecret', () => {
  it('accepts the exact secret', () => {
    expect(verifySharedSecret(SHARED_SECRET, SHARED_SECRET)).toBe(true);
  });

  it('rejects a different or differently sized secret without throwing', () => {
    expect(verifySharedSecret('short', SHARED_SECRET)).toBe(false);
    expect(verifySharedSecret(SHARED_SECRET + 'x', SHARED_SECRET)).toBe(false);
    expect(verifySharedSecret('', SHARED_SECRET)).toBe(false);
  });
});

describe('POST /webhooks/azure-logic-apps with Basic authentication', () => {
  beforeEach(() => {
    setEnv({ AZURE_LOGIC_APPS_USERNAME: USERNAME, AZURE_LOGIC_APPS_PASSWORD: PASSWORD });
  });

  it('returns 200 for valid credentials and a JSON body', async () => {
    const res = await request(app)
      .post('/webhooks/azure-logic-apps')
      .set('Authorization', basicHeader(USERNAME, PASSWORD))
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(PAYLOAD));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('returns 401 with WWW-Authenticate when the header is missing', async () => {
    const res = await request(app)
      .post('/webhooks/azure-logic-apps')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(PAYLOAD));
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toMatch(/^Basic/);
  });

  it('returns 401 for a wrong password', async () => {
    const res = await request(app)
      .post('/webhooks/azure-logic-apps')
      .set('Authorization', basicHeader(USERNAME, 'wrong'))
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(PAYLOAD));
    expect(res.status).toBe(401);
  });

  it('returns 400 for an authenticated but malformed JSON body', async () => {
    const res = await request(app)
      .post('/webhooks/azure-logic-apps')
      .set('Authorization', basicHeader(USERNAME, PASSWORD))
      .set('Content-Type', 'application/json')
      .send('{"orderId":');
    expect(res.status).toBe(400);
  });

  it('accepts non-JSON bodies (Logic Apps sends whatever the action Body is)', async () => {
    const res = await request(app)
      .post('/webhooks/azure-logic-apps')
      .set('Authorization', basicHeader(USERNAME, PASSWORD))
      .set('Content-Type', 'text/plain')
      .send('plain text from a Compose action');
    expect(res.status).toBe(200);
  });
});

describe('POST /webhooks/azure-logic-apps with a shared-secret header', () => {
  it('accepts the secret in the default x-logic-apps-secret header', async () => {
    setEnv({ AZURE_LOGIC_APPS_SHARED_SECRET: SHARED_SECRET });
    const res = await request(app)
      .post('/webhooks/azure-logic-apps')
      .set('X-Logic-Apps-Secret', SHARED_SECRET)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(PAYLOAD));
    expect(res.status).toBe(200);
  });

  it('rejects a wrong secret', async () => {
    setEnv({ AZURE_LOGIC_APPS_SHARED_SECRET: SHARED_SECRET });
    const res = await request(app)
      .post('/webhooks/azure-logic-apps')
      .set('X-Logic-Apps-Secret', 'wrong')
      .send(JSON.stringify(PAYLOAD));
    expect(res.status).toBe(401);
  });

  it('supports Raw authentication via the Authorization header', async () => {
    // Raw auth "Value" is sent verbatim as the Authorization header.
    const rawValue = `Bearer ${SHARED_SECRET}`;
    setEnv({
      AZURE_LOGIC_APPS_SHARED_SECRET: rawValue,
      AZURE_LOGIC_APPS_SECRET_HEADER: 'Authorization',
    });
    const ok = await request(app)
      .post('/webhooks/azure-logic-apps')
      .set('Authorization', rawValue)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(PAYLOAD));
    expect(ok.status).toBe(200);

    const bad = await request(app)
      .post('/webhooks/azure-logic-apps')
      .set('Authorization', SHARED_SECRET) // missing the "Bearer " the Value included
      .send(JSON.stringify(PAYLOAD));
    expect(bad.status).toBe(401);
  });
});

describe('both methods configured', () => {
  beforeEach(() => {
    setEnv({
      AZURE_LOGIC_APPS_USERNAME: USERNAME,
      AZURE_LOGIC_APPS_PASSWORD: PASSWORD,
      AZURE_LOGIC_APPS_SHARED_SECRET: SHARED_SECRET,
    });
  });

  it('requires both to pass', async () => {
    const basicOnly = await request(app)
      .post('/webhooks/azure-logic-apps')
      .set('Authorization', basicHeader(USERNAME, PASSWORD))
      .send(JSON.stringify(PAYLOAD));
    expect(basicOnly.status).toBe(401);

    const both = await request(app)
      .post('/webhooks/azure-logic-apps')
      .set('Authorization', basicHeader(USERNAME, PASSWORD))
      .set('X-Logic-Apps-Secret', SHARED_SECRET)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(PAYLOAD));
    expect(both.status).toBe(200);
  });
});

describe('nothing configured', () => {
  it('fails closed with 500', async () => {
    setEnv({});
    const res = await request(app)
      .post('/webhooks/azure-logic-apps')
      .set('Authorization', basicHeader(USERNAME, PASSWORD))
      .send(JSON.stringify(PAYLOAD));
    expect(res.status).toBe(500);
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
