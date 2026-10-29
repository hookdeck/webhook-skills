import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, HEAD, POST, PUT, PATCH, OPTIONS } from '../app/webhooks/better-stack/route';
import { verifyBetterStackRequest } from '../lib/verify-better-stack';
import { classifyBetterStackPayload } from '../lib/better-stack-events';

const URL_ = 'http://localhost:3000/webhooks/better-stack';
const SECRET = 'test_better_stack_secret_0123456789';
const USER = 'betterstack';
const PASS = 'pa:ss_word_0123456789';
const basic = (u: string, p: string) => `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;
const HEADER_AUTH = { 'X-Better-Stack-Secret': SECRET };
const BASIC_AUTH = { Authorization: basic(USER, PASS) };

beforeAll(() => {
  process.env.BETTER_STACK_WEBHOOK_HEADER = 'X-Better-Stack-Secret';
  process.env.BETTER_STACK_WEBHOOK_SECRET = SECRET;
  process.env.BETTER_STACK_WEBHOOK_USERNAME = USER;
  process.env.BETTER_STACK_WEBHOOK_PASSWORD = PASS;
});

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
const incident = (attrs: Record<string, unknown> = {}) => ({
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

type Handler = (req: NextRequest) => Promise<Response>;

function call(
  handler: Handler,
  method: string,
  headers: Record<string, string> = HEADER_AUTH,
  body?: unknown
) {
  const init: { method: string; headers: Record<string, string>; body?: string } = { method, headers };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json', ...headers };
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return handler(new NextRequest(URL_, init));
}

const post = (headers?: Record<string, string>, body?: unknown) => call(POST, 'POST', headers, body);

describe('Better Stack webhook endpoint', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => logSpy.mockRestore());

  describe('custom header verification', () => {
    it('accepts the correct header value', async () => {
      const res = await post(HEADER_AUTH, incident());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('finds the header case-insensitively', async () => {
      expect((await post({ 'x-better-stack-secret': SECRET }, incident())).status).toBe(200);
    });

    it('rejects a wrong value, a different length, or a prefixed value', async () => {
      expect((await post({ 'X-Better-Stack-Secret': 'wrong' }, incident())).status).toBe(401);
      expect((await post({ 'X-Better-Stack-Secret': SECRET + 'x' }, incident())).status).toBe(401);
      expect((await post({ 'X-Better-Stack-Secret': SECRET.slice(1) }, incident())).status).toBe(401);
      expect((await post({ 'X-Better-Stack-Secret': `Bearer ${SECRET}` }, incident())).status).toBe(401);
    });

    it('rejects a missing header', async () => {
      expect((await post({}, incident())).status).toBe(401);
    });
  });

  describe('Basic auth verification', () => {
    it('accepts the correct username and password (password contains a colon)', async () => {
      expect(PASS).toContain(':');
      expect((await post(BASIC_AUTH, incident())).status).toBe(200);
    });

    it('accepts the scheme in any case', async () => {
      expect((await post({ Authorization: basic(USER, PASS).replace('Basic', 'BASIC') }, incident())).status).toBe(200);
    });

    it('rejects a wrong username or password', async () => {
      expect((await post({ Authorization: basic('other', PASS) }, incident())).status).toBe(401);
      expect((await post({ Authorization: basic(USER, 'wrong') }, incident())).status).toBe(401);
    });

    it('rejects another scheme, malformed base64 and a value without a colon', async () => {
      const noColon = `Basic ${Buffer.from('nocolon').toString('base64')}`;
      expect((await post({ Authorization: `Bearer ${SECRET}` }, incident())).status).toBe(401);
      expect((await post({ Authorization: 'Basic !!!notbase64' }, incident())).status).toBe(401);
      expect((await post({ Authorization: `${basic(USER, PASS)}!!` }, incident())).status).toBe(401);
      expect((await post({ Authorization: noColon }, incident())).status).toBe(401);
    });
  });

  describe('verifyBetterStackRequest()', () => {
    const h = (o: Record<string, string>) => new Headers(o);

    it('accepts a request that passes either configured method', () => {
      const cfg = { secret: 's3cret', username: 'u', password: 'p' };
      expect(verifyBetterStackRequest(h({ 'x-better-stack-secret': 's3cret' }), cfg)).toBe(true);
      expect(verifyBetterStackRequest(h({ authorization: basic('u', 'p') }), cfg)).toBe(true);
      expect(verifyBetterStackRequest(h({ 'x-better-stack-secret': 'nope' }), cfg)).toBe(false);
    });

    it('fails closed when nothing is configured', () => {
      expect(verifyBetterStackRequest(h({ 'x-better-stack-secret': '' }), {})).toBe(false);
      expect(verifyBetterStackRequest(h({ authorization: basic('', '') }), {})).toBe(false);
    });

    it('never uses a method that is not configured', () => {
      expect(verifyBetterStackRequest(h({ authorization: basic('u', 'p') }), { secret: 's3cret' })).toBe(false);
      expect(
        verifyBetterStackRequest(h({ 'x-better-stack-secret': 's3cret' }), { username: 'u', password: 'p' })
      ).toBe(false);
    });

    it('honours a custom header name', () => {
      const cfg = { headerName: 'X-Hook-Key', secret: 's3cret' };
      expect(verifyBetterStackRequest(h({ 'x-hook-key': 's3cret' }), cfg)).toBe(true);
      expect(verifyBetterStackRequest(h({ 'x-better-stack-secret': 's3cret' }), cfg)).toBe(false);
    });
  });

  describe('HTTP methods', () => {
    const handlers: [string, Handler][] = [
      ['GET', GET],
      ['HEAD', HEAD],
      ['POST', POST],
      ['PUT', PUT],
      ['PATCH', PATCH],
      ['OPTIONS', OPTIONS],
    ];

    it.each(handlers)('checks the credential first on %s', async (method, handler) => {
      expect((await call(handler, method, {})).status).toBe(401);
    });

    it.each(handlers)('acknowledges an authenticated %s with no body', async (method, handler) => {
      expect((await call(handler, method)).status).toBe(200);
    });

    it('handles an authenticated PUT and PATCH with a body', async () => {
      const body = incident({ resolved_at: '2026-10-26T11:00:00.000Z' });
      expect((await call(PUT, 'PUT', HEADER_AUTH, body)).status).toBe(200);
      expect((await call(PATCH, 'PATCH', BASIC_AUTH, body)).status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('resolved'));
    });
  });

  describe('body handling', () => {
    it('acknowledges a non-JSON body (custom body_template)', async () => {
      const res = await post({ ...HEADER_AUTH, 'Content-Type': 'text/plain' }, 'Incident 1 started on Tesla.com');
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith('Received a non-JSON body:', expect.any(String));
    });

    it('does not parse the body before authenticating', async () => {
      expect((await post({}, '{not json')).status).toBe(401);
    });

    it('acknowledges JSON that is not an object', async () => {
      for (const body of ['[1,2]', '"text"', '42', 'null']) {
        expect((await post(HEADER_AUTH, body)).status).toBe(200);
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
        expect((await post(HEADER_AUTH, body)).status).toBe(200);
      }
    });
  });

  describe('event dispatch', () => {
    it('handles an incident comment', async () => {
      expect((await post(HEADER_AUTH, COMMENT)).status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('comment by jane@example.com'));
    });

    it('handles an incident start, acknowledgement and resolution', async () => {
      await post(HEADER_AUTH, incident());
      await post(HEADER_AUTH, incident({ acknowledged_at: '2026-10-26T10:55:00.000Z' }));
      await post(
        HEADER_AUTH,
        incident({ acknowledged_at: '2026-10-26T10:55:00.000Z', resolved_at: '2026-10-26T11:00:00.000Z' })
      );
      const lines = logSpy.mock.calls.map((c) => String(c[0]));
      expect(lines.some((l) => l.includes('started'))).toBe(true);
      expect(lines.some((l) => l.includes('acknowledged'))).toBe(true);
      expect(lines.some((l) => l.includes('resolved'))).toBe(true);
    });

    it('handles a paused monitor', async () => {
      expect((await post(HEADER_AUTH, monitor('2026-10-26T10:00:00.000Z'))).status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('paused'));
    });

    it('handles an on-call change and a holiday change', async () => {
      expect((await post(HEADER_AUTH, onCall())).status).toBe(200);
      expect((await post(HEADER_AUTH, onCall('holiday'))).status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('holiday change'));
    });

    it('logs a payload it does not recognise', async () => {
      expect((await post(HEADER_AUTH, { custom: true })).status).toBe(200);
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
});
