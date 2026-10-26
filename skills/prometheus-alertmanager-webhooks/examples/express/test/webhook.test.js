const request = require('supertest');

// Set test environment variables before importing the app
process.env.ALERTMANAGER_WEBHOOK_SECRET = 'test_alertmanager_secret_0123456789';

const app = require('../src/index');
const { verifyAlertmanagerRequest, resetSeen } = require('../src/index');

const SECRET = process.env.ALERTMANAGER_WEBHOOK_SECRET;
const AUTH = `Bearer ${SECRET}`;

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

function group(status = 'firing', alerts = [alert(status)]) {
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

function post(body = JSON.stringify(group()), contentType = 'application/json') {
  return request(app)
    .post('/webhooks/prometheus-alertmanager')
    .set('Content-Type', contentType)
    .send(body);
}

describe('Prometheus Alertmanager webhook endpoint', () => {
  let logSpy;
  beforeEach(() => {
    resetSeen();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => logSpy.mockRestore());

  describe('Authorization bearer verification', () => {
    it('accepts the correct credentials', async () => {
      const res = await post().set('Authorization', AUTH);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the scheme case-insensitively', async () => {
      expect((await post().set('Authorization', `bearer ${SECRET}`)).status).toBe(200);
      expect((await post().set('Authorization', `BEARER ${SECRET}`)).status).toBe(200);
    });

    it('rejects a wrong secret of the same length', async () => {
      const res = await post().set('Authorization', `Bearer ${'x'.repeat(SECRET.length)}`);
      expect(res.status).toBe(401);
    });

    it('rejects a secret of a different length without throwing', async () => {
      expect((await post().set('Authorization', 'Bearer short')).status).toBe(401);
    });

    it('rejects a missing header', async () => {
      expect((await post()).status).toBe(401);
    });

    it('rejects the bare secret without a scheme', async () => {
      expect((await post().set('Authorization', SECRET)).status).toBe(401);
    });

    it('rejects the wrong scheme', async () => {
      const basic = Buffer.from(`user:${SECRET}`).toString('base64');
      expect((await post().set('Authorization', `Basic ${basic}`)).status).toBe(401);
      expect((await post().set('Authorization', `Token ${SECRET}`)).status).toBe(401);
    });

    it('does not trim the credentials', () => {
      // HTTP parsers strip header whitespace themselves, so check the helper directly.
      expect(verifyAlertmanagerRequest({ authorization: `Bearer ${SECRET} ` }, SECRET)).toBe(false);
    });

    it('fails closed when the secret is not configured', () => {
      expect(verifyAlertmanagerRequest({ authorization: 'Bearer anything' }, '')).toBe(false);
      expect(verifyAlertmanagerRequest({ authorization: 'Bearer ' }, undefined)).toBe(false);
    });

    it('strips a leading "Bearer " from the configured secret', () => {
      expect(verifyAlertmanagerRequest({ authorization: 'Bearer abc' }, 'Bearer abc')).toBe(true);
      expect(verifyAlertmanagerRequest({ authorization: 'Bearer abc' }, 'bearer abc')).toBe(true);
    });

    it('authenticates before parsing the body', async () => {
      const res = await post('not json').set('Authorization', 'Bearer wrong');
      expect(res.status).toBe(401);
    });
  });

  describe('body handling', () => {
    it('accepts any content type', async () => {
      const res = await post(JSON.stringify(group()), 'text/plain').set('Authorization', AUTH);
      expect(res.status).toBe(200);
    });

    it('rejects invalid JSON with 400', async () => {
      const res = await post('not json').set('Authorization', AUTH);
      expect(res.status).toBe(400);
    });

    it('rejects a non-object body with 400', async () => {
      expect((await post('[1,2]').set('Authorization', AUTH)).status).toBe(400);
    });

    it('rejects a non-array alerts field with 400', async () => {
      const res = await post(JSON.stringify({ ...group(), alerts: 'nope' })).set('Authorization', AUTH);
      expect(res.status).toBe(400);
    });
  });

  describe('alert handling', () => {
    it('handles firing alerts', async () => {
      const res = await post().set('Authorization', AUTH);
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Alert firing: HighCPU'));
    });

    it('handles resolved alerts', async () => {
      const res = await post(JSON.stringify(group('resolved'))).set('Authorization', AUTH);
      expect(res.status).toBe(200);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Alert resolved: HighCPU'));
    });

    it('loops over every alert in the group, using each alert status', async () => {
      const body = group('firing', [alert('firing', 'aaaa'), alert('resolved', 'bbbb')]);
      await post(JSON.stringify(body)).set('Authorization', AUTH);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Alert firing: HighCPU (aaaa)'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Alert resolved: HighCPU (bbbb)'));
    });

    it('deduplicates repeat notifications for the same alert', async () => {
      await post().set('Authorization', AUTH);
      await post().set('Authorization', AUTH);
      const firing = logSpy.mock.calls.filter(([m]) => String(m).startsWith('Alert firing'));
      expect(firing).toHaveLength(1);
    });

    it('treats a resolved notification as new after firing', async () => {
      await post().set('Authorization', AUTH);
      await post(JSON.stringify(group('resolved'))).set('Authorization', AUTH);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Alert resolved'));
    });

    it('accepts a group with no alerts', async () => {
      const res = await post(JSON.stringify(group('firing', []))).set('Authorization', AUTH);
      expect(res.status).toBe(200);
    });
  });

  it('serves a health check', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
