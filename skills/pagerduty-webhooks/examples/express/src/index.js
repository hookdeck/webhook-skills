// Generated with: pagerduty-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * PAGERDUTY V3 WEBHOOK VERIFICATION
 *
 *   header : X-PagerDuty-Signature   (REQUIRED — always sent on V3 deliveries)
 *   value  : one or MORE comma-separated signatures, each `v1=<hex>`
 *   digest : HMAC-SHA256 over the RAW request body, lowercase hex (Base16)
 *   key    : the subscription's delivery_method.secret, returned ONCE in the
 *            POST /webhook_subscriptions response. Used AS-IS as UTF-8 bytes.
 *            NOT an API key / REST token, NOT an Events API routing key.
 *
 * WHY MULTIPLE SIGNATURES: zero-downtime secret rotation. During a rotation the
 * same body is signed once per active secret and the digests are concatenated.
 * ACCEPT A MATCH AGAINST ANY `v1=` ENTRY — comparing the whole header string,
 * or only the first entry, works until the day someone rotates the secret.
 *
 * THERE IS NO TIMESTAMP AND NO NONCE in the signed content, so there is NO
 * replay window to check. Do NOT add a tolerance/stale-time check. Replay
 * protection is de-duplication on the X-Webhook-Id header.
 *
 * THERE IS NO HANDSHAKE. No challenge, no echo, no confirmation POST — the
 * secret arrives in the API response, not over the wire.
 *
 * Neither @pagerduty/pdjs nor pdpyras ships a webhook verifier; the only
 * official one is Go's webhookv3/webhookv3.go, which this mirrors:
 * https://github.com/PagerDuty/go-pagerduty/blob/master/webhookv3/webhookv3.go
 */

const SIGNATURE_HEADER = 'x-pagerduty-signature'; // Node lowercases header names
const SIGNATURE_PREFIX = 'v1='; // the current and only signature version

/**
 * Verify the X-PagerDuty-Signature header against the raw body.
 *
 * @param {Buffer|string} rawBody RAW, unparsed request body
 * @param {string|undefined} signatureHeader The X-PagerDuty-Signature value
 * @param {string|undefined} secret PAGERDUTY_WEBHOOK_SECRET
 * @returns {boolean} true only when at least one v1= signature matches
 */
function verifyPagerDutySignature(rawBody, signatureHeader, secret) {
  // Fail closed: a missing header or an unconfigured secret is a rejection.
  if (!signatureHeader || !secret) return false;

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');

  // HMAC over the RAW BODY BYTES. PagerDuty: "Verifying PagerDuty webhook
  // signatures requires the unaltered raw body of the request sent to you."
  // .digest() with no encoding returns the raw 32 bytes, which we compare
  // against each hex-DECODED candidate — exactly what the Go client does.
  const expected = crypto
    .createHmac('sha256', secret) // secret AS-IS as UTF-8 — do NOT decode it
    .update(body)
    .digest();

  return signatureHeader.split(',').some((entry) => {
    // Trim defensively. PagerDuty sends no space after the commas (the Go
    // client doesn't trim at all), so never DEPEND on a space being there.
    const part = entry.trim();

    // IGNORE unknown versions rather than failing. `v1` is the only version
    // today; skipping other prefixes is how a future `v2=` rolls out without
    // breaking this receiver.
    if (!part.startsWith(SIGNATURE_PREFIX)) return false;

    // Buffer.from(..., 'hex') stops at the first invalid pair, so a non-hex
    // candidate yields a short buffer and is rejected by the length guard
    // below — skipped, not fatal, matching the Go client.
    const candidate = Buffer.from(part.slice(SIGNATURE_PREFIX.length), 'hex');

    // Length FIRST — crypto.timingSafeEqual THROWS on mismatched lengths, and
    // an uncaught throw becomes a 500 that PagerDuty retries for 48 hours.
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  });
}

/**
 * Count the usable `v1=` entries in the header.
 *
 * Mirrors the Go client's distinction between a MALFORMED HEADER (absent, or
 * no parseable v1= entries -> HTTP 400) and NO VALID SIGNATURES (-> HTTP 403).
 * Both are 4xx, which PagerDuty treats as PERMANENT, so neither is retried —
 * which is what you want for a forged request.
 *
 * @param {string|undefined} signatureHeader
 * @returns {number}
 */
function countV1Signatures(signatureHeader) {
  if (!signatureHeader) return 0;
  return signatureHeader
    .split(',')
    .filter((entry) => entry.trim().startsWith(SIGNATURE_PREFIX)).length;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

/**
 * PagerDuty V3 webhook endpoint.
 *
 * express.raw() hands the handler a Buffer of the exact bytes PagerDuty sent.
 * NEVER mount express.json() ahead of this route — it consumes the stream and
 * leaves a parsed object you cannot re-serialise byte for byte, which is the
 * single most common cause of a failing X-PagerDuty-Signature.
 *
 * The 1 MB limit is deliberate: PagerDuty guarantees delivery up to 55 KB,
 * delivers 55 KB–256 KB best-effort, and drops anything over 256 KB itself.
 * ANY limit here must be at least 256 KB — a smaller one would reject
 * legitimate large incident payloads. (The Go client caps its read at 2 MB.)
 */
app.post(
  '/webhooks/pagerduty',
  express.raw({ type: 'application/json', limit: '1mb' }),
  (req, res) => {
    const rawBody = req.body;

    if (!Buffer.isBuffer(rawBody)) {
      console.error('Raw body missing — is express.json() mounted before this route?');
      return res.status(400).json({ error: 'Raw body unavailable' });
    }

    const signatureHeader = req.headers[SIGNATURE_HEADER];
    const secret = process.env.PAGERDUTY_WEBHOOK_SECRET;

    // FAIL CLOSED on misconfiguration. 500 (not 4xx) because this is YOUR
    // problem, and a 5xx gets retried for 48 hours — so the event isn't lost
    // while you fix the config. Verification is never silently skipped.
    if (!secret) {
      console.error(
        'PAGERDUTY_WEBHOOK_SECRET is not set — refusing to accept unverified webhooks'
      );
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    // Malformed header -> 400 (ErrMalformedHeader in PagerDuty's Go client).
    // There is NO handshake or unsigned validation request to allow through:
    // every genuine V3 delivery carries X-PagerDuty-Signature.
    if (countV1Signatures(signatureHeader) === 0) {
      console.error('Missing or malformed X-PagerDuty-Signature header');
      return res
        .status(400)
        .json({ error: 'Missing or malformed X-PagerDuty-Signature header' });
    }

    // Empty body -> 400 (ErrMalformedBody in the Go client).
    if (rawBody.length === 0) {
      console.error('Empty request body');
      return res.status(400).json({ error: 'Empty request body' });
    }

    // Signature mismatch -> 403 (ErrNoValidSignatures; PagerDuty's Go client
    // recommends 403 "to prevent redelivery"). 401 is equally fine — what
    // matters is that it is a 4xx, so PagerDuty does NOT retry it.
    if (!verifyPagerDutySignature(rawBody, signatureHeader, secret)) {
      console.error('PagerDuty webhook signature verification failed');
      return res.status(403).json({ error: 'Invalid signature' });
    }

    // Verified — only now is it safe to parse.
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8')); // UTF-8: payloads carry unicode
    } catch (err) {
      console.error('Verified request had an unparseable body:', err.message);
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    const event = payload && payload.event;
    if (!event || typeof event.event_type !== 'string') {
      // A V3 payload always wraps a single `event` object.
      console.error('Verified request had no event object');
      return res.status(400).json({ error: 'Missing event object' });
    }

    /**
     * IDEMPOTENCY KEY.
     *
     * Delivery is AT-LEAST-ONCE. PagerDuty: the X-Webhook-Id header "is unique
     * to the webhook but is repeated for each delivery attempt, so it may be
     * used to ignore subsequent delivery attempts after an initial success."
     *
     * Retain seen ids for AT LEAST 48 HOURS — the length of the retry window.
     * event.id works too, but X-Webhook-Id is the documented de-dup key.
     *
     * There is NO documented X-PagerDuty-Event header, no delivery-timestamp
     * header and no documented V3 User-Agent. Don't key on undocumented ones.
     */
    const webhookId = req.headers['x-webhook-id'] || event.id;

    console.log(
      `✓ Verified PagerDuty webhook: ${event.event_type} ` +
        `(event ${event.id}, delivery ${webhookId}) at ${event.occurred_at}`
    );

    // Respond inside PagerDuty's 5-second budget (16 seconds for webhooks
    // generated from Custom Incident Actions), then work asynchronously.
    // PagerDuty: "Return a 202 Accepted once you receive a payload and then
    // process... Asynchronous processing will help prevent the connection from
    // timing out."
    res.status(202).json({ received: true });

    setImmediate(() => {
      try {
        handleEvent(event);
      } catch (err) {
        // Swallow here: we already returned 202, so PagerDuty will not retry.
        // Route this into your queue's dead-letter handling instead.
        console.error(`Error handling PagerDuty event ${event.id}:`, err);
      }
    });
  }
);

/**
 * Describe the actor behind an event.
 *
 * event.agent and event.client CAN BOTH BE null — PagerDuty's own documented
 * service.updated example has both. A null agent "might indicate an event
 * triggered via automation rather than a specific person". Never reach for
 * event.agent.id unguarded.
 */
function describeAgent(event) {
  const agent = event.agent;
  if (!agent) return 'automation';
  return `${agent.summary || agent.id} (${agent.type})`;
}

/**
 * Dispatch a verified PagerDuty V3 event.
 *
 * Route on `event.event_type`; use `event.data.type` to pick the data schema.
 * `event.resource_type` is the root resource (incident or service) and can
 * differ from the more specific `data.type`.
 */
function handleEvent(event) {
  // TODO: check the X-Webhook-Id / event.id against your store and return
  // early if seen. Keep ids for 48+ hours.
  //   if (await store.has(webhookId)) return;

  const data = event.data || {};
  const incident = data.incident || {};
  const who = describeAgent(event);

  switch (event.event_type) {
    // --- Incident lifecycle (data.type === 'incident') ----------------------
    case 'incident.triggered':
      // data.priority CAN BE NULL when no priority is set.
      console.log(
        `🚨 Incident triggered: #${data.number} ${data.title} ` +
          `[${(data.priority && data.priority.summary) || 'no priority'}, ${data.urgency} urgency] ` +
          `on ${data.service && data.service.summary} — ${data.html_url}`
      );
      break;
    case 'incident.acknowledged':
      console.log(`👍 Incident acknowledged: #${data.number} by ${who}`);
      break;
    case 'incident.unacknowledged':
      console.log(`↩️  Incident unacknowledged: #${data.number}`);
      break;
    case 'incident.resolved':
      console.log(
        `✅ Incident resolved: #${data.number} by ${who} (reason: ${data.resolve_reason || 'none'})`
      );
      break;
    case 'incident.reopened':
      console.log(`🔁 Incident reopened: #${data.number} at ${data.reopened_at}`);
      break;
    case 'incident.escalated':
      // Escalated to another user in the SAME escalation level.
      console.log(
        `⏫ Incident escalated within level: #${data.number} → ` +
          `${(data.assignees || []).map((a) => a.summary).join(', ')}`
      );
      break;
    case 'incident.delegated':
      // Reassigned to another ESCALATION POLICY (not a user).
      console.log(
        `🔀 Incident delegated to escalation policy ` +
          `${data.escalation_policy && data.escalation_policy.summary}: #${data.number}`
      );
      break;
    case 'incident.reassigned':
      // Reassigned to another USER.
      console.log(
        `👤 Incident reassigned: #${data.number} → ` +
          `${(data.assignees || []).map((a) => a.summary).join(', ')}`
      );
      break;
    case 'incident.priority_updated':
      console.log(
        `⚠️  Incident priority updated: #${data.number} → ` +
          `${(data.priority && data.priority.summary) || 'none'}`
      );
      break;
    case 'incident.service_updated':
      // NOTE THE UNDERSCORE. This is the incident's SERVICE changing, and is a
      // DIFFERENT event from `service.updated` below.
      console.log(
        `🔧 Incident service changed: #${data.number} → ${data.service && data.service.summary}`
      );
      break;
    case 'incident.incident_type.changed':
      console.log(
        `🏷️  Incident type changed: #${data.number} → ` +
          `${(data.incident_type && data.incident_type.name) || 'unknown'}`
      );
      break;

    // --- Notes, status updates, bridges, custom fields ----------------------
    case 'incident.annotated':
      // data.type === 'incident_note'. NOT named `incident.note.created`.
      console.log(`📝 Note added to ${incident.id}: ${data.content}`);
      break;
    case 'incident.status_update_published':
      // data.type === 'incident_status_update'
      console.log(`📣 Status update on ${incident.id}: ${data.message}`);
      break;
    case 'incident.conference_bridge.updated':
      // data.type === 'incident_conference_bridge'. Note conference_numbers is
      // an ARRAY of {label, number} here, unlike the single
      // conference_bridge.conference_number string on an `incident`.
      console.log(
        `☎️  Conference bridge updated on ${incident.id}: ` +
          `${(data.conference_numbers || []).map((n) => n.number).join(', ')} ${data.conference_url || ''}`
      );
      break;
    case 'incident.custom_field_values.updated':
      // data.type === 'incident_field_values'
      console.log(
        `🗂️  Incident custom fields updated on ${incident.id}: ` +
          `${(data.changed_custom_fields || []).map((f) => `${f.name}=${f.value}`).join(', ')}`
      );
      break;

    // --- Responders and roles -----------------------------------------------
    case 'incident.responder.added':
      // data.type === 'incident_responder'. state is 'pending' when added.
      console.log(
        `🙋 Responder requested on ${incident.id}: ` +
          `${data.user && data.user.summary} (${data.state}) — "${data.message}"`
      );
      break;
    case 'incident.responder.replied':
      console.log(
        `💬 Responder replied on ${incident.id}: ` +
          `${data.user && data.user.summary} → ${data.state}`
      );
      break;
    case 'incident.role.assigned':
      // data.type === 'incident_role_assignment'. THIS ALSO COVERS
      // UNASSIGNMENT — the assignments live in an ARRAY, and old_assignee can
      // be null.
      for (const assignment of data.incident_role_assignments || []) {
        console.log(
          `🎖️  Role ${assignment.role && assignment.role.summary} on ` +
            `${assignment.incident && assignment.incident.id}: ` +
            `${(assignment.assignee && assignment.assignee.summary) || 'unassigned'} ` +
            `(was ${(assignment.old_assignee && assignment.old_assignee.summary) || 'nobody'}, ` +
            `status ${assignment.status})`
        );
      }
      break;

    // --- Tasks ---------------------------------------------------------------
    case 'incident.task.created':
    case 'incident.task.updated':
    case 'incident.task.completed':
      // data.type === 'incident_task'
      console.log(
        `☑️  Task ${event.event_type.split('.').pop()} on ${incident.id}: ` +
          `"${data.name}" [${data.status}]`
      );
      break;

    // --- Automation action invocations ---------------------------------------
    case 'incident.action_invocation.created':
    case 'incident.action_invocation.updated':
    case 'incident.action_invocation.terminated':
      // data.type === 'incident_action_invocation'
      console.log(
        `⚙️  Action invocation ${data.state} on ${incident.id}: ` +
          `${data.action && data.action.summary} (${data.id})`
      );
      break;

    // --- Incident workflows (need the incident_workflows.read OAuth scope) ---
    case 'incident.workflow.started':
    case 'incident.workflow.completed':
      // data.type === 'incident_workflow_instance'
      console.log(
        `🔄 Workflow ${event.event_type.endsWith('started') ? 'started' : 'completed'} ` +
          `on ${incident.id}: ${data.incident_workflow && data.incident_workflow.summary}`
      );
      break;

    // --- Services (data.type === 'service' / 'service_field_values') ---------
    case 'service.created':
      console.log(`🆕 Service created: ${data.summary} (${data.id})`);
      break;
    case 'service.updated':
      // DIFFERENT from `incident.service_updated`. Both agent and client are
      // null in PagerDuty's documented example for this event.
      console.log(
        `🔧 Service updated: ${data.summary} (${data.id}) ` +
          `alert_creation=${data.alert_creation} by ${who}`
      );
      break;
    case 'service.deleted':
      console.log(`🗑️  Service deleted: ${data.summary} (${data.id})`);
      break;
    case 'service.custom_field_values.updated':
      // data.type === 'service_field_values'
      console.log(
        `🗂️  Service custom fields updated on ${data.service && data.service.id}: ` +
          `${(data.custom_fields || []).map((f) => `${f.name}=${JSON.stringify(f.value)}`).join(', ')}`
      );
      break;

    default:
      // REQUIRED. PagerDuty: "Additional event types may be added to this list
      // over time", and it also ships Early Access events that are "subject to
      // change at any moment, without notice". Log and acknowledge — never
      // throw on an unrecognised event_type.
      console.log(
        `ℹ️  Unhandled PagerDuty event type: ${event.event_type} ` +
          `(resource_type=${event.resource_type}, data.type=${data.type})`
      );
  }
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler. Note express.raw() rejects an over-limit body with a 413 here;
// PagerDuty drops anything over 256 KB itself, so the 1mb limit above should
// never be hit by genuine traffic.
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server (skipped during tests)
let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`PagerDuty webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/pagerduty`);
    if (!process.env.PAGERDUTY_WEBHOOK_SECRET) {
      console.warn('⚠️  PAGERDUTY_WEBHOOK_SECRET is not set');
      console.warn('   Every delivery will be rejected until you set it');
      console.warn('   Get it from delivery_method.secret in the');
      console.warn('   POST /webhook_subscriptions response');
    }
  });
}

module.exports = {
  app,
  server,
  verifyPagerDutySignature,
  countV1Signatures,
  describeAgent,
  handleEvent,
};
