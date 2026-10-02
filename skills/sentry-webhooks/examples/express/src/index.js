// Generated with: sentry-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

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
 * option. Do NOT add @sentry/node as a dependency for this.
 */

/**
 * Verify a Sentry webhook signature.
 *
 * @param {Buffer|string} rawBody RAW, unparsed request body (may be EMPTY —
 *   some Sentry requests arrive with an empty body and the signature is then
 *   the HMAC of the empty string)
 * @param {object} headers Incoming request headers (lowercased by Node)
 * @param {string|undefined} clientSecret SENTRY_CLIENT_SECRET
 * @returns {boolean}
 */
function verifySentrySignature(rawBody, headers, clientSecret) {
  // Fail closed: no secret configured is a rejection, never a bypass.
  if (!clientSecret) return false;

  // Sentry-Hook-Signature on subscribed webhooks. Sentry-App-Signature on
  // UI-component external requests (select_options.requested,
  // external_issue.created/linked, alert_rule_action.requested) — same
  // build_signature, different header name. Sentry's own reference app checks
  // both, commented: "HACK: The signature header may be one of these two
  // values".
  const received =
    headers['sentry-hook-signature'] || headers['sentry-app-signature'];
  if (!received) return false;

  // RAW BODY BYTES. Sentry's documented snippets re-serialize a parsed body
  // (JSON.stringify(request.body) / json.dumps(request.body)) and that is a
  // LATENT BUG: Sentry serializes with ensure_ascii=True, emitting \uXXXX
  // escapes, while JSON.stringify emits literal UTF-8. Any accent or emoji in
  // an issue title, comment or username therefore produces different bytes and
  // the re-serializing snippet rejects a VALID delivery.
  //
  // `rawBody ?? ''` is deliberate: an empty body is legitimate.
  const body = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(rawBody ?? '', 'utf8');

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
 *
 * @param {string|undefined} timestampHeader Sentry-Hook-Timestamp
 * @param {number|undefined} toleranceSeconds SENTRY_WEBHOOK_TOLERANCE_SECONDS
 * @returns {boolean}
 */
function isTimestampFresh(timestampHeader, toleranceSeconds) {
  if (!toleranceSeconds || toleranceSeconds <= 0) return true; // not configured
  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts)) return true; // nothing to check against
  return Math.abs(Math.floor(Date.now() / 1000) - ts) <= toleranceSeconds;
}

/**
 * Recover the event token Sentry does NOT put in the body.
 *
 * `issue` + `created` -> `issue.created`. Anything that switches on a body
 * field alone will never fire.
 *
 * @param {string|undefined} resourceHeader Sentry-Hook-Resource
 * @param {string|undefined} action body.action
 * @returns {string}
 */
function eventToken(resourceHeader, action) {
  return `${resourceHeader || 'unknown'}.${action || 'unknown'}`;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/**
 * Sentry webhook endpoint.
 *
 * express.raw() hands the handler a Buffer of the exact bytes Sentry sent.
 * NEVER mount express.json() ahead of this route: it consumes the stream, and
 * worse, it turns Sentry's legitimate EMPTY body into `{}` — signing `"{}"`
 * instead of `""` fails every time.
 */
app.post('/webhooks/sentry', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = req.body;

  if (!Buffer.isBuffer(rawBody)) {
    console.error('Raw body missing — is express.json() mounted before this route?');
    return res.status(400).json({ error: 'Raw body unavailable' });
  }

  const clientSecret = process.env.SENTRY_CLIENT_SECRET;

  // FAIL CLOSED on misconfiguration. 500 (not 401) so an operator can tell
  // "my server is misconfigured" apart from "someone sent a bad signature".
  if (!clientSecret) {
    console.error(
      'SENTRY_CLIENT_SECRET is not set — refusing to accept unverified webhooks'
    );
    return res.status(500).json({ error: 'Webhook client secret not configured' });
  }

  // Node lowercases incoming header names; Sentry sends them title-cased.
  const resource = req.headers['sentry-hook-resource'];
  const requestId = req.headers['request-id'];
  const timestamp = req.headers['sentry-hook-timestamp'];

  // There is NO handshake, NO challenge and NO validation request. An unsigned
  // request is not one to trust.
  if (!req.headers['sentry-hook-signature'] && !req.headers['sentry-app-signature']) {
    console.error('Missing Sentry-Hook-Signature / Sentry-App-Signature header');
    return res.status(401).json({ error: 'Missing signature header' });
  }

  if (!verifySentrySignature(rawBody, req.headers, clientSecret)) {
    console.error('Sentry webhook signature verification failed');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const tolerance = Number(process.env.SENTRY_WEBHOOK_TOLERANCE_SECONDS);
  if (!isTimestampFresh(timestamp, tolerance)) {
    console.error(`Sentry-Hook-Timestamp outside ${tolerance}s tolerance: ${timestamp}`);
    return res.status(400).json({ error: 'Stale timestamp' });
  }

  // Verified — only now is it safe to parse. An EMPTY body is legitimate
  // (select_options.requested signs ""), so treat it as an empty envelope
  // rather than a parse error.
  let event = {};
  const bodyText = rawBody.toString('utf8');
  if (bodyText.length > 0) {
    try {
      event = JSON.parse(bodyText);
    } catch (err) {
      console.error('Verified request had an unparseable body:', err.message);
      return res.status(400).json({ error: 'Invalid JSON' });
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
      `installation ${event.installation && event.installation.uuid})`
  );

  // Acknowledge inside Sentry's 1-SECOND budget, then work asynchronously.
  // Sentry: "Webhooks should respond within 1 second. Otherwise, the response
  // is considered a timeout." Sentry does NOT retry, and repeated failures trip
  // a circuit breaker that can disable the webhook.
  res.status(200).json({ received: true });

  setImmediate(() => {
    try {
      handleEvent(token, event, { requestId, resource });
    } catch (err) {
      console.error(`Error handling Sentry event ${token} (${requestId}):`, err);
    }
  });
});

/**
 * Describe who triggered an action.
 *
 * actor.id is `string | int`: when Sentry itself acts it sends
 * {"type": "application", "id": "sentry", "name": "Sentry"} — the STRING
 * "sentry", not a number. When another integration acts, id is that app's uuid.
 */
function describeActor(actor) {
  if (!actor) return 'unknown actor';
  return `${actor.name || actor.id} (${actor.type})`;
}

function handleEvent(token, event, meta) {
  // TODO: check meta.requestId against your store and return early if seen.
  //   if (await store.has(meta.requestId)) return;

  // `data` is resource-specific AND customizable via UI components, so
  // optional-chain everything in it.
  const data = event.data || {};

  switch (token) {
    // --- Installation (public integrations) ---------------------------------
    case 'installation.created':
      // data.installation has status/organization/app/code/uuid. There is no
      // handshake before this — it IS the first traffic for a public app.
      console.log(
        `🔌 Installed by ${describeActor(event.actor)} in org ` +
          `${data.installation?.organization?.slug} ` +
          `(installation ${data.installation?.uuid})`
      );
      break;
    case 'installation.deleted':
      console.log(`🔌 Uninstalled: installation ${data.installation?.uuid}`);
      break;

    // --- Issues -------------------------------------------------------------
    // data.issue.status is resolved | unresolved | ignored, with substatus one
    // of archived_until_escalating, archived_until_condition_met,
    // archived_forever, escalating, ongoing, regressed, new.
    case 'issue.created':
      // issue.created fires for the OUTAGE, ERROR and FEEDBACK categories — so
      // this is not necessarily an error. Branch on issueCategory before
      // assuming a stack trace exists.
      console.log(
        `🐛 Issue created: ${data.issue?.id} "${data.issue?.title}" ` +
          `[${data.issue?.issueCategory}/${data.issue?.issueType}]`
      );
      break;
    case 'issue.resolved':
      console.log(
        `✅ Issue resolved: ${data.issue?.id} by ${describeActor(event.actor)} ` +
          `(statusDetails ${JSON.stringify(data.issue?.statusDetails || {})})`
      );
      break;
    case 'issue.assigned':
      console.log(
        `👤 Issue assigned: ${data.issue?.id} -> ` +
          `${data.issue?.assignedTo?.name || 'unknown'}`
      );
      break;
    case 'issue.unresolved':
      console.log(
        `♻️  Issue regressed/unresolved: ${data.issue?.id} ` +
          `(substatus ${data.issue?.substatus})`
      );
      break;
    // THE WIRE TOKEN IS issue.ignored. The docs call the action "archived",
    // and issue.archived is kept as an equivalent alias for subscriptions
    // stored before the rename. HANDLE BOTH — never drop either.
    case 'issue.ignored':
    case 'issue.archived':
      console.log(
        `🔇 Issue archived/ignored: ${data.issue?.id} ` +
          `(substatus ${data.issue?.substatus})`
      );
      break;

    // --- Errors (Business plan and above only) ------------------------------
    case 'error.created':
      // Every error event. Expect volume orders of magnitude above
      // issue.created — do real work off a queue, never inline.
      console.log(
        `💥 Error created: issue ${data.error?.issue_id} ` +
          `(${data.error?.web_url || data.error?.url})`
      );
      break;

    // --- Comments -----------------------------------------------------------
    case 'comment.created':
      console.log(
        `💬 Comment ${data.comment_id} on issue ${data.issue_id} ` +
          `(${data.project_slug}): ${data.comment}`
      );
      break;
    case 'comment.updated':
      console.log(`✏️  Comment ${data.comment_id} updated on issue ${data.issue_id}`);
      break;
    case 'comment.deleted':
      console.log(`🗑️  Comment ${data.comment_id} deleted on issue ${data.issue_id}`);
      break;

    // --- Issue alerts -------------------------------------------------------
    // NOTE THE RESOURCE NAME: the header says `event_alert`, NOT `issue_alert`.
    // A handler keyed on "issue_alert.triggered" will never fire.
    case 'event_alert.triggered': {
      // data.event is a FULL Sentry event. data.event.tags is an ARRAY OF
      // [key, value] PAIRS, not an object. Stack frames run oldest -> newest.
      const tags = Object.fromEntries(
        Array.isArray(data.event?.tags) ? data.event.tags : []
      );
      console.log(
        `🚨 Issue alert triggered by rule "${data.triggered_rule}": ` +
          `issue ${data.event?.issue_id} level=${tags.level} ` +
          `(${data.event?.web_url})`
      );
      // data.issue_alert.settings holds the alert-rule-action UI component
      // config a user filled in for routing within your service.
      if (data.issue_alert?.settings) {
        console.log(`   routing settings: ${JSON.stringify(data.issue_alert.settings)}`);
      }
      break;
    }

    // --- Activity alerts ----------------------------------------------------
    case 'activity_alert.triggered':
      // data.activity.type is a seer_* activity (seer_root_cause_started ...
      // seer_pr_iteration_completed) with a type-dependent details payload.
      console.log(
        `🔔 Activity alert: ${data.activity?.type} on issue ${data.issue?.id} ` +
          `(${data.alert?.title} — ${data.alert?.web_url})`
      );
      break;

    // --- Metric alerts ------------------------------------------------------
    case 'metric_alert.critical':
      console.log(
        `🔥 Metric alert CRITICAL: ${data.description_title} — ` +
          `${data.description_text} (${data.web_url})`
      );
      break;
    case 'metric_alert.warning':
      console.log(`⚠️  Metric alert warning: ${data.description_title}`);
      break;
    case 'metric_alert.resolved':
      console.log(`✅ Metric alert resolved: ${data.description_title}`);
      break;
    // metric_alert.open is in Sentry's SentryAppEventType /
    // MetricAlertActionType enums but is NOT in the docs' list of three.
    // Handle it — undocumented, not imaginary.
    case 'metric_alert.open':
      console.log(
        `📈 Metric alert opened: ${data.description_title} ` +
          `(rule ${data.metric_alert?.alert_rule?.name})`
      );
      break;

    // --- Seer ---------------------------------------------------------------
    // data.run_id + data.group_id correlate every event in one Seer run.
    case 'seer.root_cause_started':
    case 'seer.solution_started':
    case 'seer.coding_started':
    case 'seer.iteration_started':
      console.log(`🤖 Seer ${token.split('.')[1]}: run ${data.run_id} on issue ${data.group_id}`);
      break;
    case 'seer.root_cause_completed':
      console.log(
        `🤖 Seer root cause for issue ${data.group_id}: ` +
          `${data.root_cause?.one_line_description}`
      );
      break;
    case 'seer.solution_completed':
      console.log(
        `🤖 Seer solution for issue ${data.group_id}: ` +
          `${data.solution?.one_line_summary}`
      );
      break;
    case 'seer.coding_completed':
    case 'seer.iteration_completed': {
      // code_changes is keyed by repo "owner/name"; each change is
      // {diff, path, type: M|A|D, added, removed}.
      const repos = Object.keys(data.code_changes || {});
      console.log(
        `🤖 Seer code changes for issue ${data.group_id} in ${repos.length} repo(s): ` +
          repos.join(', ')
      );
      break;
    }
    case 'seer.pr_created':
    case 'seer.pr_ready_for_review': {
      // Each entry is {pull_request: {pr_number, pr_url, pr_id}, repo_name,
      // provider} — the PR fields are NESTED under `pull_request`, while
      // repo_name and provider sit on the outer object.
      const entry = (data.pull_requests || [])[0];
      const pr = entry?.pull_request;
      console.log(
        `🤖 Seer PR ${token === 'seer.pr_created' ? 'created' : 'ready for review'}: ` +
          `#${pr?.pr_number} ${pr?.pr_url} (${entry?.repo_name} via ${entry?.provider})`
      );
      break;
    }

    // --- Pre-production artifacts -------------------------------------------
    // CAMELCASE KEYS HERE — a casing break from the snake_case used elsewhere.
    // And a *_completed action CAN mean failure: branch on `state`.
    case 'preprod_artifact.size_analysis_completed':
      if (data.state === 'FAILED') {
        console.log(
          `📱 Size analysis FAILED for build ${data.buildId}: ` +
            `${data.errorCode} ${data.errorMessage}`
        );
      } else {
        console.log(
          `📱 Size analysis complete for build ${data.buildId} ` +
            `(${data.appInfo?.name} ${data.appInfo?.version}): ` +
            `download ${data.downloadSize}B, install ${data.installSize}B`
        );
      }
      break;
    case 'preprod_artifact.build_distribution_completed':
      if (data.state === 'FAILED') {
        console.log(
          `📱 Build distribution FAILED for ${data.buildId}: ${data.errorMessage}`
        );
      } else {
        console.log(
          `📱 Build ${data.buildId} ready to distribute ` +
            `(${data.projectSlug}, head ${data.gitInfo?.headRef})`
        );
      }
      break;

    default:
      // Log unknown tokens rather than guessing their shape. New resources and
      // actions land in Sentry's server enum ahead of the docs.
      console.log(`ℹ️  Unhandled Sentry event: ${token}`);
  }
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server (skipped during tests)
let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Sentry webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/sentry`);
    if (!process.env.SENTRY_CLIENT_SECRET) {
      console.warn('⚠️  SENTRY_CLIENT_SECRET is not set');
      console.warn('   Every delivery will be rejected until you set it');
    }
  });
}

module.exports = {
  app,
  server,
  verifySentrySignature,
  isTimestampFresh,
  eventToken,
};
