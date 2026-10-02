// Generated with: pagerduty-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

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

const SIGNATURE_HEADER = 'x-pagerduty-signature'; // Headers lookup is case-insensitive
const SIGNATURE_PREFIX = 'v1='; // the current and only signature version

/** A PagerDuty [Resource Reference](https://docs.pagerduty.com/developer/resource-references). */
export interface ResourceReference {
  id?: string;
  type?: string;
  summary?: string | null;
  self?: string | null;
  html_url?: string | null;
}

/** The PagerDuty V3 event envelope. A payload wraps exactly ONE of these. */
export interface PagerDutyEvent {
  /** Unique event id. */
  id: string;
  /** e.g. `incident.priority_updated`. ROUTE ON THIS. */
  event_type: string;
  /** Root resource — currently `incident` or `service`. Can differ from `data.type`. */
  resource_type?: string;
  /** ISO 8601 datetime. */
  occurred_at?: string;
  /** Who or what initiated it. `null` often means automation, NOT a person. */
  agent?: ResourceReference | null;
  /** e.g. `{ name: 'PagerDuty' }`. CAN BE NULL. */
  client?: { name?: string } | null;
  /** Type-specific payload, carrying its own `type` discriminator. */
  data?: PagerDutyEventData;
}

/** Union-ish view of `event.data` across the 12 documented event data types. */
export interface PagerDutyEventData {
  /** The `data.type` discriminator, e.g. `incident`, `incident_note`, `service`. */
  type?: string;
  id?: string;
  self?: string;
  html_url?: string;
  summary?: string | null;

  // --- `incident` ---------------------------------------------------------
  number?: number;
  status?: 'triggered' | 'acknowledged' | 'resolved' | string;
  incident_key?: string | null;
  created_at?: string;
  reopened_at?: string | null;
  title?: string;
  incident_type?: { name?: string };
  service?: ResourceReference;
  assignees?: ResourceReference[];
  escalation_policy?: ResourceReference;
  teams?: ResourceReference[];
  /** CAN BE NULL when no priority is set. */
  priority?: ResourceReference | null;
  urgency?: 'high' | 'low' | string;
  conference_bridge?: { conference_number?: string; conference_url?: string } | null;
  resolve_reason?: string | null;

  // --- nested incident reference (notes, tasks, responders, roles, ...) ----
  incident?: ResourceReference;

  // --- `incident_note` / `incident_status_update` --------------------------
  content?: string;
  message?: string;
  trimmed?: boolean;

  // --- `incident_conference_bridge` (ARRAY here, unlike `incident`) --------
  conference_numbers?: Array<{ label?: string; number?: string }>;
  conference_url?: string;

  // --- `incident_field_values` / `service_field_values` --------------------
  custom_fields?: Array<Record<string, unknown>>;
  changed_custom_fields?: Array<Record<string, unknown>>;

  // --- `incident_responder` ------------------------------------------------
  user?: ResourceReference;
  state?: string;

  // --- `incident_role_assignment` (array wrapper) --------------------------
  incident_role_assignments?: Array<{
    id?: string;
    assignee?: ResourceReference | null;
    old_assignee?: ResourceReference | null;
    role?: ResourceReference;
    status?: string;
    incident?: ResourceReference;
    type?: string;
  }>;

  // --- `incident_task` -----------------------------------------------------
  name?: string;
  description?: string;

  // --- `incident_workflow_instance` ---------------------------------------
  incident_workflow?: ResourceReference;
  workflow_trigger?: ResourceReference;

  // --- `incident_action_invocation` ---------------------------------------
  action?: ResourceReference;

  // --- `service` -----------------------------------------------------------
  alert_creation?: string;

  [key: string]: unknown;
}

/** The webhook payload: a single `event` object. V3 never batches. */
export interface PagerDutyWebhookPayload {
  event: PagerDutyEvent;
}

/**
 * Verify the X-PagerDuty-Signature header against the raw body.
 *
 * @param rawBody RAW, unparsed request body (the string from `request.text()`)
 * @param signatureHeader The X-PagerDuty-Signature value
 * @param secret PAGERDUTY_WEBHOOK_SECRET
 * @returns true only when at least one v1= signature matches
 */
export function verifyPagerDutySignature(
  rawBody: Buffer | string,
  signatureHeader: string | null | undefined,
  secret: string | undefined
): boolean {
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
 */
export function countV1Signatures(signatureHeader: string | null | undefined): number {
  if (!signatureHeader) return 0;
  return signatureHeader
    .split(',')
    .filter((entry) => entry.trim().startsWith(SIGNATURE_PREFIX)).length;
}

/**
 * Describe the actor behind an event.
 *
 * event.agent and event.client CAN BOTH BE null — PagerDuty's own documented
 * service.updated example has both. A null agent "might indicate an event
 * triggered via automation rather than a specific person". Never reach for
 * event.agent.id unguarded.
 */
export function describeAgent(event: Pick<PagerDutyEvent, 'agent'>): string {
  const agent = event.agent;
  if (!agent) return 'automation';
  return `${agent.summary || agent.id} (${agent.type})`;
}

/**
 * PagerDuty V3 webhook endpoint.
 *
 * `await request.text()` gives the UNALTERED raw body. NEVER call
 * `request.json()` before verifying — the parsed object cannot be
 * re-serialised byte for byte, and that is the single most common cause of a
 * failing X-PagerDuty-Signature.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // RAW body FIRST, before anything else touches the stream.
  const rawBody = await request.text();

  const signatureHeader = request.headers.get(SIGNATURE_HEADER);
  const secret = process.env.PAGERDUTY_WEBHOOK_SECRET;

  // FAIL CLOSED on misconfiguration. 500 (not 4xx) because this is YOUR
  // problem, and a 5xx gets retried for 48 hours — so the event isn't lost
  // while you fix the config. Verification is never silently skipped.
  if (!secret) {
    console.error(
      'PAGERDUTY_WEBHOOK_SECRET is not set — refusing to accept unverified webhooks'
    );
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Malformed header -> 400 (ErrMalformedHeader in PagerDuty's Go client).
  // There is NO handshake or unsigned validation request to allow through:
  // every genuine V3 delivery carries X-PagerDuty-Signature.
  if (countV1Signatures(signatureHeader) === 0) {
    console.error('Missing or malformed X-PagerDuty-Signature header');
    return NextResponse.json(
      { error: 'Missing or malformed X-PagerDuty-Signature header' },
      { status: 400 }
    );
  }

  // Empty body -> 400 (ErrMalformedBody in the Go client).
  if (rawBody.length === 0) {
    console.error('Empty request body');
    return NextResponse.json({ error: 'Empty request body' }, { status: 400 });
  }

  // Signature mismatch -> 403 (ErrNoValidSignatures; PagerDuty's Go client
  // recommends 403 "to prevent redelivery"). 401 is equally fine — what
  // matters is that it is a 4xx, so PagerDuty does NOT retry it.
  if (!verifyPagerDutySignature(rawBody, signatureHeader, secret)) {
    console.error('PagerDuty webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  // Verified — only now is it safe to parse.
  let payload: PagerDutyWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as PagerDutyWebhookPayload;
  } catch (err) {
    console.error('Verified request had an unparseable body:', err);
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const event = payload?.event;
  if (!event || typeof event.event_type !== 'string') {
    // A V3 payload always wraps a single `event` object.
    console.error('Verified request had no event object');
    return NextResponse.json({ error: 'Missing event object' }, { status: 400 });
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
   */
  const webhookId = request.headers.get('x-webhook-id') || event.id;

  console.log(
    `✓ Verified PagerDuty webhook: ${event.event_type} ` +
      `(event ${event.id}, delivery ${webhookId}) at ${event.occurred_at}`
  );

  // Respond inside PagerDuty's 5-second budget (16 seconds for webhooks
  // generated from Custom Incident Actions). PagerDuty: "Return a 202 Accepted
  // once you receive a payload and then process... Asynchronous processing will
  // help prevent the connection from timing out."
  //
  // Next.js route handlers have no setImmediate-after-response equivalent you
  // can rely on in a serverless runtime — the function may be frozen the moment
  // you return. In production, ENQUEUE here (Inngest, QStash, SQS, a DB-backed
  // job table, or Hookdeck) and process in a worker. The await below is cheap
  // and illustrative only.
  try {
    await handleEvent(event);
  } catch (err) {
    // Already-verified event, our own processing failed. Returning 5xx would
    // make PagerDuty retry for 48 hours — fine here, but in a real handler
    // you'd enqueue before responding and let the queue own the retry.
    console.error(`Error handling PagerDuty event ${event.id}:`, err);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 202 });
}

/**
 * Dispatch a verified PagerDuty V3 event.
 *
 * Route on `event.event_type`; use `event.data.type` to pick the data schema.
 * `event.resource_type` is the root resource (incident or service) and can
 * differ from the more specific `data.type`.
 */
export async function handleEvent(event: PagerDutyEvent): Promise<void> {
  // TODO: check the X-Webhook-Id / event.id against your store and return
  // early if seen. Keep ids for 48+ hours.
  //   if (await store.has(webhookId)) return;

  const data: PagerDutyEventData = event.data || {};
  const incident = data.incident || {};
  const who = describeAgent(event);

  switch (event.event_type) {
    // --- Incident lifecycle (data.type === 'incident') ----------------------
    case 'incident.triggered':
      // data.priority CAN BE NULL when no priority is set.
      console.log(
        `🚨 Incident triggered: #${data.number} ${data.title} ` +
          `[${data.priority?.summary ?? 'no priority'}, ${data.urgency} urgency] ` +
          `on ${data.service?.summary} — ${data.html_url}`
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
        `✅ Incident resolved: #${data.number} by ${who} (reason: ${data.resolve_reason ?? 'none'})`
      );
      break;
    case 'incident.reopened':
      console.log(`🔁 Incident reopened: #${data.number} at ${data.reopened_at}`);
      break;
    case 'incident.escalated':
      // Escalated to another user in the SAME escalation level.
      console.log(
        `⏫ Incident escalated within level: #${data.number} → ` +
          `${(data.assignees ?? []).map((a) => a.summary).join(', ')}`
      );
      break;
    case 'incident.delegated':
      // Reassigned to another ESCALATION POLICY (not a user).
      console.log(
        `🔀 Incident delegated to escalation policy ${data.escalation_policy?.summary}: #${data.number}`
      );
      break;
    case 'incident.reassigned':
      // Reassigned to another USER.
      console.log(
        `👤 Incident reassigned: #${data.number} → ` +
          `${(data.assignees ?? []).map((a) => a.summary).join(', ')}`
      );
      break;
    case 'incident.priority_updated':
      console.log(
        `⚠️  Incident priority updated: #${data.number} → ${data.priority?.summary ?? 'none'}`
      );
      break;
    case 'incident.service_updated':
      // NOTE THE UNDERSCORE. This is the incident's SERVICE changing, and is a
      // DIFFERENT event from `service.updated` below.
      console.log(`🔧 Incident service changed: #${data.number} → ${data.service?.summary}`);
      break;
    case 'incident.incident_type.changed':
      console.log(
        `🏷️  Incident type changed: #${data.number} → ${data.incident_type?.name ?? 'unknown'}`
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
          `${(data.conference_numbers ?? []).map((n) => n.number).join(', ')} ${data.conference_url ?? ''}`
      );
      break;
    case 'incident.custom_field_values.updated':
      // data.type === 'incident_field_values'
      console.log(
        `🗂️  Incident custom fields updated on ${incident.id}: ` +
          `${(data.changed_custom_fields ?? []).map((f) => `${f.name}=${f.value}`).join(', ')}`
      );
      break;

    // --- Responders and roles -----------------------------------------------
    case 'incident.responder.added':
      // data.type === 'incident_responder'. state is 'pending' when added.
      console.log(
        `🙋 Responder requested on ${incident.id}: ` +
          `${data.user?.summary} (${data.state}) — "${data.message}"`
      );
      break;
    case 'incident.responder.replied':
      console.log(`💬 Responder replied on ${incident.id}: ${data.user?.summary} → ${data.state}`);
      break;
    case 'incident.role.assigned':
      // data.type === 'incident_role_assignment'. THIS ALSO COVERS
      // UNASSIGNMENT — the assignments live in an ARRAY, and old_assignee can
      // be null.
      for (const assignment of data.incident_role_assignments ?? []) {
        console.log(
          `🎖️  Role ${assignment.role?.summary} on ${assignment.incident?.id}: ` +
            `${assignment.assignee?.summary ?? 'unassigned'} ` +
            `(was ${assignment.old_assignee?.summary ?? 'nobody'}, status ${assignment.status})`
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
        `⚙️  Action invocation ${data.state} on ${incident.id}: ${data.action?.summary} (${data.id})`
      );
      break;

    // --- Incident workflows (need the incident_workflows.read OAuth scope) ---
    case 'incident.workflow.started':
    case 'incident.workflow.completed':
      // data.type === 'incident_workflow_instance'
      console.log(
        `🔄 Workflow ${event.event_type.endsWith('started') ? 'started' : 'completed'} ` +
          `on ${incident.id}: ${data.incident_workflow?.summary}`
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
        `🔧 Service updated: ${data.summary} (${data.id}) alert_creation=${data.alert_creation} by ${who}`
      );
      break;
    case 'service.deleted':
      console.log(`🗑️  Service deleted: ${data.summary} (${data.id})`);
      break;
    case 'service.custom_field_values.updated':
      // data.type === 'service_field_values'
      console.log(
        `🗂️  Service custom fields updated on ${data.service?.id}: ` +
          `${(data.custom_fields ?? []).map((f) => `${f.name}=${JSON.stringify(f.value)}`).join(', ')}`
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
