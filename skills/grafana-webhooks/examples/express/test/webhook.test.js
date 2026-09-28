// Generated with: grafana-webhooks skill
// https://github.com/hookdeck/webhook-skills

const request = require('supertest');
const crypto = require('crypto');

// The contact point's HMAC secret is used AS-IS as UTF-8 bytes: no base64
// decode, no prefix. It is not a Grafana API key or service-account token.
const SECRET = 'grafana_test_hmac_secret';

// Default signature header name (constant `defaultHeaderName` in grafana/alerting
// http/hmac.go, and the UI placeholder). Overridable per contact point.
const DEFAULT_SIG_HEADER = 'X-Grafana-Alerting-Signature';

// The timestamp header has NO default name. This is just the name used in
// Grafana's provisioning docs example.
const TS_HEADER = 'X-Grafana-Alerting-Signature-Timestamp';

process.env.GRAFANA_WEBHOOK_SECRET = SECRET;
// Body-only mode: leave GRAFANA_TIMESTAMP_HEADER unset.
delete process.env.GRAFANA_TIMESTAMP_HEADER;
delete process.env.GRAFANA_SIGNATURE_HEADER;

const { app, verifyGrafanaSignature, idempotencyKey } = require('../src/index');

// --- Fixture: the docs' "Default JSON payload" shape ------------------------

const NOTIFICATION = {
  receiver: 'My Super Webhook',
  status: 'firing',
  orgId: 1,
  alerts: [
    {
      status: 'firing',
      labels: { alertname: 'High memory usage', team: 'blue', zone: 'us-1' },
      annotations: {
        description: 'The system has high memory usage',
        runbook_url: 'https://myrunbook.com/runbook/1234',
        summary: 'This alert was triggered for zone us-1',
      },
      startsAt: '2021-10-12T09:51:03.157076+02:00',
      // "0001-01-01T00:00:00Z" is Go's zero time — the alert is still firing.
      endsAt: '0001-01-01T00:00:00Z',
      generatorURL: 'https://play.grafana.org/alerting/1afz29v7z/edit',
      fingerprint: 'c6eadffa33fcdf37',
      silenceURL: 'https://play.grafana.org/alerting/silence/new?alertmanager=grafana',
      dashboardURL: '',
      panelURL: '',
      values: { B: 44.23943737541908, C: 1 },
    },
    {
      status: 'firing',
      labels: { alertname: 'High CPU usage', team: 'blue', zone: 'eu-1' },
      annotations: {
        description: 'The system has high CPU usage',
        summary: 'This alert was triggered for zone eu-1',
      },
      startsAt: '2021-10-12T09:56:03.157076+02:00',
      endsAt: '0001-01-01T00:00:00Z',
      generatorURL: 'https://play.grafana.org/alerting/d1rdpdv7k/edit',
      fingerprint: 'bc97ff14869b13e3',
      silenceURL: 'https://play.grafana.org/alerting/silence/new?alertmanager=grafana',
      dashboardURL: '',
      panelURL: '',
      values: { B: 44.23943737541908, C: 1 },
    },
  ],
  groupLabels: {},
  commonLabels: { team: 'blue' },
  commonAnnotations: {},
  externalURL: 'https://play.grafana.org/',
  version: '1',
  groupKey: '{}:{}',
  truncatedAlerts: 0,
  title: '[FIRING:2]  (blue)',
  state: 'alerting',
  message: '**Firing**\n\nValue: B=44.23943737541908, C=1',
};

// Grafana's Test button sends a NORMAL, signed notification with a synthetic
// alert — not a handshake or challenge request.
const TEST_NOTIFICATION = {
  ...NOTIFICATION,
  title: '[FIRING:1]  (TestAlert Grafana)',
  alerts: [
    {
      status: 'firing',
      labels: { alertname: 'TestAlert', instance: 'Grafana' },
      annotations: { summary: 'Notification test' },
      startsAt: '2024-01-01T00:00:00Z',
      endsAt: '0001-01-01T00:00:00Z',
      fingerprint: 'fac0861a85de433a',
      generatorURL: '',
      silenceURL: '',
      dashboardURL: '',
      panelURL: '',
      values: {},
    },
  ],
};

const BODY = JSON.stringify(NOTIFICATION);

// --- Signing helpers: exactly what grafana/alerting http/hmac.go does --------

/** Body-only mode: HMAC-SHA256(rawBody), lowercase hex, bare. */
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

/** Timestamped mode: HMAC-SHA256(timestamp + ":" + rawBody). COLON, not dot. */
function signWithTimestamp(body, timestamp, secret = SECRET) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}:`)
    .update(body)
    .digest('hex');
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

// --- Verification unit tests (body-only mode) -------------------------------

describe('verifyGrafanaSignature — body-only mode', () => {
  it('accepts a correct signature over the raw body', () => {
    expect(verifyGrafanaSignature(BODY, sign(BODY), null, SECRET)).toBe(true);
  });

  it('produces a bare 64-char lowercase hex digest (no sha256= prefix)', () => {
    expect(sign(BODY)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('accepts an uppercased hex digest', () => {
    // Harmless normalisation; guards against a proxy that upcases the value.
    expect(verifyGrafanaSignature(BODY, sign(BODY).toUpperCase(), null, SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const tampered = JSON.stringify({ ...NOTIFICATION, status: 'resolved' });
    expect(verifyGrafanaSignature(tampered, sign(BODY), null, SECRET)).toBe(false);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verifyGrafanaSignature(BODY, sign(BODY, 'wrong_secret'), null, SECRET)).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifyGrafanaSignature(BODY, null, null, SECRET)).toBe(false);
  });

  it('fails closed when no secret is configured', () => {
    expect(verifyGrafanaSignature(BODY, sign(BODY), null, undefined)).toBe(false);
  });

  it('rejects a short signature without throwing (timingSafeEqual length guard)', () => {
    expect(() => verifyGrafanaSignature(BODY, 'abc', null, SECRET)).not.toThrow();
    expect(verifyGrafanaSignature(BODY, 'abc', null, SECRET)).toBe(false);
  });

  it('rejects a base64 digest (Grafana uses hex)', () => {
    const b64 = crypto.createHmac('sha256', SECRET).update(BODY).digest('base64');
    expect(verifyGrafanaSignature(BODY, b64, null, SECRET)).toBe(false);
  });

  it('rejects a sha256=-prefixed digest (Grafana sends the digest bare)', () => {
    expect(verifyGrafanaSignature(BODY, `sha256=${sign(BODY)}`, null, SECRET)).toBe(false);
  });

  it('rejects a signature over re-serialized JSON when the raw bytes differ', () => {
    // Custom Payload templates can emit pretty-printed JSON. Signing parsed-and-
    // re-serialized JSON is the classic bug: same object, different bytes.
    const pretty = JSON.stringify(NOTIFICATION, null, 2);
    expect(verifyGrafanaSignature(pretty, sign(BODY), null, SECRET)).toBe(false);
    // ...and verifying the pretty body against its OWN signature works fine.
    expect(verifyGrafanaSignature(pretty, sign(pretty), null, SECRET)).toBe(true);
  });

  it('verifies a Buffer body identically to a string body', () => {
    expect(verifyGrafanaSignature(Buffer.from(BODY, 'utf8'), sign(BODY), null, SECRET)).toBe(
      true
    );
  });

  it('uses the secret as-is, not base64-decoded', () => {
    const decoded = Buffer.from(SECRET, 'base64');
    const wrong = crypto.createHmac('sha256', decoded).update(BODY).digest('hex');
    expect(verifyGrafanaSignature(BODY, wrong, null, SECRET)).toBe(false);
  });
});

// --- Verification unit tests (timestamped mode) -----------------------------

describe('verifyGrafanaSignature — timestamped mode', () => {
  const opts = { timestampRequired: true, maxAgeSeconds: 300 };

  it('accepts HMAC(timestamp + ":" + body)', () => {
    const ts = String(nowSeconds());
    expect(
      verifyGrafanaSignature(BODY, signWithTimestamp(BODY, ts), ts, SECRET, opts)
    ).toBe(true);
  });

  it('rejects a DOT separator (Stripe-style) — Grafana uses a colon', () => {
    const ts = String(nowSeconds());
    const dotted = crypto.createHmac('sha256', SECRET).update(`${ts}.`).update(BODY).digest('hex');
    expect(verifyGrafanaSignature(BODY, dotted, ts, SECRET, opts)).toBe(false);
  });

  it('rejects a body-only signature when a timestamp header is configured', () => {
    const ts = String(nowSeconds());
    expect(verifyGrafanaSignature(BODY, sign(BODY), ts, SECRET, opts)).toBe(false);
  });

  it('rejects a request with no timestamp header (no silent downgrade)', () => {
    expect(verifyGrafanaSignature(BODY, sign(BODY), null, SECRET, opts)).toBe(false);
  });

  it('rejects a stale timestamp (replay)', () => {
    const stale = String(nowSeconds() - 600);
    expect(
      verifyGrafanaSignature(BODY, signWithTimestamp(BODY, stale), stale, SECRET, opts)
    ).toBe(false);
  });

  it('accepts a timestamp inside the window', () => {
    const recent = String(nowSeconds() - 120);
    expect(
      verifyGrafanaSignature(BODY, signWithTimestamp(BODY, recent), recent, SECRET, opts)
    ).toBe(true);
  });

  it('rejects a millisecond timestamp (Grafana sends seconds)', () => {
    const ms = String(Date.now());
    expect(verifyGrafanaSignature(BODY, signWithTimestamp(BODY, ms), ms, SECRET, opts)).toBe(
      false
    );
  });

  it('rejects a non-numeric timestamp', () => {
    expect(
      verifyGrafanaSignature(BODY, signWithTimestamp(BODY, 'nope'), 'nope', SECRET, opts)
    ).toBe(false);
  });

  it('rejects a timestamp that was swapped after signing', () => {
    const ts = String(nowSeconds());
    const other = String(nowSeconds() - 1);
    expect(
      verifyGrafanaSignature(BODY, signWithTimestamp(BODY, ts), other, SECRET, opts)
    ).toBe(false);
  });
});

// --- Route tests (body-only mode, the app's default config) -----------------

describe('POST /webhooks/grafana — body-only mode', () => {
  it('accepts a correctly signed firing notification', async () => {
    const res = await request(app)
      .post('/webhooks/grafana')
      .set('Content-Type', 'application/json')
      .set(DEFAULT_SIG_HEADER, sign(BODY))
      .send(BODY);

    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
  });

  it('accepts a resolved notification', async () => {
    const body = JSON.stringify({
      ...NOTIFICATION,
      status: 'resolved',
      state: 'ok',
      title: '[RESOLVED]  (blue)',
      alerts: NOTIFICATION.alerts.map((a) => ({
        ...a,
        status: 'resolved',
        endsAt: '2021-10-12T10:51:03.157076+02:00',
      })),
    });

    const res = await request(app)
      .post('/webhooks/grafana')
      .set('Content-Type', 'application/json')
      .set(DEFAULT_SIG_HEADER, sign(body))
      .send(body);

    expect(res.status).toBe(200);
  });

  it('accepts a firing group that contains a resolved alert', async () => {
    // The group status is `firing` if ANY member fires, so a firing
    // notification can carry resolved instances.
    const body = JSON.stringify({
      ...NOTIFICATION,
      alerts: [
        NOTIFICATION.alerts[0],
        { ...NOTIFICATION.alerts[1], status: 'resolved', endsAt: '2021-10-12T10:00:00Z' },
      ],
    });

    const res = await request(app)
      .post('/webhooks/grafana')
      .set('Content-Type', 'application/json')
      .set(DEFAULT_SIG_HEADER, sign(body))
      .send(body);

    expect(res.status).toBe(200);
  });

  it('accepts a Test-button notification (signed like any other)', async () => {
    const body = JSON.stringify(TEST_NOTIFICATION);

    const res = await request(app)
      .post('/webhooks/grafana')
      .set('Content-Type', 'application/json')
      .set(DEFAULT_SIG_HEADER, sign(body))
      .send(body);

    expect(res.status).toBe(200);
  });

  it('accepts a PUT-shaped payload delivered over POST with truncatedAlerts', async () => {
    const body = JSON.stringify({ ...NOTIFICATION, truncatedAlerts: 3 });

    const res = await request(app)
      .post('/webhooks/grafana')
      .set('Content-Type', 'application/json')
      .set(DEFAULT_SIG_HEADER, sign(body))
      .send(body);

    expect(res.status).toBe(200);
  });

  it('returns 400 when the signature header is missing', async () => {
    const res = await request(app)
      .post('/webhooks/grafana')
      .set('Content-Type', 'application/json')
      .send(BODY);

    expect(res.status).toBe(400);
    expect(res.text).toContain('Missing');
  });

  it('returns 400 for an invalid signature', async () => {
    const res = await request(app)
      .post('/webhooks/grafana')
      .set('Content-Type', 'application/json')
      .set(DEFAULT_SIG_HEADER, 'f'.repeat(64))
      .send(BODY);

    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('returns 400 for a tampered body', async () => {
    const tampered = JSON.stringify({ ...NOTIFICATION, status: 'resolved' });

    const res = await request(app)
      .post('/webhooks/grafana')
      .set('Content-Type', 'application/json')
      .set(DEFAULT_SIG_HEADER, sign(BODY))
      .send(tampered);

    expect(res.status).toBe(400);
  });

  it('returns 400 for a correctly signed non-JSON body', async () => {
    const body = 'not json at all';

    const res = await request(app)
      .post('/webhooks/grafana')
      .set('Content-Type', 'application/json')
      .set(DEFAULT_SIG_HEADER, sign(body))
      .send(body);

    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid JSON body');
  });

  it('returns 500 and fails closed when no secret is configured', async () => {
    const saved = process.env.GRAFANA_WEBHOOK_SECRET;
    delete process.env.GRAFANA_WEBHOOK_SECRET;
    try {
      const res = await request(app)
        .post('/webhooks/grafana')
        .set('Content-Type', 'application/json')
        .set(DEFAULT_SIG_HEADER, sign(BODY))
        .send(BODY);

      expect(res.status).toBe(500);
    } finally {
      process.env.GRAFANA_WEBHOOK_SECRET = saved;
    }
  });
});

// --- Route tests with a custom header configuration -------------------------

describe('POST /webhooks/grafana — custom header names + timestamped mode', () => {
  let timestampedApp;

  beforeAll(() => {
    jest.resetModules();
    process.env.GRAFANA_SIGNATURE_HEADER = 'X-My-Grafana-Signature';
    process.env.GRAFANA_TIMESTAMP_HEADER = TS_HEADER;
    timestampedApp = require('../src/index').app;
  });

  afterAll(() => {
    delete process.env.GRAFANA_SIGNATURE_HEADER;
    delete process.env.GRAFANA_TIMESTAMP_HEADER;
    jest.resetModules();
  });

  it('accepts a timestamped signature on the custom headers', async () => {
    const ts = String(nowSeconds());

    const res = await request(timestampedApp)
      .post('/webhooks/grafana')
      .set('Content-Type', 'application/json')
      .set('X-My-Grafana-Signature', signWithTimestamp(BODY, ts))
      .set(TS_HEADER, ts)
      .send(BODY);

    expect(res.status).toBe(200);
  });

  it('rejects a request missing the timestamp header', async () => {
    const res = await request(timestampedApp)
      .post('/webhooks/grafana')
      .set('Content-Type', 'application/json')
      .set('X-My-Grafana-Signature', sign(BODY))
      .send(BODY);

    expect(res.status).toBe(400);
    expect(res.text).toBe('Invalid signature');
  });

  it('rejects a stale timestamp', async () => {
    const stale = String(nowSeconds() - 3600);

    const res = await request(timestampedApp)
      .post('/webhooks/grafana')
      .set('Content-Type', 'application/json')
      .set('X-My-Grafana-Signature', signWithTimestamp(BODY, stale))
      .set(TS_HEADER, stale)
      .send(BODY);

    expect(res.status).toBe(400);
  });

  it('ignores a signature sent on the default header name', async () => {
    const ts = String(nowSeconds());

    const res = await request(timestampedApp)
      .post('/webhooks/grafana')
      .set('Content-Type', 'application/json')
      .set(DEFAULT_SIG_HEADER, signWithTimestamp(BODY, ts))
      .set(TS_HEADER, ts)
      .send(BODY);

    expect(res.status).toBe(400);
    expect(res.text).toContain('Missing');
  });
});

// --- Idempotency ------------------------------------------------------------

describe('idempotencyKey', () => {
  it('is stable for the same group and alerts', () => {
    expect(idempotencyKey(NOTIFICATION)).toBe(idempotencyKey({ ...NOTIFICATION }));
  });

  it('ignores alert ordering', () => {
    const reordered = { ...NOTIFICATION, alerts: [...NOTIFICATION.alerts].reverse() };
    expect(idempotencyKey(reordered)).toBe(idempotencyKey(NOTIFICATION));
  });

  it('differs between firing and resolved', () => {
    expect(idempotencyKey({ ...NOTIFICATION, status: 'resolved' })).not.toBe(
      idempotencyKey(NOTIFICATION)
    );
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
