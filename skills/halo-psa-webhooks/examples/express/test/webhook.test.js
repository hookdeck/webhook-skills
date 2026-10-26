const request = require('supertest');

// Set test environment variables before importing the app
process.env.HALO_PSA_WEBHOOK_USERNAME = 'halo-webhook';
process.env.HALO_PSA_WEBHOOK_PASSWORD = 'test_halo_password:with:colons';

const app = require('../src/index');
const { verifyHaloPsaRequest, parseBasicAuth } = require('../src/index');

const USER = process.env.HALO_PSA_WEBHOOK_USERNAME;
const PASSWORD = process.env.HALO_PSA_WEBHOOK_PASSWORD;

// Illustrative: Halo's docs don't spell out the property names.
function samplePayload(event = 'New Ticket Logged') {
  return { id: 1, event, object_id: 4021, timestamp: '2026-10-25T10:00:00Z' };
}

function basic(user, password) {
  return 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');
}

function post(body = JSON.stringify(samplePayload()), contentType = 'application/json') {
  return request(app).post('/webhooks/halo-psa').set('Content-Type', contentType).send(body);
}

describe('HaloPSA webhook endpoint', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  describe('Basic authentication', () => {
    it('accepts the correct credentials', async () => {
      const res = await post().set('Authorization', basic(USER, PASSWORD));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('treats the scheme as case-insensitive', async () => {
      const value = basic(USER, PASSWORD).replace('Basic', 'bAsIc');
      const res = await post().set('Authorization', value);
      expect(res.status).toBe(200);
    });

    it('splits on the first colon (password may contain colons)', () => {
      expect(parseBasicAuth(basic('u', 'a:b:c'))).toEqual({ username: 'u', password: 'a:b:c' });
    });

    it('rejects a missing Authorization header', async () => {
      const res = await post();
      expect(res.status).toBe(401);
    });

    it('rejects a wrong password of the same length', async () => {
      const res = await post().set('Authorization', basic(USER, 'x'.repeat(PASSWORD.length)));
      expect(res.status).toBe(401);
    });

    it('rejects a wrong username with the right password', async () => {
      const res = await post().set('Authorization', basic('someone-else', PASSWORD));
      expect(res.status).toBe(401);
    });

    it('rejects a non-Basic scheme', async () => {
      const res = await post().set('Authorization', 'Bearer ' + PASSWORD);
      expect(res.status).toBe(401);
    });

    it('rejects credentials with no colon', async () => {
      const value = 'Basic ' + Buffer.from('halo-webhook').toString('base64');
      const res = await post().set('Authorization', value);
      expect(res.status).toBe(401);
    });

    it('rejects valid credentials followed by junk', async () => {
      const valid = basic(USER, PASSWORD);
      for (const bad of [`${valid}=junk`, `${valid} junk`, `${valid}!!`]) {
        const res = await post().set('Authorization', bad);
        expect(res.status).toBe(401);
      }
    });

    it('rejects characters outside the base64 alphabet', () => {
      expect(parseBasicAuth('Basic ' + 'dXNlcjpwYXNz'.replace('Y', '-'))).toBeNull();
      expect(parseBasicAuth('Basic dXNlcjpwYXNz=')).toBeNull(); // length not a multiple of 4
    });

    it('rejects invalid UTF-8 in the decoded credentials', () => {
      const bytes = Buffer.concat([Buffer.from('user:'), Buffer.from([0xff, 0xfe, 0x41])]);
      expect(parseBasicAuth('Basic ' + bytes.toString('base64'))).toBeNull();
    });

    it('rejects when credentials are not configured', () => {
      expect(verifyHaloPsaRequest({ authorization: basic('a', 'b') }, {})).toBe(false);
      expect(verifyHaloPsaRequest({ authorization: basic('', '') }, {})).toBe(false);
    });

    it('handles non-ASCII credentials', () => {
      const config = { HALO_PSA_WEBHOOK_USERNAME: 'ünï', HALO_PSA_WEBHOOK_PASSWORD: 'pässwörd' };
      expect(verifyHaloPsaRequest({ authorization: basic('ünï', 'pässwörd') }, config)).toBe(true);
      expect(verifyHaloPsaRequest({ authorization: basic('ünï', 'passwörd') }, config)).toBe(false);
    });

    it('authenticates before parsing the body', async () => {
      const res = await post('not json');
      expect(res.status).toBe(401);
    });
  });

  describe('Body handling', () => {
    it('accepts any content type (raw body)', async () => {
      const res = await post(JSON.stringify(samplePayload()), 'text/plain').set(
        'Authorization',
        basic(USER, PASSWORD)
      );
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await post('not json').set('Authorization', basic(USER, PASSWORD));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON scalar', async () => {
      const res = await post('"hello"').set('Authorization', basic(USER, PASSWORD));
      expect(res.status).toBe(400);
    });

    it('accepts a batched delivery (JSON array)', async () => {
      const batch = [samplePayload('New Ticket Logged'), samplePayload('Ticket Reassigned')];
      const res = await post(JSON.stringify(batch)).set('Authorization', basic(USER, PASSWORD));
      expect(res.status).toBe(200);
    });

    it('returns 400 for an array containing non-objects', async () => {
      const res = await post('[1,2]').set('Authorization', basic(USER, PASSWORD));
      expect(res.status).toBe(400);
    });
  });

  describe('Event handling', () => {
    const events = [
      'New Ticket Logged',
      'Ticket Reassigned',
      'Document deleted on a Ticket',
      'Document edited on a Ticket',
    ];

    it.each(events)('handles "%s"', async (event) => {
      const res = await post(JSON.stringify(samplePayload(event))).set(
        'Authorization',
        basic(USER, PASSWORD)
      );
      expect(res.status).toBe(200);
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled event'));
    });

    it('acknowledges unhandled events', async () => {
      const res = await post(JSON.stringify(samplePayload('Something Else'))).set(
        'Authorization',
        basic(USER, PASSWORD)
      );
      expect(res.status).toBe(200);
    });
  });

  it('serves a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
