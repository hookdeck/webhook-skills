// Generated with: sentry-webhooks skill
// https://github.com/hookdeck/webhook-skills

const crypto = require('crypto');

// Set env BEFORE requiring the app — the handler reads process.env per request,
// but the startup warning reads it at require time.
//
// A Sentry Client Secret is a 64-character hex string, used AS-IS as a raw
// UTF-8 HMAC key (never decoded).
process.env.SENTRY_CLIENT_SECRET =
  'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
delete process.env.SENTRY_WEBHOOK_TOLERANCE_SECONDS;

const request = require('supertest');
const {
  app,
  verifySentrySignature,
  isTimestampFresh,
  eventToken,
} = require('../src/index');

const CLIENT_SECRET = process.env.SENTRY_CLIENT_SECRET;

/**
 * Generate a real Sentry signature exactly as Sentry does:
 * HMAC-SHA256 over the RAW body, keyed with the Client Secret used as-is,
 * lowercase hex. No prefix, no timestamp component, exactly one signature.
 *
 * Mirrors SentryApp.build_signature:
 *   hmac.new(key=secret.encode("utf-8"), msg=body.encode("utf-8"),
 *            digestmod=sha256).hexdigest()
 */
function generateSignature(rawBody, secret = CLIENT_SECRET) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

function nowSeconds() {
  return String(Math.floor(Date.now() / 1000));
}

/** POST a raw body with the headers Sentry really sends. */
function postWebhook(rawBody, { resource, signature, headerName, timestamp, requestId } = {}) {
  let req = request(app)
    .post('/webhooks/sentry')
    .set('Content-Type', 'application/json');

  if (resource !== null) req = req.set('Sentry-Hook-Resource', resource || 'issue');
  if (timestamp !== null) req = req.set('Sentry-Hook-Timestamp', timestamp || nowSeconds());
  req = req.set('Request-ID', requestId || crypto.randomUUID().replace(/-/g, ''));
  if (signature !== null) {
    req = req.set(
      headerName || 'Sentry-Hook-Signature',
      signature === undefined ? generateSignature(rawBody) : signature
    );
  }

  return req.send(rawBody);
}

// --- Fixtures from Sentry's documented payloads ------------------------------

// The documented installation.created envelope.
const INSTALLATION_CREATED = {
  action: 'created',
  actor: { id: 1, name: 'Meredith Heller', type: 'user' },
  data: {
    installation: {
      status: 'pending',
      organization: { slug: 'test-org' },
      app: { uuid: '2ebf071f-28df-4989-aca9-c37c763b278f', slug: 'webhooks-galore' },
      code: 'f3c71b491e3949b6b033ae45312a4fcb',
      uuid: 'a8e5d37a-696c-4c54-adb5-b3f28d64c7de',
    },
  },
  installation: { uuid: 'a8e5d37a-696c-4c54-adb5-b3f28d64c7de' },
};

// NOTE: no `type`/`event` field — the resource comes from the header only.
const ISSUE_CREATED = {
  action: 'created',
  installation: { uuid: 'a8e5d37a-696c-4c54-adb5-b3f28d64c7de' },
  data: {
    issue: {
      id: '100',
      title: 'ZeroDivisionError: division by zero',
      status: 'unresolved',
      substatus: 'new',
      statusDetails: {},
      issueCategory: 'error',
      issueType: 'error',
      project: { id: '1', slug: 'sentry', name: 'Sentry' },
    },
  },
  actor: { type: 'application', id: 'sentry', name: 'Sentry' },
};

// The documented comment.created envelope.
const COMMENT_CREATED = {
  action: 'created',
  data: {
    comment: 'adding a comment',
    project_slug: 'sentry',
    comment_id: 1234,
    issue_id: 100,
    timestamp: '2022-03-02T21:51:44.118160Z',
  },
  installation: { uuid: 'eac5a0ae-60ec-418f-9318-46dc5e7e52ec' },
  actor: { type: 'user', id: 1, name: 'colleen' },
};

// Issue alerts: resource is `event_alert`, NOT `issue_alert`. tags are PAIRS.
const EVENT_ALERT_TRIGGERED = {
  action: 'triggered',
  installation: { uuid: 'a8e5d37a-696c-4c54-adb5-b3f28d64c7de' },
  data: {
    event: {
      event_id: 'd1e1b1c1a1f1e1d1c1b1a1f1e1d1c1b1',
      issue_id: '100',
      url: 'https://sentry.io/api/0/projects/test-org/sentry/events/d1e1/',
      web_url: 'https://sentry.io/organizations/test-org/issues/100/events/d1e1/',
      issue_url: 'https://sentry.io/api/0/issues/100/',
      tags: [
        ['browser', 'Chrome 75.0.3770'],
        ['level', 'error'],
      ],
    },
    triggered_rule: 'Very Important Alert Rule!',
    issue_alert: { settings: [{ name: 'channel', value: '#general' }] },
  },
  actor: { type: 'application', id: 'sentry', name: 'Sentry' },
  text: 'Sentry event_alert.triggered: https://sentry.io/organizations/test-org/issues/100/',
};

const METRIC_ALERT_CRITICAL = {
  action: 'critical',
  installation: { uuid: 'a8e5d37a-696c-4c54-adb5-b3f28d64c7de' },
  data: {
    description_text: '1000 events in the last 10 minutes',
    description_title: 'Critical: Error count alert',
    web_url: 'https://sentry.io/organizations/test-org/alerts/rules/details/1/',
    metric_alert: {
      id: '1',
      identifier: '1',
      status: 20,
      title: 'Error count alert',
      alert_rule: { id: '1', name: 'Error count alert', aggregate: 'count()' },
    },
  },
  actor: { type: 'application', id: 'sentry', name: 'Sentry' },
};

const SEER_PR_CREATED = {
  action: 'pr_created',
  installation: { uuid: 'a8e5d37a-696c-4c54-adb5-b3f28d64c7de' },
  data: {
    run_id: 4242,
    group_id: 100,
    pull_requests: [
      {
        pr_number: 77,
        pr_url: 'https://github.com/example/app/pull/77',
        pr_id: 123456,
        repo_name: 'example/app',
        provider: 'github',
      },
    ],
  },
  actor: { type: 'application', id: 'sentry', name: 'Sentry' },
};

// preprod_artifact uses camelCase, and a *_completed action can mean FAILED.
const PREPROD_SIZE_FAILED = {
  action: 'size_analysis_completed',
  installation: { uuid: 'a8e5d37a-696c-4c54-adb5-b3f28d64c7de' },
  data: {
    buildId: 'build_abc123',
    organizationSlug: 'test-org',
    projectSlug: 'mobile-app',
    state: 'FAILED',
    errorCode: 'ARTIFACT_PROCESSING_ERROR',
    errorMessage: 'Could not unpack the artifact',
    appInfo: { name: 'Example', version: '1.2.3', buildNumber: '456' },
    gitInfo: { branch: 'main' },
  },
  actor: { type: 'application', id: 'sentry', name: 'Sentry' },
};

describe('verifySentrySignature (unit)', () => {
  const body = JSON.stringify(ISSUE_CREATED);

  it('accepts a valid Sentry-Hook-Signature', () => {
    const headers = { 'sentry-hook-signature': generateSignature(body) };
    expect(verifySentrySignature(body, headers, CLIENT_SECRET)).toBe(true);
  });

  it('accepts a Buffer raw body identically to a string', () => {
    const headers = { 'sentry-hook-signature': generateSignature(body) };
    expect(verifySentrySignature(Buffer.from(body, 'utf8'), headers, CLIENT_SECRET)).toBe(
      true
    );
  });

  it('falls back to Sentry-App-Signature (UI-component requests)', () => {
    // select_options.requested / external_issue.* / alert_rule_action.requested
    // sign with the same build_signature but use this header name. Sentry's own
    // reference app checks both.
    const headers = { 'sentry-app-signature': generateSignature(body) };
    expect(verifySentrySignature(body, headers, CLIENT_SECRET)).toBe(true);
  });

  it('prefers Sentry-Hook-Signature when both headers are present', () => {
    const headers = {
      'sentry-hook-signature': generateSignature(body),
      'sentry-app-signature': 'f'.repeat(64),
    };
    expect(verifySentrySignature(body, headers, CLIENT_SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const headers = { 'sentry-hook-signature': generateSignature(body) };
    const tampered = JSON.stringify({ ...ISSUE_CREATED, action: 'resolved' });
    expect(verifySentrySignature(tampered, headers, CLIENT_SECRET)).toBe(false);
  });

  it('rejects a signature made with a different secret', () => {
    const headers = { 'sentry-hook-signature': generateSignature(body, 'b'.repeat(64)) };
    expect(verifySentrySignature(body, headers, CLIENT_SECRET)).toBe(false);
  });

  it('rejects a missing signature header', () => {
    expect(verifySentrySignature(body, {}, CLIENT_SECRET)).toBe(false);
  });

  it('fails closed when no client secret is configured', () => {
    const headers = { 'sentry-hook-signature': generateSignature(body) };
    expect(verifySentrySignature(body, headers, undefined)).toBe(false);
    expect(verifySentrySignature(body, headers, '')).toBe(false);
  });

  it('rejects a base64 digest — Sentry is HEX', () => {
    const b64 = crypto.createHmac('sha256', CLIENT_SECRET).update(body).digest('base64');
    expect(verifySentrySignature(body, { 'sentry-hook-signature': b64 }, CLIENT_SECRET)).toBe(
      false
    );
  });

  it('rejects a sha256=-prefixed digest — Sentry sends a BARE digest', () => {
    const prefixed = `sha256=${generateSignature(body)}`;
    expect(
      verifySentrySignature(body, { 'sentry-hook-signature': prefixed }, CLIENT_SECRET)
    ).toBe(false);
  });

  it('rejects a Stripe-style timestamp.body signature — the timestamp is NOT signed', () => {
    const ts = nowSeconds();
    const wrong = crypto
      .createHmac('sha256', CLIENT_SECRET)
      .update(`${ts}.${body}`)
      .digest('hex');
    expect(verifySentrySignature(body, { 'sentry-hook-signature': wrong }, CLIENT_SECRET)).toBe(
      false
    );
  });

  it('rejects a decoded-secret signature — the Client Secret is used AS-IS', () => {
    // A 64-char hex secret is tempting to hex-decode. Sentry does not.
    const wrong = crypto
      .createHmac('sha256', Buffer.from(CLIENT_SECRET, 'hex'))
      .update(body)
      .digest('hex');
    expect(verifySentrySignature(body, { 'sentry-hook-signature': wrong }, CLIENT_SECRET)).toBe(
      false
    );
  });

  it('does not throw on a short/garbage signature (length guard)', () => {
    // crypto.timingSafeEqual throws on mismatched lengths; the guard must come
    // first or a 401 becomes a 500 — and Sentry disables webhooks that fail.
    expect(() =>
      verifySentrySignature(body, { 'sentry-hook-signature': 'abc' }, CLIENT_SECRET)
    ).not.toThrow();
    expect(verifySentrySignature(body, { 'sentry-hook-signature': 'abc' }, CLIENT_SECRET)).toBe(
      false
    );
  });

  it('accepts an EMPTY body — the signature is then the HMAC of the empty string', () => {
    // select_options.requested calls build_signature("") outright.
    const sig = generateSignature('');
    expect(verifySentrySignature(Buffer.alloc(0), { 'sentry-hook-signature': sig }, CLIENT_SECRET)).toBe(
      true
    );
  });

  it('rejects "{}" when the real body was empty', () => {
    // express.json() turns an empty body into {} — signing "{}" fails. This is
    // why the handler must read the RAW body.
    const sigForEmpty = generateSignature('');
    expect(
      verifySentrySignature('{}', { 'sentry-hook-signature': sigForEmpty }, CLIENT_SECRET)
    ).toBe(false);
  });

  it('verifies a non-ASCII payload from the RAW bytes', () => {
    // THE BUG IN SENTRY'S OWN SNIPPETS. Sentry serializes with
    // ensure_ascii=True, so it emits \uXXXX escapes; JSON.stringify emits
    // literal UTF-8. Re-serializing a parsed body therefore produces different
    // bytes and rejects a VALID delivery. Verifying the raw bytes always works,
    // whichever form arrived.
    const asciiEscaped = '{"action":"created","data":{"issue":{"title":"Caf\\u00e9 \\ud83d\\udca5"}}}';
    const literalUtf8 = JSON.stringify(JSON.parse(asciiEscaped));

    expect(literalUtf8).not.toBe(asciiEscaped); // the two byte strings differ

    // Each verifies against its own bytes...
    expect(
      verifySentrySignature(
        asciiEscaped,
        { 'sentry-hook-signature': generateSignature(asciiEscaped) },
        CLIENT_SECRET
      )
    ).toBe(true);
    expect(
      verifySentrySignature(
        literalUtf8,
        { 'sentry-hook-signature': generateSignature(literalUtf8) },
        CLIENT_SECRET
      )
    ).toBe(true);

    // ...and NOT against the other's, which is exactly the failure a
    // re-serializing verifier produces on real Sentry traffic.
    expect(
      verifySentrySignature(
        literalUtf8,
        { 'sentry-hook-signature': generateSignature(asciiEscaped) },
        CLIENT_SECRET
      )
    ).toBe(false);
  });
});

describe('eventToken (unit)', () => {
  it('builds the event token from the header plus body.action', () => {
    // THE resource is ONLY in the header — the body has no type/event field.
    expect(eventToken('issue', 'created')).toBe('issue.created');
    expect(eventToken('event_alert', 'triggered')).toBe('event_alert.triggered');
    expect(eventToken('preprod_artifact', 'size_analysis_completed')).toBe(
      'preprod_artifact.size_analysis_completed'
    );
  });

  it('degrades gracefully when either half is missing', () => {
    expect(eventToken(undefined, 'created')).toBe('unknown.created');
    expect(eventToken('issue', undefined)).toBe('issue.unknown');
  });
});

describe('isTimestampFresh (unit)', () => {
  it('accepts everything when no tolerance is configured', () => {
    // The timestamp is NOT signed, so a tolerance check is opt-in by design.
    expect(isTimestampFresh('0', undefined)).toBe(true);
    expect(isTimestampFresh('0', 0)).toBe(true);
    expect(isTimestampFresh('0', NaN)).toBe(true);
  });

  it('accepts a fresh timestamp in UNIX SECONDS', () => {
    expect(isTimestampFresh(nowSeconds(), 300)).toBe(true);
  });

  it('rejects a stale timestamp when a tolerance is configured', () => {
    expect(isTimestampFresh(String(Math.floor(Date.now() / 1000) - 3600), 300)).toBe(false);
  });

  it('rejects milliseconds mistaken for seconds', () => {
    expect(isTimestampFresh(String(Date.now()), 300)).toBe(false);
  });

  it('accepts when the header is absent or unparseable', () => {
    // Rejecting on a header Sentry does not sign would drop real traffic for no
    // security gain.
    expect(isTimestampFresh(undefined, 300)).toBe(true);
    expect(isTimestampFresh('not-a-number', 300)).toBe(true);
  });
});

describe('POST /webhooks/sentry', () => {
  it('accepts a valid issue.created delivery', async () => {
    const body = JSON.stringify(ISSUE_CREATED);
    const res = await postWebhook(body, { resource: 'issue' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('accepts installation.created', async () => {
    const body = JSON.stringify(INSTALLATION_CREATED);
    const res = await postWebhook(body, { resource: 'installation' });
    expect(res.status).toBe(200);
  });

  it('accepts comment.created', async () => {
    const body = JSON.stringify(COMMENT_CREATED);
    const res = await postWebhook(body, { resource: 'comment' });
    expect(res.status).toBe(200);
  });

  it('accepts event_alert.triggered (the ISSUE-ALERT resource)', async () => {
    const body = JSON.stringify(EVENT_ALERT_TRIGGERED);
    const res = await postWebhook(body, { resource: 'event_alert' });
    expect(res.status).toBe(200);
  });

  it('accepts metric_alert.critical', async () => {
    const body = JSON.stringify(METRIC_ALERT_CRITICAL);
    const res = await postWebhook(body, { resource: 'metric_alert' });
    expect(res.status).toBe(200);
  });

  it('accepts the undocumented metric_alert.open', async () => {
    const body = JSON.stringify({ ...METRIC_ALERT_CRITICAL, action: 'open' });
    const res = await postWebhook(body, { resource: 'metric_alert' });
    expect(res.status).toBe(200);
  });

  it('accepts seer.pr_created', async () => {
    const body = JSON.stringify(SEER_PR_CREATED);
    const res = await postWebhook(body, { resource: 'seer' });
    expect(res.status).toBe(200);
  });

  it('accepts a FAILED preprod_artifact.size_analysis_completed', async () => {
    const body = JSON.stringify(PREPROD_SIZE_FAILED);
    const res = await postWebhook(body, { resource: 'preprod_artifact' });
    expect(res.status).toBe(200);
  });

  it('accepts both issue.ignored and the issue.archived alias', async () => {
    for (const action of ['ignored', 'archived']) {
      const body = JSON.stringify({
        ...ISSUE_CREATED,
        action,
        data: { issue: { id: '100', status: 'ignored', substatus: 'archived_forever' } },
      });
      const res = await postWebhook(body, { resource: 'issue' });
      expect(res.status).toBe(200);
    }
  });

  it('accepts a delivery signed with Sentry-App-Signature', async () => {
    const body = JSON.stringify(ISSUE_CREATED);
    const res = await postWebhook(body, {
      resource: 'issue',
      headerName: 'Sentry-App-Signature',
    });
    expect(res.status).toBe(200);
  });

  it('accepts an EMPTY body with a valid signature over ""', async () => {
    // Sentry really does send these; a JSON parser must not 400 on them.
    const res = await request(app)
      .post('/webhooks/sentry')
      .set('Content-Type', 'application/json')
      .set('Sentry-Hook-Resource', 'issue')
      .set('Sentry-Hook-Timestamp', nowSeconds())
      .set('Request-ID', 'd1e1b1c1a1f1e1d1c1b1a1f1e1d1c1b1')
      .set('Sentry-Hook-Signature', generateSignature(''))
      .send('');
    expect(res.status).toBe(200);
  });

  it('accepts a non-ASCII payload (raw-body verification)', async () => {
    const body = '{"action":"created","data":{"issue":{"id":"1","title":"Café 💥"}}}';
    const res = await postWebhook(body, { resource: 'issue' });
    expect(res.status).toBe(200);
  });

  it('rejects a tampered body with 401', async () => {
    const signed = JSON.stringify(ISSUE_CREATED);
    const res = await postWebhook(JSON.stringify({ ...ISSUE_CREATED, action: 'resolved' }), {
      resource: 'issue',
      signature: generateSignature(signed),
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid signature');
  });

  it('rejects a missing signature header with 401', async () => {
    const res = await postWebhook(JSON.stringify(ISSUE_CREATED), {
      resource: 'issue',
      signature: null,
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Missing signature header');
  });

  it('rejects a garbage signature with 401, not 500', async () => {
    const res = await postWebhook(JSON.stringify(ISSUE_CREATED), {
      resource: 'issue',
      signature: 'nope',
    });
    expect(res.status).toBe(401);
  });

  it('rejects valid-signature invalid-JSON with 400', async () => {
    const body = 'not json at all';
    const res = await postWebhook(body, { resource: 'issue' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON');
  });

  it('still verifies when the Sentry-Hook-Resource header is absent', async () => {
    // The signature covers only the body, so a missing resource header is a
    // routing problem (token becomes `unknown.created`), not an auth failure.
    const res = await postWebhook(JSON.stringify(ISSUE_CREATED), { resource: null });
    expect(res.status).toBe(200);
  });

  it('fails closed with 500 when SENTRY_CLIENT_SECRET is unset', async () => {
    const saved = process.env.SENTRY_CLIENT_SECRET;
    delete process.env.SENTRY_CLIENT_SECRET;
    try {
      const res = await postWebhook(JSON.stringify(ISSUE_CREATED), { resource: 'issue' });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Webhook client secret not configured');
    } finally {
      process.env.SENTRY_CLIENT_SECRET = saved;
    }
  });

  it('rejects a stale timestamp with 400 when a tolerance is configured', async () => {
    process.env.SENTRY_WEBHOOK_TOLERANCE_SECONDS = '300';
    try {
      const res = await postWebhook(JSON.stringify(ISSUE_CREATED), {
        resource: 'issue',
        timestamp: String(Math.floor(Date.now() / 1000) - 3600),
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Stale timestamp');
    } finally {
      delete process.env.SENTRY_WEBHOOK_TOLERANCE_SECONDS;
    }
  });

  it('accepts a stale timestamp when no tolerance is configured (default)', async () => {
    const res = await postWebhook(JSON.stringify(ISSUE_CREATED), {
      resource: 'issue',
      timestamp: '1',
    });
    expect(res.status).toBe(200);
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
