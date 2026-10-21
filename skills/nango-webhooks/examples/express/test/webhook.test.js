const request = require('supertest');
const crypto = require('crypto');

// Nango signing keys are UUID-style strings used as-is (UTF-8) as the HMAC key
const SIGNING_KEY = '6f1c2a4e-8b3d-4f5a-9c7e-1d2b3a4c5e6f';
const API_KEY = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'; // different from the signing key
process.env.NANGO_WEBHOOK_SIGNING_KEY = SIGNING_KEY;
process.env.NANGO_API_KEY = API_KEY;

const app = require('../src/index');

// Same algorithm as Nango: hex HMAC-SHA256 of the raw body
function sign(payload, key = SIGNING_KEY) {
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function post(payload, headers = {}) {
  let req = request(app).post('/webhooks/nango').set('Content-Type', 'application/json');
  for (const [name, value] of Object.entries(headers)) req = req.set(name, value);
  return req.send(payload);
}

function signedPost(body) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  return post(payload, { 'X-Nango-Hmac-Sha256': sign(payload) });
}

const tags = {
  end_user_id: 'user-123',
  end_user_email: 'user@example.com',
  organization_id: 'org-456',
};

const authCreation = {
  from: 'nango',
  type: 'auth',
  operation: 'creation',
  connectionId: 'conn-abc',
  authMode: 'OAUTH2',
  providerConfigKey: 'hubspot',
  provider: 'hubspot',
  environment: 'DEV',
  success: true,
  tags,
};

const authRefreshFailed = {
  ...authCreation,
  operation: 'refresh',
  success: false,
  error: { type: 'refresh_token_external_error', description: 'invalid_grant' },
};

const syncSuccess = {
  from: 'nango',
  type: 'sync',
  connectionId: 'conn-abc',
  providerConfigKey: 'hubspot',
  syncName: 'contacts',
  syncVariant: 'base',
  model: 'Contact',
  syncType: 'INCREMENTAL',
  success: true,
  modifiedAfter: '2026-10-21T09:00:00.000Z',
  responseResults: { added: 3, updated: 1, deleted: 0 },
  checkpoints: { from: null, to: { cursor: 'abc' } },
};

const syncFailure = {
  from: 'nango',
  type: 'sync',
  connectionId: 'conn-abc',
  providerConfigKey: 'hubspot',
  syncName: 'contacts',
  syncVariant: 'base',
  model: 'Contact',
  syncType: 'INCREMENTAL',
  success: false,
  error: { type: 'script_error', description: 'boom' },
  startedAt: '2026-10-21T09:00:00.000Z',
  failedAt: '2026-10-21T09:00:05.000Z',
};

const forward = {
  from: 'hubspot',
  providerConfigKey: 'hubspot',
  type: 'forward',
  connectionId: 'conn-abc',
  payload: [{ subscriptionType: 'contact.creation', objectId: 123 }],
};

describe('POST /webhooks/nango', () => {
  let logSpy;
  let errorSpy;
  let warnSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('signature verification', () => {
    it('accepts a valid signature', async () => {
      const res = await signedPost(authCreation);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('rejects a missing X-Nango-Hmac-Sha256 header', async () => {
      const res = await post(JSON.stringify(authCreation));
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing/);
    });

    it('rejects an invalid signature', async () => {
      const res = await post(JSON.stringify(authCreation), { 'X-Nango-Hmac-Sha256': 'a'.repeat(64) });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid signature');
    });

    it('rejects a signature of the wrong length', async () => {
      const res = await post(JSON.stringify(authCreation), { 'X-Nango-Hmac-Sha256': 'deadbeef' });
      expect(res.status).toBe(400);
    });

    it('rejects a tampered body', async () => {
      const payload = JSON.stringify(authCreation);
      const tampered = payload.replace('conn-abc', 'conn-evil');
      const res = await post(tampered, { 'X-Nango-Hmac-Sha256': sign(payload) });
      expect(res.status).toBe(400);
    });

    it('rejects a signature made with the API key instead of the signing key', async () => {
      const payload = JSON.stringify(authCreation);
      const res = await post(payload, { 'X-Nango-Hmac-Sha256': sign(payload, API_KEY) });
      expect(res.status).toBe(400);
    });

    it('rejects a request carrying only the legacy X-Nango-Signature header', async () => {
      const payload = JSON.stringify(authCreation);
      const legacy = crypto.createHash('sha256').update(`${SIGNING_KEY}${payload}`).digest('hex');
      const res = await post(payload, { 'X-Nango-Signature': legacy });
      expect(res.status).toBe(400);
    });

    it('verifies the raw body byte-for-byte (whitespace matters)', async () => {
      const payload = JSON.stringify(authCreation, null, 2);
      const res = await post(payload, { 'X-Nango-Hmac-Sha256': sign(payload) });
      expect(res.status).toBe(200);

      const reserialised = await post(JSON.stringify(authCreation), { 'X-Nango-Hmac-Sha256': sign(payload) });
      expect(reserialised.status).toBe(400);
    });

    it('returns 400 for a correctly signed body that is not JSON', async () => {
      const res = await signedPost('not json');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid JSON payload');
    });
  });

  describe('webhook types', () => {
    it('handles auth creation', async () => {
      const res = await signedPost(authCreation);
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Connection created: conn-abc'), tags);
    });

    it.each(['override', 'deletion'])('handles auth %s', async (operation) => {
      const res = await signedPost({ ...authCreation, operation });
      expect(res.status).toBe(200);
    });

    it('handles auth refresh failure', async () => {
      const res = await signedPost(authRefreshFailed);
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Token refresh failed'), authRefreshFailed.error);
    });

    it('handles auth refresh recovery', async () => {
      const res = await signedPost({ ...authCreation, operation: 'refresh', success: true });
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('recovered'));
    });

    it('handles a successful sync as a full sync when checkpoints.from is null', async () => {
      const res = await signedPost(syncSuccess);
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Sync contacts (Contact) succeeded'),
        expect.objectContaining({ isFullSync: true })
      );
    });

    it('handles a successful sync without checkpoints', async () => {
      const { checkpoints, ...noCheckpoints } = syncSuccess;
      const res = await signedPost(noCheckpoints);
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ isFullSync: true }));
    });

    it('handles an incremental sync', async () => {
      const res = await signedPost({ ...syncSuccess, checkpoints: { from: { cursor: 'a' }, to: { cursor: 'b' } } });
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ isFullSync: false }));
    });

    it('handles a failed sync', async () => {
      const res = await signedPost(syncFailure);
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('failed'), syncFailure.error);
    });

    it('handles a forwarded webhook', async () => {
      const res = await signedPost(forward);
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Forwarded hubspot webhook for connection conn-abc'));
    });

    it('flags an unverified forward', async () => {
      const res = await signedPost({ ...forward, unverified: true });
      expect(res.status).toBe(200);
      expect(warnSpy).toHaveBeenCalledWith('Unverified forward from hubspot');
    });

    it('handles async_action', async () => {
      const res = await signedPost({
        from: 'nango',
        type: 'async_action',
        connectionId: 'conn-abc',
        providerConfigKey: 'hubspot',
        payload: { id: 'action-1', statusUrl: '/action/action-1' },
      });
      expect(res.status).toBe(200);
    });

    it('acknowledges unknown types', async () => {
      const res = await signedPost({ from: 'nango', type: 'some_future_type' });
      expect(res.status).toBe(200);
    });

    it('acknowledges an unattributed raw forwarded payload', async () => {
      const res = await signedPost([{ subscriptionType: 'contact.creation', objectId: 1 }]);
      expect(res.status).toBe(200);
    });
  });

  it('returns 500 when the signing key is not configured', async () => {
    const saved = process.env.NANGO_WEBHOOK_SIGNING_KEY;
    delete process.env.NANGO_WEBHOOK_SIGNING_KEY;
    try {
      const res = await signedPost(authCreation);
      expect(res.status).toBe(500);
    } finally {
      process.env.NANGO_WEBHOOK_SIGNING_KEY = saved;
    }
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
