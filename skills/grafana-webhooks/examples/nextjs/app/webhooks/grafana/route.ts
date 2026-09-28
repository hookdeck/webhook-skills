// Generated with: grafana-webhooks skill
// https://github.com/hookdeck/webhook-skills
//
// Grafana Alerting webhook contact point receiver (Next.js App Router).
//
// Grafana signs with HMAC-SHA256 and writes a BARE lowercase hex digest into a
// user-configurable header (default: X-Grafana-Alerting-Signature). There is no
// `sha256=` prefix and no `t=...,v1=...` structure.
//
// What is signed depends on whether the contact point has a Timestamp Header:
//   timestamp header UNSET : HMAC(rawBody)
//   timestamp header SET   : HMAC(timestamp + ":" + rawBody)   <- COLON, seconds
//
// The secret is used AS-IS as UTF-8 bytes: not base64-decoded, no prefix, and not
// a Grafana API key or service-account token.
//
// Grafana sends NO event-type header and NO delivery id. Each request is one
// notification for an alert GROUP; dispatch on `status` / `state` / alerts[].status.

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Never let a build-time cache serve this route.
export const dynamic = 'force-dynamic';

export interface GrafanaAlert {
  status: 'firing' | 'resolved';
  labels: Record<string, string>;
  annotations: Record<string, string>;
  startsAt: string;
  /** "0001-01-01T00:00:00Z" (Go's zero time) while the alert is still firing. */
  endsAt: string;
  generatorURL?: string;
  fingerprint: string;
  silenceURL?: string;
  dashboardURL?: string;
  panelURL?: string;
  /** Present only when image rendering is configured. */
  imageURL?: string;
  values?: Record<string, number>;
}

export interface GrafanaNotification {
  /** Name of the contact point that delivered this notification. */
  receiver: string;
  /** Group status — `firing` if ANY alert in the group is firing. */
  status: 'firing' | 'resolved';
  orgId: number;
  alerts: GrafanaAlert[];
  groupLabels: Record<string, string>;
  commonLabels: Record<string, string>;
  commonAnnotations: Record<string, string>;
  externalURL: string;
  /** Payload format version — currently "1". */
  version: string;
  groupKey: string;
  /** How many alerts were dropped by the contact point's Max Alerts setting. */
  truncatedAlerts: number;
  title: string;
  state: 'alerting' | 'ok';
  message: string;
}

export interface VerifyOptions {
  timestampRequired?: boolean;
  maxAgeSeconds?: number;
}

/**
 * Read the header names and replay window from the environment.
 *
 * Both header names are configured on the Grafana contact point, so they come
 * from config rather than being hard-coded. The signature header has a
 * documented default; the timestamp header has NONE — leaving it empty means
 * Grafana signs the body alone.
 *
 * Read per request so a serverless instance picks up config without a cold start.
 */
export function getConfig() {
  const timestampHeader = (process.env.GRAFANA_TIMESTAMP_HEADER || '').trim();
  return {
    signatureHeader: (
      process.env.GRAFANA_SIGNATURE_HEADER || 'X-Grafana-Alerting-Signature'
    ).trim(),
    timestampHeader,
    // Our replay window, not Grafana's — Grafana documents no tolerance. Only
    // meaningful when a timestamp header is configured.
    maxAgeSeconds: Number(process.env.GRAFANA_MAX_AGE_SECONDS || 300),
    timestampRequired: Boolean(timestampHeader),
  };
}

/**
 * Verify a Grafana Alerting webhook signature.
 *
 * @param rawBody   RAW, unparsed request body.
 * @param signature Value of the configured signature header.
 * @param timestamp Value of the configured timestamp header, or null.
 * @param secret    Contact point HMAC secret, used as-is.
 */
export function verifyGrafanaSignature(
  rawBody: string | Buffer,
  signature: string | null | undefined,
  timestamp: string | null | undefined,
  secret: string | undefined,
  options: VerifyOptions = {}
): boolean {
  const { timestampRequired = false, maxAgeSeconds = 300 } = options;

  // Fail closed: HMAC is optional in Grafana, but it is mandatory here.
  if (!secret || !signature) return false;

  if (timestampRequired) {
    // We're configured for timestamped signing, so a request without the header
    // cannot have been signed the way we expect. Rejecting it stops an attacker
    // from downgrading us to the weaker body-only mode.
    if (!timestamp) return false;

    const ts = Number(timestamp); // UNIX SECONDS (10 digits), never milliseconds
    if (!Number.isFinite(ts)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - ts) > maxAgeSeconds) return false;
  }

  const hmac = crypto.createHmac('sha256', secret);
  if (timestampRequired) {
    hmac.update(`${timestamp}:`); // COLON separator — HMAC(timestamp + ":" + body)
  }
  // Hash the RAW bytes. With the Custom Payload option the body may be
  // pretty-printed or not JSON at all, so re-serializing parsed JSON is wrong.
  hmac.update(rawBody);
  const expected = hmac.digest('hex'); // lowercase hex, bare

  // timingSafeEqual THROWS on differing lengths — guard first.
  const received = Buffer.from(signature.trim().toLowerCase(), 'utf8');
  const want = Buffer.from(expected, 'utf8');
  if (received.length !== want.length) return false;
  return crypto.timingSafeEqual(received, want);
}

/**
 * Build a heuristic idempotency key. Grafana sends no delivery id, so this is
 * derived from the group identity plus the alert instances it carries. Repeat
 * notifications for an unchanged group hash identically.
 */
export function idempotencyKey(payload: Partial<GrafanaNotification>): string {
  const alerts = (payload.alerts || [])
    .map((a) => `${a.fingerprint || ''}@${a.startsAt || ''}`)
    .sort()
    .join(',');
  return `${payload.groupKey || ''}:${payload.status || ''}:${alerts}`;
}

export async function POST(request: NextRequest) {
  const secret = process.env.GRAFANA_WEBHOOK_SECRET;
  if (!secret) {
    // Fail CLOSED. Never silently accept unsigned requests.
    console.error('GRAFANA_WEBHOOK_SECRET is not set — refusing to accept webhooks');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const { signatureHeader, timestampHeader, timestampRequired, maxAgeSeconds } = getConfig();

  // Read the RAW body before anything else — these are the bytes Grafana signed.
  const rawBody = await request.text();

  // Headers.get() is case-insensitive.
  const signature = request.headers.get(signatureHeader);
  if (!signature) {
    return NextResponse.json(
      { error: `Missing ${signatureHeader} header` },
      { status: 400 }
    );
  }

  const timestamp = timestampHeader ? request.headers.get(timestampHeader) : null;

  if (
    !verifyGrafanaSignature(rawBody, signature, timestamp, secret, {
      timestampRequired,
      maxAgeSeconds,
    })
  ) {
    console.error('Grafana webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Parse only AFTER verification.
  let payload: GrafanaNotification;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // A Custom Payload template can render non-JSON. If you use one, handle the
    // body in whatever format your template emits instead.
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  console.log(
    `Notification from contact point "${payload.receiver}" ` +
      `(status=${payload.status}, state=${payload.state}, key=${idempotencyKey(payload)})`
  );

  if (payload.truncatedAlerts) {
    console.warn(`${payload.truncatedAlerts} alert(s) truncated by Max Alerts`);
  }

  // There are NO event types. Dispatch on the group status...
  switch (payload.status) {
    case 'firing':
      console.log(`FIRING: ${payload.title}`);
      // TODO: open an incident, page on-call, create a ticket
      break;

    case 'resolved':
      console.log(`RESOLVED: ${payload.title}`);
      // TODO: close the incident, post an all-clear
      break;

    default:
      console.log(`Unknown group status: ${payload.status}`);
  }

  // ...and on each alert, because a `firing` GROUP can contain `resolved` alerts
  // (the group is firing if ANY member is firing).
  for (const alert of payload.alerts || []) {
    const name = alert.labels?.alertname || '(unnamed)';
    if (alert.status === 'firing') {
      console.log(`  firing:   ${name} — ${alert.annotations?.summary || ''}`);
    } else if (alert.status === 'resolved') {
      console.log(`  resolved: ${name} (ended ${alert.endsAt})`);
    }
  }

  // Grafana treats any 2xx as success.
  return NextResponse.json({ received: true });
}
