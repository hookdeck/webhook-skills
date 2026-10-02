// Generated with: sentry-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * SENTRY INTEGRATION PLATFORM WEBHOOK VERIFICATION
 *
 *   algorithm : HMAC-SHA256
 *   encoding  : lowercase HEX (.hexdigest()) — NOT base64
 *   signed    : the RAW request body bytes, nothing else
 *   key       : the integration's CLIENT SECRET (Settings -> Developer
 *               Settings -> your integration -> Client Secret), used AS-IS as
 *               raw UTF-8. NOT the Client ID, NOT an auth token, NOT a DSN.
 *   header    : Sentry-Hook-Signature, falling back to Sentry-App-Signature
 *
 * The header value is a BARE 64-character hex digest: no prefix, no `v1=`, no
 * `t=`, no comma-separated list, exactly one signature.
 *
 * Sentry's own server (SentryApp.build_signature):
 *   hmac.new(key=secret.encode("utf-8"), msg=body.encode("utf-8"),
 *            digestmod=sha256).hexdigest()
 *
 * THE TIMESTAMP IS NOT SIGNED. Sentry-Hook-Timestamp is sent but excluded from
 * the signed string, so there is NO cryptographic replay protection — an
 * attacker replaying a captured body+signature can forge the timestamp freely.
 * The optional tolerance check below is a cheap dampener only. Real protection
 * is deduplication on the Request-ID header.
 *
 * ROUTING: the resource is ONLY in the Sentry-Hook-Resource header. The body
 * has NO `type` and NO `event` field, only `action`. The event token is
 * `header + "." + body.action`, e.g. 'issue' + 'created' -> 'issue.created'.
 *
 * No SDK does this: @sentry/* are error-reporting SDKs and ship no
 * webhook-signature verify helper. Manual HMAC with node:crypto is the only
 * option. Do NOT add @sentry/nextjs as a dependency for this.
 */

/**
 * Who triggered the action. `id` is `string | number`: when Sentry itself acts
 * it sends {"type": "application", "id": "sentry", "name": "Sentry"} — the
 * STRING "sentry". When another integration acts, id is that app's uuid.
 */
export interface SentryActor {
  type: 'user' | 'application' | string;
  id: string | number;
  name?: string;
}

/**
 * The Integration Platform envelope. Note what is MISSING: there is no `type`
 * or `event` field — the resource lives in the Sentry-Hook-Resource header.
 */
export interface SentryWebhookEvent {
  action?: string;
  installation?: { uuid?: string };
  /** Resource-specific AND customizable via UI components — treat defensively. */
  data?: Record<string, any>;
  actor?: SentryActor;
  /** Optional "Sentry {resource}.{action}: {url}" summary on some alerts. */
  text?: string;
}

type HeaderSource = Headers | Record<string, string | undefined>;

function getHeader(headers: HeaderSource, name: string): string | undefined {
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) ?? undefined;
  }
  return (headers as Record<string, string | undefined>)[name];
}

/**
 * Verify a Sentry webhook signature.
 *
 * @param rawBody      RAW, unparsed request body (may be EMPTY — some Sentry
 *                     requests arrive with an empty body and the signature is
 *                     then the HMAC of the empty string)
 * @param headers      Request headers (Headers, or a lowercased plain object)
 * @param clientSecret SENTRY_CLIENT_SECRET
 */
export function verifySentrySignature(
  rawBody: Buffer | string | null | undefined,
  headers: HeaderSource,
  clientSecret: string | undefined
): boolean {
  // Fail closed: no secret configured is a rejection, never a bypass.
  if (!clientSecret) return false;

  // Sentry-Hook-Signature on subscribed webhooks. Sentry-App-Signature on
  // UI-component external requests (select_options.requested,
  // external_issue.created/linked, alert_rule_action.requested) — same
  // build_signature, different header name. Sentry's own reference app checks
  // both, commented: "HACK: The signature header may be one of these two
  // values".
  const received =
    getHeader(headers, 'sentry-hook-signature') ||
    getHeader(headers, 'sentry-app-signature');
  if (!received) return false;

  // RAW BODY BYTES. Sentry's documented snippets re-serialize a parsed body
  // (JSON.stringify(request.body) / json.dumps(request.body)) and that is a
  // LATENT BUG: Sentry serializes with ensure_ascii=True, emitting \uXXXX
  // escapes, while JSON.stringify emits literal UTF-8. Any accent or emoji in
  // an issue title, comment or username therefore produces different bytes and
  // the re-serializing snippet rejects a VALID delivery.
  //
  // `rawBody ?? ''` is deliberate: an empty body is legitimate.
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody ?? '', 'utf8');

  const expected = crypto
    .createHmac('sha256', clientSecret) // Client Secret AS-IS — never decoded
    .update(body)
    .digest('hex'); // lowercase hex, NOT base64

  const a = Buffer.from(String(received).trim(), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // Length FIRST — timingSafeEqual THROWS on mismatched lengths, and an
  // uncaught throw becomes a 500. Sentry does not retry 500s; repeated
  // failures trip a circuit breaker that can DISABLE the webhook.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Optional replay dampener on Sentry-Hook-Timestamp (UNIX SECONDS).
 *
 * NOT a cryptographic check — the timestamp is not part of the signed string,
 * so a determined attacker forges it. Returns true (accept) when no tolerance
 * is configured or the header is absent/unparseable, because rejecting on a
 * header Sentry does not sign would drop real traffic for no security gain.
 */
export function isTimestampFresh(
  timestampHeader: string | null | undefined,
  toleranceSeconds: number | undefined
): boolean {
  if (!toleranceSeconds || toleranceSeconds <= 0) return true; // not configured
  const ts = Number(timestampHeader);
  if (timestampHeader == null || timestampHeader === '' || !Number.isFinite(ts)) {
    return true; // nothing to check against
  }
  return Math.abs(Math.floor(Date.now() / 1000) - ts) <= toleranceSeconds;
}

/**
 * Recover the event token Sentry does NOT put in the body.
 *
 * `issue` + `created` -> `issue.created`. Anything that switches on a body
 * field alone will never fire.
 */
export function eventToken(
  resourceHeader: string | null | undefined,
  action: string | null | undefined
): string {
  return `${resourceHeader || 'unknown'}.${action || 'unknown'}`;
}

export async function POST(request: NextRequest) {
  // Read the RAW body FIRST. Never call request.json() before verifying — it
  // consumes the stream, a parsed object cannot be re-serialized byte for
  // byte, and it throws on Sentry's legitimate EMPTY body.
  const rawBody = await request.text();

  const clientSecret = process.env.SENTRY_CLIENT_SECRET;

  // FAIL CLOSED on misconfiguration. 500 (not 401) so an operator can tell
  // "my server is misconfigured" apart from "someone sent a bad signature".
  if (!clientSecret) {
    console.error('SENTRY_CLIENT_SECRET is not set — refusing to accept unverified webhooks');
    return NextResponse.json({ error: 'Webhook client secret not configured' }, { status: 500 });
  }

  // Headers.get() is case-insensitive; Sentry sends them title-cased.
  const resource = request.headers.get('sentry-hook-resource');
  const requestId = request.headers.get('request-id');
  const timestamp = request.headers.get('sentry-hook-timestamp');

  // There is NO handshake, NO challenge and NO validation request. An unsigned
  // request is not one to trust.
  if (
    !request.headers.get('sentry-hook-signature') &&
    !request.headers.get('sentry-app-signature')
  ) {
    console.error('Missing Sentry-Hook-Signature / Sentry-App-Signature header');
    return NextResponse.json({ error: 'Missing signature header' }, { status: 401 });
  }

  if (!verifySentrySignature(rawBody, request.headers, clientSecret)) {
    console.error('Sentry webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const tolerance = Number(process.env.SENTRY_WEBHOOK_TOLERANCE_SECONDS);
  if (!isTimestampFresh(timestamp, tolerance)) {
    console.error(`Sentry-Hook-Timestamp outside ${tolerance}s tolerance: ${timestamp}`);
    return NextResponse.json({ error: 'Stale timestamp' }, { status: 400 });
  }

  // Verified — only now is it safe to parse. An EMPTY body is legitimate
  // (select_options.requested signs ""), so treat it as an empty envelope
  // rather than a parse error.
  let event: SentryWebhookEvent = {};
  if (rawBody.length > 0) {
    try {
      event = JSON.parse(rawBody);
    } catch (err) {
      console.error('Verified request had an unparseable body:', (err as Error).message);
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
  }

  /**
   * IDEMPOTENCY KEY: the Request-ID header (per-request uuid4 hex).
   *
   * The body has NO delivery id. And because the timestamp is not signed, a
   * byte-for-byte replay carries a genuinely valid signature forever —
   * deduplication on Request-ID is your ONLY real replay protection.
   */
  const token = eventToken(resource, event.action);

  console.log(
    `✓ Verified Sentry webhook: ${token} (Request-ID ${requestId || 'n/a'}, ` +
      `installation ${event.installation?.uuid})`
  );

  // Sentry: "Webhooks should respond within 1 second. Otherwise, the response
  // is considered a timeout." Sentry does NOT retry, and repeated failures
  // trip a circuit breaker that can disable the webhook. The work here is
  // trivial logging; for anything real, enqueue it (or use `after()` from
  // next/server) and return immediately.
  try {
    handleEvent(token, event);
  } catch (err) {
    console.error(`Error handling Sentry event ${token} (${requestId}):`, err);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

function describeActor(actor: SentryActor | undefined): string {
  if (!actor) return 'unknown actor';
  return `${actor.name || actor.id} (${actor.type})`;
}

function handleEvent(token: string, event: SentryWebhookEvent): void {
  // TODO: check the Request-ID against your store and return early if seen.

  // `data` is resource-specific AND customizable via UI components, so
  // optional-chain everything in it.
  const data = event.data || {};

  switch (token) {
    // --- Installation (public integrations) ---------------------------------
    case 'installation.created':
      // No handshake precedes this — it IS the first traffic for a public app.
      console.log(
        `🔌 Installed by ${describeActor(event.actor)} in org ` +
          `${data.installation?.organization?.slug} (installation ${data.installation?.uuid})`
      );
      break;
    case 'installation.deleted':
      console.log(`🔌 Uninstalled: installation ${data.installation?.uuid}`);
      break;

    // --- Issues -------------------------------------------------------------
    case 'issue.created':
      // Fires for the OUTAGE, ERROR and FEEDBACK categories — branch on
      // issueCategory before assuming a stack trace exists.
      console.log(
        `🐛 Issue created: ${data.issue?.id} "${data.issue?.title}" ` +
          `[${data.issue?.issueCategory}/${data.issue?.issueType}]`
      );
      break;
    case 'issue.resolved':
      console.log(`✅ Issue resolved: ${data.issue?.id} by ${describeActor(event.actor)}`);
      break;
    case 'issue.assigned':
      console.log(`👤 Issue assigned: ${data.issue?.id} -> ${data.issue?.assignedTo?.name || 'unknown'}`);
      break;
    case 'issue.unresolved':
      console.log(`♻️  Issue unresolved: ${data.issue?.id} (substatus ${data.issue?.substatus})`);
      break;
    // THE WIRE TOKEN IS issue.ignored. The docs call the action "archived",
    // and issue.archived is kept as an equivalent alias. HANDLE BOTH.
    case 'issue.ignored':
    case 'issue.archived':
      console.log(`🔇 Issue archived/ignored: ${data.issue?.id} (substatus ${data.issue?.substatus})`);
      break;

    // --- Errors (Business plan and above only) ------------------------------
    case 'error.created':
      console.log(`💥 Error created: issue ${data.error?.issue_id} (${data.error?.web_url})`);
      break;

    // --- Comments -----------------------------------------------------------
    case 'comment.created':
    case 'comment.updated':
    case 'comment.deleted':
      console.log(
        `💬 Comment ${event.action}: ${data.comment_id} on issue ${data.issue_id} ` +
          `(${data.project_slug})`
      );
      break;

    // --- Issue alerts -------------------------------------------------------
    // The header says `event_alert`, NOT `issue_alert`. A handler keyed on
    // "issue_alert.triggered" will never fire.
    case 'event_alert.triggered': {
      // data.event.tags is an ARRAY OF [key, value] PAIRS, not an object.
      const tags = Object.fromEntries(Array.isArray(data.event?.tags) ? data.event.tags : []);
      console.log(
        `🚨 Issue alert triggered by rule "${data.triggered_rule}": ` +
          `issue ${data.event?.issue_id} level=${tags.level} (${data.event?.web_url})`
      );
      break;
    }

    // --- Activity alerts ----------------------------------------------------
    case 'activity_alert.triggered':
      console.log(
        `🔔 Activity alert: ${data.activity?.type} on issue ${data.issue?.id} ` +
          `(${data.alert?.title} — ${data.alert?.web_url})`
      );
      break;

    // --- Metric alerts ------------------------------------------------------
    case 'metric_alert.critical':
    case 'metric_alert.warning':
    case 'metric_alert.resolved':
    // metric_alert.open is in Sentry's server enum but NOT in the docs' list.
    case 'metric_alert.open':
      console.log(
        `📈 Metric alert ${event.action}: ${data.description_title} — ` +
          `${data.description_text} (${data.web_url})`
      );
      break;

    // --- Seer ---------------------------------------------------------------
    // data.run_id + data.group_id correlate every event in one Seer run.
    // pr_ready_for_review, iteration_started and iteration_completed are in the
    // server enum but not yet on the docs page.
    case 'seer.root_cause_started':
    case 'seer.root_cause_completed':
    case 'seer.solution_started':
    case 'seer.solution_completed':
    case 'seer.coding_started':
    case 'seer.coding_completed':
    case 'seer.iteration_started':
    case 'seer.iteration_completed':
      console.log(`🤖 Seer ${event.action}: run ${data.run_id} on issue ${data.group_id}`);
      break;
    case 'seer.pr_created':
    case 'seer.pr_ready_for_review': {
      // {pull_request: {pr_number, pr_url, pr_id}, repo_name, provider} —
      // the PR fields are NESTED under `pull_request`.
      const entry = (data.pull_requests || [])[0];
      const pr = entry?.pull_request;
      console.log(
        `🤖 Seer ${event.action}: #${pr?.pr_number} ${pr?.pr_url} (${entry?.repo_name})`
      );
      break;
    }

    // --- Pre-production artifacts -------------------------------------------
    // CAMELCASE KEYS HERE, and a *_completed action CAN mean failure: branch
    // on `state`, not on the action name.
    case 'preprod_artifact.size_analysis_completed':
    case 'preprod_artifact.build_distribution_completed':
      if (data.state === 'FAILED') {
        console.log(
          `📱 ${event.action} FAILED for build ${data.buildId}: ${data.errorCode} ${data.errorMessage}`
        );
      } else {
        console.log(`📱 ${event.action} for build ${data.buildId} (${data.projectSlug})`);
      }
      break;

    default:
      // New resources and actions land in Sentry's server enum ahead of the docs.
      console.log(`ℹ️  Unhandled Sentry event: ${token}`);
  }
}
