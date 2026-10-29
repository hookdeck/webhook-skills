const request = require('supertest');

// Set test environment variables before importing the app
process.env.BETTER_STACK_WEBHOOK_HEADER = 'X-Better-Stack-Secret';
process.env.BETTER_STACK_WEBHOOK_SECRET = 'test_better_stack_secret_0123456789';
process.env.BETTER_STACK_WEBHOOK_USERNAME = 'betterstack';
process.env.BETTER_STACK_WEBHOOK_PASSWORD = 'pa:ss_word_0123456789';

const app = require('../src/index');
const { verifyBetterStackRequest, classifyBetterStackPayload } = require('../src/index');

const PATH = '/webhooks/better-stack';
const SECRET = process.env.BETTER_STACK_WEBHOOK_SECRET;
const USER = process.env.BETTER_STACK_WEBHOOK_USERNAME;
const PASS = process.env.BETTER_STACK_WEBHOOK_PASSWORD;
const HEADER_AUTH = { 'X-Better-Stack-Secret': SECRET };
const basic = (u, p) => `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;
const BASIC_AUTH = { Authorization: basic(USER, PASS) };

// The API page's "Example incident_change payload when event is comment", verbatim.
const COMMENT = {
  event: 'comment',
  data: {
    id: '1',
    type: 'incident',
    attributes: {
      name: 'Tesla.com homepage',
      url: 'https://tesla.com',
      http_method: 'get',
      cause: 'Error 500',
      started_at: '2020-10-21T10:51:28.151Z',
      acknowledged_at: '2020-02-25T17:38:45.768Z',
      resolved_at: null,
      response_content: null,
      response_url: null,
      screenshot_url: null,
    },
    relationships: { monitor: { data: { id: '4', type: 'monitor' } } },
  },
  comment: {
    id: '42',
    type: 'incident_comment',
    attributes: {
      content: 'Investigating — the database has been failing over.',
      created_at: '2020-10-21T10:55:12.812Z',
      updated_at: '2020-10-21T10:55:12.812Z',
      user_id: 7,
      user_email: 'jane@example.com',
    },
  },
};

// Default incident_change template rendered with plausible values.
const incident = (attrs = {}) => ({
  data: {
    id: '1',
    type: 'incident',
    attributes: {
      name: 'Tesla.com homepage',
      url: 'https://tesla.com',
      http_method: 'get',
      cause: 'Error 500',
      started_at: '2026-10-26T10:51:28.151Z',
      acknowledged_at: '',
      resolved_at: '',
      response_content: '',
      response_url: '',
      screenshot_url: '',
      ...attrs,
    },
  },
});

// Default monitor_change template rendered with plausible values.
const monitor = (paused_at = '') => ({
  data: {
    id: '4',
    type: 'monitor',
    attributes: {
      url: 'https://tesla.com',
      pronounceable_name: 'Tesla.com homepage',
      monitor_type: 'status',
      required_keyword: '',
      verify_ssl: true,
      check_frequency: 180,
      call: false,
      sms: false,
      email: true,
      team_wait: '',
      http_method: 'get',
      request_timeout: '15',
      recovery_period: '180',
      request_body: '',
      paused_at,
      last_checked_at: '2026-10-26T10:50:00.000Z',
    },
  },
});

// Default on_call_change template rendered with plausible values.
const onCall = (change = 'on_call') => ({
  data: {
    message: 'Jane Doe is now on call',
    emails: ['jane@example.com'],
    on_holiday_emails: [],
    change,
    calendar_id: 12,
    calendar_name: 'Primary on-call',
    primary_calendar: true,
  },
});

const send = (method, headers = HEADER_AUTH, body) => {
  let req = request(app)[method](PATH).set(headers);
  if (body !== undefined) {
    req = req.set('Content-Type', 'application/json').send(typeof body === 'string' ? body : JSON.stringify(body));
  }
  return req;
};

describe('Better Stack webhook endpoint', () => {
  let logSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => logSpy.mockRestore());

  describe('custom header verification', () => {
    it('accepts the correct header value', async () => {
      const res = await send('post', HEADER_AUTH, incident());
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('finds the header case-insensitively', async () => {
      const res = await send('post', { 'x-better-stack-secret': SECRET }, incident());
      expect(res.status).toBe(200);
    });

    it('rejects a wrong value', async () => {
      const res = await send('post', { 'X-Better-Stack-Secret': 'wrong' }, incident());
      expect(res.status).toBe(401);
    });

    it('rejects a value with a longer or shorter length', async () => {
      expect((await send('post', { 'X-Better-Stack-Secret': SECRET + 'x' }, incident())).status).toBe(401);
      expect((await send('post', { 'X-Better-Stack-Secret': SECRET.slice(1) }, incident())).status).toBe(401);
    });

    it('does not strip prefixes or trim', async () => {
      expect((await send('post', { 'X-Better-Stack-Secret': `Bearer ${SECRET}` }, incident())).status).toBe(401);
      // (HTTP parsers strip leading/trailing spaces themselves, so test the function directly.)
      const env = { BETTER_STACK_WEBHOOK_SECRET: SECRET };
      expect(verifyBetterStackRequest({ 'x-better-stack-secret': ` ${SECRET}` }, env)).toBe(false);
      expect(verifyBetterStackRequest({ 'x-better-stack-secret': `${SECRET}\n` }, env)).toBe(false);
    });

    it('rejects a missing header', async () => {
      const res = await send('post', {}, incident());
      expect(res.status).toBe(401);
    });
  });

  describe('Basic auth verification', () => {
    it('accepts the correct username and password', async () => {
      const res = await send('post', BASIC_AUTH, incident());
      expect(res.status).toBe(200);
    });

    it('accepts a password that contains a colon', async () => {
      expect(PASS).toContain(':');
      const res = await send('post', { Authorization: basic(USER, PASS) }, incident());
      expect(res.status).toBe(200);
    });

    it('accepts the scheme in any case', async () => {
      const res = await send('post', { Authorization: basic(USER, PASS).replace('Basic', 'BASIC') }, incident());
      expect(res.status).toBe(200);
    });

    it('rejects a wrong username', async () => {
      expect((await send('post', { Authorization: basic('other', PASS) }, incident())).status).toBe(401);
    });

    it('rejects a wrong password', async () => {
      expect((await send('post', { Authorization: basic(USER, 'wrong') }, incident())).status).toBe(401);
    });

    it('rejects another scheme', async () => {
      const res = await send('post', { Authorization: `Bearer ${SECRET}` }, incident());
      expect(res.status).toBe(401);
    });

    it('rejects malformed base64 and a value without a colon', async () => {
      const noColon = `Basic ${Buffer.from('nocolon').toString('base64')}`;
      expect((await send('post', { Authorization: 'Basic !!!notbase64' }, incident())).status).toBe(401);
      expect((await send('post', { Authorization: `${basic(USER, PASS)}!!` }, incident())).status).toBe(401);
      expect((await send('post', { Authorization: noColon }, incident())).status).toBe(401);
    });
  });

  describe('verifyBetterStackRequest()', () => {
    const h = (o) => o;

    it('accepts a request that passes either configured method', () => {
      const env = {
        BETTER_STACK_WEBHOOK_SECRET: 's3cret',
        BETTER_STACK_WEBHOOK_USERNAME: 'u',
        BETTER_STACK_WEBHOOK_PASSWORD: 'p',
      };
      expect(verifyBetterStackRequest(h({ 'x-better-stack-secret': 's3cret' }), env)).toBe(true);
      expect(verifyBetterStackRequest(h({ authorization: basic('u', 'p') }), env)).toBe(true);
      expect(verifyBetterStackRequest(h({ 'x-better-stack-secret': 'nope' }), env)).toBe(false);
    });

    it('fails closed when nothing is configured', () => {
      expect(verifyBetterStackRequest(h({ 'x-better-stack-secret': '' }), {})).toBe(false);
      expect(verifyBetterStackRequest(h({ authorization: basic('', '') }), {})).toBe(false);
    });

    it('never uses a method that is not configured', () => {
      // Only the header is configured: a correct Basic header must not pass.
      const env = { BETTER_STACK_WEBHOOK_SECRET: 's3cret' };
      expect(verifyBetterStackRequest(h({ authorization: basic('u', 'p') }), env)).toBe(false);
      // Only Basic is configured: the custom header must not pass.
      const onlyBasic = { BETTER_STACK_WEBHOOK_USERNAME: 'u', BETTER_STACK_WEBHOOK_PASSWORD: 'p' };
      expect(verifyBetterStackRequest(h({ 'x-better-stack-secret': 's3cret' }), onlyBasic)).toBe(false);
    });

    it('honours a custom header name', () => {
      const env = { BETTER_STACK_WEBHOOK_HEADER: 'X-Hook-Key', BETTER_STACK_WEBHOOK_SECRET: 's3cret' };
      expect(verifyBetterStackRequest(h({ 'x-hook-key': 's3cret' }), env)).toBe(true);
      expect(verifyBetterStackRequest(h({ 'x-better-stack-secret': 's3cret' }), env)).toBe(false);
    });

    it('handles non-ASCII secrets without throwing', () => {
      const env = { BETTER_STACK_WEBHOOK_SECRET: 'sécret' };
      expect(verifyBetterStackRequest(h({ 'x-better-stack-secret': Buffer.from('sécret').toString('latin1') }), env)).toBe(true);
      expect(verifyBetterStackRequest(h({ 'x-better-stack-secret': 'secret' }), env)).toBe(false);
    });
  });

  describe('HTTP methods', () => {
    it.each(['get', 'head', 'post', 'put', 'patch', 'options'])('checks the credential first on %s', async (method) => {
      const res = await send(method, {}, undefined);
      expect(res.status).toBe(401);
    });

    it.each(['get', 'head', 'options'])('acknowledges an authenticated %s with no body', async (method) => {
      const res = await send(method);
      expect(res.status).toBe(200);
    });

    it.each(['put', 'patch'])('handles an authenticated %s with a body', async (method) => {
      const res = await send(method, HEADER_AUTH, incident({ resolved_at: '2026-10-26T11:00:00.000Z' }));
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('resolved'));
    });

    it('acknowledges an authenticated POST with an empty body', async () => {
      const res = await request(app).post(PATH).set(HEADER_AUTH);
      expect(res.status).toBe(200);
    });
  });

  describe('body handling', () => {
    it('acknowledges a non-JSON body (custom body_template)', async () => {
      const res = await request(app)
        .post(PATH)
        .set(HEADER_AUTH)
        .set('Content-Type', 'text/plain')
        .send('Incident 1 started on Tesla.com');
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Received a non-JSON body:', expect.any(String));
    });

    it('accepts a JSON body under any content type', async () => {
      const res = await request(app)
        .post(PATH)
        .set(HEADER_AUTH)
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(JSON.stringify(incident()));
      expect(res.status).toBe(200);
    });

    it('does not parse the body before authenticating', async () => {
      const res = await request(app).post(PATH).set('Content-Type', 'application/json').send('{not json');
      expect(res.status).toBe(401);
    });

    it('acknowledges JSON that is not an object', async () => {
      for (const body of ['[1,2]', '"text"', '42', 'null']) {
        const res = await send('post', HEADER_AUTH, body);
        expect(res.status).toBe(200);
      }
    });

    it('survives wrong-typed fields', async () => {
      const bodies = [
        { data: 'nope' },
        { data: null },
        { data: { type: 'incident', attributes: 'x', id: {} } },
        { event: 'comment', data: { type: 'incident' }, comment: 'x' },
        { event: 'comment', data: { type: 'incident' }, comment: { attributes: [] } },
        { data: { type: 'monitor', attributes: { paused_at: 5, pronounceable_name: [] } } },
        { data: { change: 'on_call', emails: 'a@b.c', on_holiday_emails: [1, null, 'x@y.z'] } },
      ];
      for (const body of bodies) {
        const res = await send('post', HEADER_AUTH, body);
        expect(res.status).toBe(200);
      }
    });
  });

  describe('event dispatch', () => {
    it('handles an incident comment', async () => {
      const res = await send('post', HEADER_AUTH, COMMENT);
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('comment by jane@example.com'));
    });

    it('handles an incident start, acknowledgement and resolution', async () => {
      await send('post', HEADER_AUTH, incident());
      await send('post', HEADER_AUTH, incident({ acknowledged_at: '2026-10-26T10:55:00.000Z' }));
      await send('post', HEADER_AUTH, incident({ acknowledged_at: '2026-10-26T10:55:00.000Z', resolved_at: '2026-10-26T11:00:00.000Z' }));
      const lines = logSpy.mock.calls.map((c) => String(c[0]));
      expect(lines.some((l) => l.includes('started'))).toBe(true);
      expect(lines.some((l) => l.includes('acknowledged'))).toBe(true);
      expect(lines.some((l) => l.includes('resolved'))).toBe(true);
    });

    it('handles a monitor change and a paused monitor', async () => {
      expect((await send('post', HEADER_AUTH, monitor())).status).toBe(200);
      expect((await send('post', HEADER_AUTH, monitor('2026-10-26T10:00:00.000Z'))).status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('paused'));
    });

    it('handles an on-call change and a holiday change', async () => {
      expect((await send('post', HEADER_AUTH, onCall())).status).toBe(200);
      expect((await send('post', HEADER_AUTH, onCall('holiday'))).status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('holiday change'));
    });

    it('logs a payload it does not recognise', async () => {
      const res = await send('post', HEADER_AUTH, { custom: true });
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Unrecognised'));
    });
  });

  describe('classifyBetterStackPayload()', () => {
    it('classifies each documented shape', () => {
      expect(classifyBetterStackPayload(COMMENT)).toMatchObject({ kind: 'incident', state: 'comment', author: 'jane@example.com' });
      expect(classifyBetterStackPayload(incident())).toMatchObject({ kind: 'incident', state: 'started' });
      expect(classifyBetterStackPayload(incident({ acknowledged_at: 'x' }))).toMatchObject({ state: 'acknowledged' });
      expect(classifyBetterStackPayload(incident({ acknowledged_at: 'x', resolved_at: 'y' }))).toMatchObject({ state: 'resolved' });
      expect(classifyBetterStackPayload(monitor())).toMatchObject({ kind: 'monitor', state: 'changed' });
      expect(classifyBetterStackPayload(monitor('x'))).toMatchObject({ kind: 'monitor', state: 'paused' });
      expect(classifyBetterStackPayload(onCall())).toMatchObject({ kind: 'on_call', change: 'on_call', emails: ['jane@example.com'] });
      expect(classifyBetterStackPayload(onCall('holiday'))).toMatchObject({ kind: 'on_call', change: 'holiday' });
    });

    it('returns unknown for anything else', () => {
      for (const v of [null, undefined, 1, 'x', [], {}, { data: { type: 'other' } }, { data: { change: 'mystery' } }]) {
        expect(classifyBetterStackPayload(v)).toEqual({ kind: 'unknown' });
      }
    });
  });

  it('serves /health without credentials', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
