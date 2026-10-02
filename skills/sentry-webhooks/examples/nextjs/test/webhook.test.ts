// Generated with: sentry-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import {
  POST,
  verifySentrySignature,
  isTimestampFresh,
  eventToken,
} from '../app/webhooks/sentry/route';

// A Sentry Client Secret is a 64-character hex string, used AS-IS as a raw
// UTF-8 HMAC key (never decoded).
const CLIENT_SECRET = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

/**
 * Generate a real Sentry signature exactly as Sentry does:
 * HMAC-SHA256 over the RAW body, keyed with the Client Secret used as-is,
 * lowercase hex. Mirrors SentryApp.build_signature.
 */
function generateSignature(rawBody: string, secret: string = CLIENT_SECRET): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

function nowSeconds(): string {
  return String(Math.floor(Date.now() / 1000));
}

interface PostOptions {
  resource?: string | null;
  signature?: string | null;
  headerName?: string;
  timestamp?: string | null;
}

/** Build a NextRequest carrying the headers Sentry really sends. */
function makeRequest(rawBody: string, opts: PostOptions = {}): NextRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Request-ID': crypto.randomUUID().replace(/-/g, ''),
  };
  if (opts.resource !== null) headers['Sentry-Hook-Resource'] = opts.resource || 'issue';
  if (opts.timestamp !== null) headers['Sentry-Hook-Timestamp'] = opts.timestamp || nowSeconds();
  if (opts.signature !== null) {
    headers[opts.headerName || 'Sentry-Hook-Signature'] =
      opts.signature === undefined ? generateSignature(rawBody) : opts.signature;
  }
  return new NextRequest('http://localhost:3000/webhooks/sentry', {
    method: 'POST',
    headers,
    body: rawBody,
  });
}

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

// Issue alerts: resource is `event_alert`, NOT `issue_alert`. tags are PAIRS.
const EVENT_ALERT_TRIGGERED = {
  action: 'triggered',
  installation: { uuid: 'a8e5d37a-696c-4c54-adb5-b3f28d64c7de' },
  data: {
    event: {
      issue_id: '100',
      web_url: 'https://sentry.io/organizations/test-org/issues/100/events/d1e1/',
      tags: [
        ['browser', 'Chrome 75.0.3770'],
        ['level', 'error'],
      ],
    },
    triggered_rule: 'Very Important Alert Rule!',
  },
  actor: { type: 'application', id: 'sentry', name: 'Sentry' },
};

// preprod_artifact uses camelCase, and a *_completed action can mean FAILED.
const PREPROD_SIZE_FAILED = {
  action: 'size_analysis_completed',
  installation: { uuid: 'a8e5d37a-696c-4c54-adb5-b3f28d64c7de' },
  data: {
    buildId: 'build_abc123',
    projectSlug: 'mobile-app',
    state: 'FAILED',
    errorCode: 'ARTIFACT_PROCESSING_ERROR',
    errorMessage: 'Could not unpack the artifact',
  },
  actor: { type: 'application', id: 'sentry', name: 'Sentry' },
};

beforeEach(() => {
  process.env.SENTRY_CLIENT_SECRET = CLIENT_SECRET;
  delete process.env.SENTRY_WEBHOOK_TOLERANCE_SECONDS;
});

afterEach(() => {
  delete process.env.SENTRY_WEBHOOK_TOLERANCE_SECONDS;
});

describe('verifySentrySignature (unit)', () => {
  const body = JSON.stringify(ISSUE_CREATED);

  test('accepts a valid Sentry-Hook-Signature', () => {
    const headers = { 'sentry-hook-signature': generateSignature(body) };
    expect(verifySentrySignature(body, headers, CLIENT_SECRET)).toBe(true);
  });

  test('accepts a Headers object (case-insensitive lookup)', () => {
    const headers = new Headers({ 'Sentry-Hook-Signature': generateSignature(body) });
    expect(verifySentrySignature(body, headers, CLIENT_SECRET)).toBe(true);
  });

  test('falls back to Sentry-App-Signature (UI-component requests)', () => {
    const headers = { 'sentry-app-signature': generateSignature(body) };
    expect(verifySentrySignature(body, headers, CLIENT_SECRET)).toBe(true);
  });

  test('rejects a tampered body', () => {
    const headers = { 'sentry-hook-signature': generateSignature(body) };
    const tampered = JSON.stringify({ ...ISSUE_CREATED, action: 'resolved' });
    expect(verifySentrySignature(tampered, headers, CLIENT_SECRET)).toBe(false);
  });

  test('rejects a signature made with a different secret', () => {
    const headers = { 'sentry-hook-signature': generateSignature(body, 'b'.repeat(64)) };
    expect(verifySentrySignature(body, headers, CLIENT_SECRET)).toBe(false);
  });

  test('fails closed when no client secret is configured', () => {
    const headers = { 'sentry-hook-signature': generateSignature(body) };
    expect(verifySentrySignature(body, headers, undefined)).toBe(false);
    expect(verifySentrySignature(body, headers, '')).toBe(false);
  });

  test('rejects a base64 digest — Sentry is HEX', () => {
    const b64 = crypto.createHmac('sha256', CLIENT_SECRET).update(body).digest('base64');
    expect(verifySentrySignature(body, { 'sentry-hook-signature': b64 }, CLIENT_SECRET)).toBe(false);
  });

  test('rejects a Stripe-style timestamp.body signature — the timestamp is NOT signed', () => {
    const wrong = generateSignature(`${nowSeconds()}.${body}`);
    expect(verifySentrySignature(body, { 'sentry-hook-signature': wrong }, CLIENT_SECRET)).toBe(false);
  });

  test('rejects a decoded-secret signature — the Client Secret is used AS-IS', () => {
    const wrong = crypto
      .createHmac('sha256', Buffer.from(CLIENT_SECRET, 'hex'))
      .update(body)
      .digest('hex');
    expect(verifySentrySignature(body, { 'sentry-hook-signature': wrong }, CLIENT_SECRET)).toBe(false);
  });

  test('does not throw on a short/garbage signature (length guard)', () => {
    expect(() =>
      verifySentrySignature(body, { 'sentry-hook-signature': 'abc' }, CLIENT_SECRET)
    ).not.toThrow();
  });

  test('accepts an EMPTY body signed over ""', () => {
    const sig = generateSignature('');
    expect(verifySentrySignature('', { 'sentry-hook-signature': sig }, CLIENT_SECRET)).toBe(true);
    expect(verifySentrySignature('{}', { 'sentry-hook-signature': sig }, CLIENT_SECRET)).toBe(false);
  });

  test('verifies a non-ASCII payload from the RAW bytes, not a re-serialization', () => {
    // Sentry emits \uXXXX escapes (ensure_ascii=True); JSON.stringify emits
    // literal UTF-8. Re-serializing a parsed body rejects a VALID delivery.
    const asciiEscaped = '{"action":"created","data":{"issue":{"title":"Caf\\u00e9 \\ud83d\\udca5"}}}';
    const reserialized = JSON.stringify(JSON.parse(asciiEscaped));
    const sig = generateSignature(asciiEscaped);

    expect(reserialized).not.toBe(asciiEscaped);
    expect(verifySentrySignature(asciiEscaped, { 'sentry-hook-signature': sig }, CLIENT_SECRET)).toBe(true);
    expect(verifySentrySignature(reserialized, { 'sentry-hook-signature': sig }, CLIENT_SECRET)).toBe(false);
  });
});

describe('eventToken (unit)', () => {
  test('builds the event token from the header plus body.action', () => {
    expect(eventToken('issue', 'created')).toBe('issue.created');
    expect(eventToken('event_alert', 'triggered')).toBe('event_alert.triggered');
  });

  test('degrades gracefully when either half is missing', () => {
    expect(eventToken(null, 'created')).toBe('unknown.created');
    expect(eventToken('issue', undefined)).toBe('issue.unknown');
  });
});

describe('isTimestampFresh (unit)', () => {
  test('accepts everything when no tolerance is configured', () => {
    expect(isTimestampFresh('0', undefined)).toBe(true);
    expect(isTimestampFresh('0', NaN)).toBe(true);
  });

  test('accepts a fresh timestamp in UNIX SECONDS', () => {
    expect(isTimestampFresh(nowSeconds(), 300)).toBe(true);
  });

  test('rejects stale timestamps and milliseconds mistaken for seconds', () => {
    expect(isTimestampFresh(String(Math.floor(Date.now() / 1000) - 3600), 300)).toBe(false);
    expect(isTimestampFresh(String(Date.now()), 300)).toBe(false);
  });

  test('accepts when the header is absent or unparseable', () => {
    expect(isTimestampFresh(null, 300)).toBe(true);
    expect(isTimestampFresh('not-a-number', 300)).toBe(true);
  });
});

describe('POST /webhooks/sentry', () => {
  test.each([
    ['issue', ISSUE_CREATED],
    ['installation', INSTALLATION_CREATED],
    ['event_alert', EVENT_ALERT_TRIGGERED],
    ['preprod_artifact', PREPROD_SIZE_FAILED],
    ['metric_alert', { ...ISSUE_CREATED, action: 'open', data: {} }],
    ['issue', { ...ISSUE_CREATED, action: 'archived' }],
  ])('accepts a valid %s delivery', async (resource, payload) => {
    const res = await POST(makeRequest(JSON.stringify(payload), { resource }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  test('accepts a delivery signed with Sentry-App-Signature', async () => {
    const res = await POST(
      makeRequest(JSON.stringify(ISSUE_CREATED), { headerName: 'Sentry-App-Signature' })
    );
    expect(res.status).toBe(200);
  });

  test('accepts an EMPTY body with a valid signature over ""', async () => {
    const res = await POST(makeRequest(''));
    expect(res.status).toBe(200);
  });

  test('accepts a non-ASCII payload (raw-body verification)', async () => {
    const body = '{"action":"created","data":{"issue":{"id":"1","title":"Caf\\u00e9 \\ud83d\\udca5"}}}';
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
  });

  test('rejects a tampered body with 401', async () => {
    const signed = JSON.stringify(ISSUE_CREATED);
    const res = await POST(
      makeRequest(JSON.stringify({ ...ISSUE_CREATED, action: 'resolved' }), {
        signature: generateSignature(signed),
      })
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Invalid signature');
  });

  test('rejects a missing signature header with 401', async () => {
    const res = await POST(makeRequest(JSON.stringify(ISSUE_CREATED), { signature: null }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Missing signature header');
  });

  test('rejects a garbage signature with 401, not 500', async () => {
    const res = await POST(makeRequest(JSON.stringify(ISSUE_CREATED), { signature: 'nope' }));
    expect(res.status).toBe(401);
  });

  test('rejects valid-signature invalid-JSON with 400', async () => {
    const res = await POST(makeRequest('not json at all'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid JSON');
  });

  test('still verifies when the Sentry-Hook-Resource header is absent', async () => {
    const res = await POST(makeRequest(JSON.stringify(ISSUE_CREATED), { resource: null }));
    expect(res.status).toBe(200);
  });

  test('fails closed with 500 when SENTRY_CLIENT_SECRET is unset', async () => {
    delete process.env.SENTRY_CLIENT_SECRET;
    const res = await POST(makeRequest(JSON.stringify(ISSUE_CREATED)));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Webhook client secret not configured');
  });

  test('rejects a stale timestamp with 400 when a tolerance is configured', async () => {
    process.env.SENTRY_WEBHOOK_TOLERANCE_SECONDS = '300';
    const res = await POST(
      makeRequest(JSON.stringify(ISSUE_CREATED), {
        timestamp: String(Math.floor(Date.now() / 1000) - 3600),
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Stale timestamp');
  });

  test('accepts a stale timestamp when no tolerance is configured (default)', async () => {
    const res = await POST(makeRequest(JSON.stringify(ISSUE_CREATED), { timestamp: '1' }));
    expect(res.status).toBe(200);
  });
});
