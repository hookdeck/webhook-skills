import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/prometheus-alertmanager/route';
import { verifyAlertmanagerRequest } from '../lib/verify-alertmanager';
import { seen } from '../lib/seen';

const SECRET = 'test_alertmanager_secret_0123456789';
const AUTH = `Bearer ${SECRET}`;
const USER = 'alertmanager';
const PASS = 'pa:ss_word_0123456789';
const basicAuth = (u: string, p: string) => `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;

beforeAll(() => {
  process.env.ALERTMANAGER_WEBHOOK_SECRET = SECRET;
  process.env.ALERTMANAGER_WEBHOOK_USERNAME = USER;
  process.env.ALERTMANAGER_WEBHOOK_PASSWORD = PASS;
});

function alert(status = 'firing', fingerprint = '1a2b3c4d5e6f7a8b') {
  return {
    status,
    labels: { alertname: 'HighCPU', instance: 'web-1:9100', severity: 'critical' },
    annotations: { summary: 'CPU above 90%' },
    startsAt: '2026-10-26T10:00:00.000Z',
    endsAt: status === 'resolved' ? '2026-10-26T10:30:00.000Z' : '0001-01-01T00:00:00Z',
    generatorURL: 'http://prometheus:9090/graph?g0.expr=cpu',
    fingerprint,
  };
}

function group(status = 'firing', alerts: unknown[] = [alert(status)]) {
  return {
    version: '4',
    groupKey: '{}:{alertname="HighCPU"}',
    truncatedAlerts: 0,
    status,
    receiver: 'hookdeck',
    groupLabels: { alertname: 'HighCPU' },
    commonLabels: { alertname: 'HighCPU', severity: 'critical' },
    commonAnnotations: { summary: 'CPU above 90%' },
    externalURL: 'http://alertmanager:9093',
    alerts,
  };
}

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(group()),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/prometheus-alertmanager', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
}

describe('POST /webhooks/prometheus-alertmanager', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    seen.clear();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => logSpy.mockRestore());

  describe('Authorization bearer verification', () => {
    it('accepts the correct credentials', async () => {
      const res = await POST(makeRequest({ Authorization: AUTH }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it('matches the scheme case-insensitively', async () => {
      expect((await POST(makeRequest({ Authorization: `bearer ${SECRET}` }))).status).toBe(200);
      expect((await POST(makeRequest({ Authorization: `BEARER ${SECRET}` }))).status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await POST(makeRequest({ Authorization: `Bearer ${'x'.repeat(SECRET.length)}` }));
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      expect((await POST(makeRequest({ Authorization: 'Bearer short' }))).status).toBe(401);
    });

    it('rejects a missing header', async () => {
      expect((await POST(makeRequest())).status).toBe(401);
    });

    it('rejects the bare secret without a scheme', async () => {
      expect((await POST(makeRequest({ Authorization: SECRET }))).status).toBe(401);
    });

    it('rejects the wrong scheme', async () => {
      const basic = Buffer.from(`user:${SECRET}`).toString('base64');
      expect((await POST(makeRequest({ Authorization: `Basic ${basic}` }))).status).toBe(401);
      expect((await POST(makeRequest({ Authorization: `Token ${SECRET}` }))).status).toBe(401);
    });

    it('does not trim the credentials', async () => {
      // The Headers API trims surrounding whitespace itself, so check the helper directly.
      const headers = { get: () => `Bearer ${SECRET} ` } as unknown as Headers;
      expect(verifyAlertmanagerRequest(headers, SECRET)).toBe(false);
    });

    it('fails closed when the secret is not configured', () => {
      const headers = new Headers({ Authorization: 'Bearer anything' });
      expect(verifyAlertmanagerRequest(headers, '')).toBe(false);
      expect(verifyAlertmanagerRequest(headers, undefined as unknown as string)).toBe(
        // falls back to the env var set in beforeAll, which does not match
        false
      );
    });

    it('strips a leading "Bearer " from the configured secret', () => {
      const headers = new Headers({ Authorization: 'Bearer abc' });
      expect(verifyAlertmanagerRequest(headers, 'Bearer abc')).toBe(true);
      expect(verifyAlertmanagerRequest(headers, 'bearer abc')).toBe(true);
    });

    it('authenticates before parsing the body', async () => {
      const res = await POST(makeRequest({ Authorization: 'Bearer wrong' }, 'not json'));
      expect(res.status).toBe(401);
    });
  });

  describe('basic_auth verification', () => {
    it('accepts the correct username and password (password contains a colon)', async () => {
      expect((await POST(makeRequest({ Authorization: basicAuth(USER, PASS) }))).status).toBe(200);
    });

    it('matches the scheme case-insensitively', async () => {
      const token = Buffer.from(`${USER}:${PASS}`).toString('base64');
      expect((await POST(makeRequest({ Authorization: `basic ${token}` }))).status).toBe(200);
      expect((await POST(makeRequest({ Authorization: `BASIC ${token}` }))).status).toBe(200);
    });

    it('rejects a wrong password or username', async () => {
      expect((await POST(makeRequest({ Authorization: basicAuth(USER, 'wrong') }))).status).toBe(401);
      expect((await POST(makeRequest({ Authorization: basicAuth('someone', PASS) }))).status).toBe(401);
    });

    it('rejects malformed credentials', async () => {
      const noColon = Buffer.from(`${USER}${PASS}`).toString('base64');
      const valid = Buffer.from(`${USER}:${PASS}`).toString('base64');
      for (const value of [`Basic ${noColon}`, 'Basic !!not-base64!!', `Basic ${valid}AAAA`, 'Basic ']) {
        expect((await POST(makeRequest({ Authorization: value }))).status).toBe(401);
      }
    });

    it('rejects basic_auth when it is not configured', () => {
      const headers = new Headers({ Authorization: basicAuth(USER, PASS) });
      expect(verifyAlertmanagerRequest(headers, SECRET, { username: '', password: '' })).toBe(false);
      expect(verifyAlertmanagerRequest(headers, SECRET, { username: USER, password: '' })).toBe(false);
    });

    it('rejects everything when neither form is configured', () => {
      const none = { username: '', password: '' };
      const basic = new Headers({ Authorization: basicAuth(USER, PASS) });
      expect(verifyAlertmanagerRequest(basic, '', none)).toBe(false);
      expect(verifyAlertmanagerRequest(new Headers({ Authorization: 'Bearer x' }), '', none)).toBe(false);
    });

    it('accepts basic_auth with no Bearer secret configured', () => {
      const headers = new Headers({ Authorization: basicAuth(USER, PASS) });
      expect(verifyAlertmanagerRequest(headers, '', { username: USER, password: PASS })).toBe(true);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await POST(
        makeRequest({ Authorization: AUTH }, JSON.stringify(group()), 'text/plain')
      );
      expect(res.status).toBe(200);
    });

    it('rejects invalid JSON with 400', async () => {
      expect((await POST(makeRequest({ Authorization: AUTH }, 'not json'))).status).toBe(400);
    });

    it('rejects a non-object body with 400', async () => {
      expect((await POST(makeRequest({ Authorization: AUTH }, '[1,2]'))).status).toBe(400);
    });

    it('rejects a non-array alerts field with 400', async () => {
      const body = JSON.stringify({ ...group(), alerts: 'nope' });
      expect((await POST(makeRequest({ Authorization: AUTH }, body))).status).toBe(400);
    });
  });

  describe('alert handling', () => {
    it('handles firing alerts', async () => {
      await POST(makeRequest({ Authorization: AUTH }));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Alert firing: HighCPU'));
    });

    it('handles resolved alerts', async () => {
      await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(group('resolved'))));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Alert resolved: HighCPU'));
    });

    it('loops over every alert in the group, using each alert status', async () => {
      const body = JSON.stringify(group('firing', [alert('firing', 'aaaa'), alert('resolved', 'bbbb')]));
      await POST(makeRequest({ Authorization: AUTH }, body));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Alert firing: HighCPU (aaaa)'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Alert resolved: HighCPU (bbbb)'));
    });

    it('deduplicates repeat notifications for the same alert', async () => {
      await POST(makeRequest({ Authorization: AUTH }));
      await POST(makeRequest({ Authorization: AUTH }));
      const firing = logSpy.mock.calls.filter(([m]) => String(m).startsWith('Alert firing'));
      expect(firing).toHaveLength(1);
    });

    it('treats a resolved notification as new after firing', async () => {
      await POST(makeRequest({ Authorization: AUTH }));
      await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(group('resolved'))));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Alert resolved'));
    });

    it('accepts a group with no alerts', async () => {
      const res = await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(group('firing', []))));
      expect(res.status).toBe(200);
    });
  });
});
