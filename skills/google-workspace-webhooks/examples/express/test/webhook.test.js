const request = require('supertest');

// Set test environment variables before importing app.
// Channel tokens are arbitrary strings up to 256 chars; Google recommends a
// URL-query style encoding like this one.
process.env.GOOGLE_WORKSPACE_CHANNEL_TOKEN = 'target=myApp&secret=test_channel_token_123';

const { app, verifyChannelToken } = require('../src/index');

const TOKEN = process.env.GOOGLE_WORKSPACE_CHANNEL_TOKEN;
const ENDPOINT = '/webhooks/google-workspace';

// Headers Google sends on every notification (see Drive push docs example)
function googHeaders(overrides = {}) {
  return {
    'Content-Type': 'application/json; utf-8',
    'X-Goog-Channel-ID': '4ba78bf0-6a47-11e2-bcfd-0800200c9a66',
    'X-Goog-Channel-Token': TOKEN,
    'X-Goog-Channel-Expiration': 'Tue, 19 Nov 2013 01:13:52 GMT',
    'X-Goog-Resource-ID': 'ret08u3rv24htgh289g',
    'X-Goog-Resource-URI': 'https://www.googleapis.com/drive/v3/files/ret08u3rv24htgh289g',
    'X-Goog-Resource-State': 'update',
    'X-Goog-Message-Number': '11',
    ...overrides,
  };
}

function post(headers) {
  const req = request(app).post(ENDPOINT);
  for (const [k, v] of Object.entries(headers)) {
    if (v !== undefined) req.set(k, v);
  }
  return req;
}

describe('verifyChannelToken', () => {
  it('returns true when the token matches', () => {
    expect(verifyChannelToken(TOKEN, TOKEN)).toBe(true);
  });

  it('returns false when the token does not match', () => {
    expect(verifyChannelToken('target=myApp&secret=wrong_channel_token', TOKEN)).toBe(false);
  });

  it('returns false when the received token is missing', () => {
    expect(verifyChannelToken(undefined, TOKEN)).toBe(false);
  });

  it('returns false when the expected token is missing', () => {
    expect(verifyChannelToken(TOKEN, undefined)).toBe(false);
  });

  it('returns false for different-length values (no throw)', () => {
    expect(verifyChannelToken('short', TOKEN)).toBe(false);
  });
});

describe('POST /webhooks/google-workspace', () => {
  it('answers the sync message with 200', async () => {
    const res = await post(
      googHeaders({ 'X-Goog-Resource-State': 'sync', 'X-Goog-Message-Number': '1' })
    ).send();
    expect(res.status).toBe(200);
  });

  it('accepts a Drive update with X-Goog-Changed and an empty body', async () => {
    const res = await post(
      googHeaders({ 'X-Goog-Changed': 'content,properties', 'Content-Length': '0' })
    ).send();
    expect(res.status).toBe(200);
  });

  it.each(['add', 'remove', 'trash', 'untrash', 'change'])(
    'accepts Drive resource state %s',
    async (state) => {
      const res = await post(googHeaders({ 'X-Goog-Resource-State': state })).send();
      expect(res.status).toBe(200);
    }
  );

  it.each(['exists', 'not_exists'])('accepts Calendar resource state %s', async (state) => {
    const res = await post(
      googHeaders({
        'X-Goog-Resource-State': state,
        'X-Goog-Resource-URI':
          'https://www.googleapis.com/calendar/v3/calendars/my_calendar@gmail.com/events',
      })
    ).send();
    expect(res.status).toBe(200);
  });

  it('accepts an Admin SDK Directory notification with a JSON body', async () => {
    const res = await post(
      googHeaders({
        'X-Goog-Resource-State': 'delete',
        'X-Goog-Resource-URI':
          'https://admin.googleapis.com/admin/directory/v1/users?domain=mydomain.com&event=delete&alt=json',
      })
    ).send(
      JSON.stringify({
        kind: 'admin#directory#user',
        id: '111220860655841818702',
        etag: '"Mf8RAmnABsVfQ47MMT_18MHAdRE/evLIDlz2Fd9zbAqwvIp7Pzq8UAw"',
        primaryEmail: 'user@mydomain.com',
      })
    );
    expect(res.status).toBe(200);
  });

  it('accepts unknown resource states (Google may add new ones)', async () => {
    const res = await post(googHeaders({ 'X-Goog-Resource-State': 'something_new' })).send();
    expect(res.status).toBe(200);
  });

  it('rejects a wrong channel token with 400', async () => {
    const res = await post(
      googHeaders({ 'X-Goog-Channel-Token': 'target=myApp&secret=wrong_channel_token' })
    ).send();
    expect(res.status).toBe(400);
  });

  it('rejects a missing channel token with 400', async () => {
    const res = await post(googHeaders({ 'X-Goog-Channel-Token': undefined })).send();
    expect(res.status).toBe(400);
  });

  it('rejects requests missing X-Goog-Resource-State with 400', async () => {
    const res = await post(googHeaders({ 'X-Goog-Resource-State': undefined })).send();
    expect(res.status).toBe(400);
  });

  it('rejects requests missing X-Goog-Channel-ID with 400', async () => {
    const res = await post(googHeaders({ 'X-Goog-Channel-ID': undefined })).send();
    expect(res.status).toBe(400);
  });

  it('returns 500 when the expected token is not configured', async () => {
    const saved = process.env.GOOGLE_WORKSPACE_CHANNEL_TOKEN;
    delete process.env.GOOGLE_WORKSPACE_CHANNEL_TOKEN;
    try {
      const res = await post(googHeaders()).send();
      expect(res.status).toBe(500);
    } finally {
      process.env.GOOGLE_WORKSPACE_CHANNEL_TOKEN = saved;
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
