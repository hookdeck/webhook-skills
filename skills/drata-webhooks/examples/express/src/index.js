// Generated with: drata-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

// Drata webhooks are the "Send webhook" step of a Drata workflow
// (Settings > Workflows). Drata POSTs JSON to the URL you enter.
//
//   1. There is no published signature or signing secret. Drata sends through
//      Svix but does not document svix-* headers, so authenticate with a shared
//      secret YOU add as a custom header (e.g. `X-Webhook-Secret: <hex>`) and
//      compare it in constant time.
//   2. The body is flat JSON: `event_type` (e.g. CONTROL_EVIDENCE_LINKED),
//      `timestamp`, `organization_id`, `workspace`, plus the control and
//      trigger properties the admin selected in the step.

const WEBHOOK_PATH = '/webhooks/drata';
const DEFAULT_HEADER = 'X-Webhook-Secret';

// `event_type` values for control workflows, as listed in Drata's help center.
const EVENTS = {
  CONTROL_DETAILS_UPDATED: 'CONTROL_DETAILS_UPDATED',
  CONTROL_READINESS_CHANGED_TO_NOT_READY: 'CONTROL_READINESS_CHANGED_TO_NOT_READY',
  CONTROL_READINESS_CHANGED_TO_READY: 'CONTROL_READINESS_CHANGED_TO_READY',
  CONTROL_EVIDENCE_LINKED: 'CONTROL_EVIDENCE_LINKED',
  CONTROL_EVIDENCE_UNLINKED: 'CONTROL_EVIDENCE_UNLINKED',
  CONTROL_POLICY_LINKED: 'CONTROL_POLICY_LINKED',
  CONTROL_POLICY_UNLINKED: 'CONTROL_POLICY_UNLINKED',
  CONTROL_TEST_MAPPED: 'CONTROL_TEST_MAPPED',
  CONTROL_TEST_UNMAPPED: 'CONTROL_TEST_UNMAPPED',
  CONTROL_REQUIREMENT_MAPPED: 'CONTROL_REQUIREMENT_MAPPED',
  CONTROL_REQUIREMENT_UNMAPPED: 'CONTROL_REQUIREMENT_UNMAPPED',
  CONTROL_TEST_CHANGED_TO_PASS: 'CONTROL_TEST_CHANGED_TO_PASS',
  CONTROL_TEST_CHANGED_TO_FAIL: 'CONTROL_TEST_CHANGED_TO_FAIL',
  CONTROL_OWNER_UPDATED: 'CONTROL_OWNER_UPDATED',
  CONTROL_MARKED_IN_SCOPE: 'CONTROL_MARKED_IN_SCOPE',
  CONTROL_MARKED_OUT_OF_SCOPE: 'CONTROL_MARKED_OUT_OF_SCOPE',
};

const KNOWN_EVENTS = new Set(Object.values(EVENTS));

const app = express();

/**
 * Compare the shared secret from the custom header in constant time.
 *
 * @param {unknown} headerValue - value of the configured custom header
 * @returns {boolean} true when it matches DRATA_WEBHOOK_SECRET
 * @throws {Error} when DRATA_WEBHOOK_SECRET is not configured (fail closed)
 */
function verifyDrataSecret(headerValue) {
  const expected = process.env.DRATA_WEBHOOK_SECRET;
  if (!expected) {
    throw new Error('DRATA_WEBHOOK_SECRET is not set');
  }
  if (typeof headerValue !== 'string') return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  // Length check first: timingSafeEqual throws when lengths differ.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Drata retries a failed step up to three times and sends no delivery ID, so
 * build a dedupe key from fields the payload always carries.
 */
function dedupeKey(payload) {
  if (!payload.control_id) return null;
  return `${payload.event_type}:${payload.control_id}:${payload.timestamp ?? ''}`;
}

// --- Event handlers ---------------------------------------------------------

async function handleReadinessChanged(payload) {
  console.log(`Control ${payload.control_code ?? payload.control_id} readiness: ${payload.event_type}`);
  // TODO: open or close a ticket when a control becomes Not ready / Ready.
}

async function handleEvidenceChanged(payload) {
  console.log(`Control ${payload.control_code ?? payload.control_id}: ${payload.event_type} (${payload.evidence_name ?? 'unknown evidence'})`);
  // TODO: sync evidence links into your system.
}

async function handleTestResultChanged(payload) {
  console.log(`Control ${payload.control_code ?? payload.control_id}: ${payload.event_type} (${payload.test_name ?? 'unknown test'})`);
  // TODO: alert the control owner when a mapped test starts failing.
}

async function handleOwnerUpdated(payload) {
  console.log(`Control ${payload.control_code ?? payload.control_id} owner changed by ${payload.updated_by ?? 'unknown'}`);
  // TODO: update ownership in your system.
}

async function handleControlChange(payload) {
  console.log(`Control ${payload.control_code ?? payload.control_id}: ${payload.event_type}`);
  // TODO: handle details, policy, requirement and scope changes.
}

/**
 * Dispatch on the `event_type` field.
 *
 * @returns {Promise<boolean>} whether the event was recognised
 */
async function dispatch(payload) {
  switch (payload.event_type) {
    case EVENTS.CONTROL_READINESS_CHANGED_TO_NOT_READY:
    case EVENTS.CONTROL_READINESS_CHANGED_TO_READY:
      await handleReadinessChanged(payload);
      return true;
    case EVENTS.CONTROL_EVIDENCE_LINKED:
    case EVENTS.CONTROL_EVIDENCE_UNLINKED:
      await handleEvidenceChanged(payload);
      return true;
    case EVENTS.CONTROL_TEST_CHANGED_TO_PASS:
    case EVENTS.CONTROL_TEST_CHANGED_TO_FAIL:
      await handleTestResultChanged(payload);
      return true;
    case EVENTS.CONTROL_OWNER_UPDATED:
      await handleOwnerUpdated(payload);
      return true;
    default:
      if (KNOWN_EVENTS.has(payload.event_type)) {
        await handleControlChange(payload);
        return true;
      }
      // Risk, evidence and personnel workflows use other event_type values.
      // Acknowledge them so Drata doesn't retry.
      console.warn(`Unhandled Drata event: ${payload.event_type}`);
      return false;
  }
}

// --- Route ------------------------------------------------------------------

/**
 * Check the shared-secret header BEFORE the body is read.
 */
function requireDrataSecret(req, res, next) {
  const headerName = process.env.DRATA_WEBHOOK_HEADER || DEFAULT_HEADER;
  let ok;
  try {
    // req.get() is case-insensitive.
    ok = verifyDrataSecret(req.get(headerName));
  } catch (err) {
    console.error(`Drata webhook misconfigured: ${err.message}`);
    return res.status(500).send('Webhook secret not configured');
  }
  if (!ok) {
    console.error(`Drata webhook rejected: ${headerName} missing or wrong`);
    return res.status(401).send('Invalid webhook secret');
  }
  return next();
}

// Raw body for any content type; JSON is parsed only after the secret is checked.
app.post(
  WEBHOOK_PATH,
  requireDrataSecret,
  express.raw({ type: '*/*' }),
  async (req, res) => {
    let payload;
    try {
      const text = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
      payload = JSON.parse(text);
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    if (!payload || typeof payload !== 'object' || typeof payload.event_type !== 'string') {
      return res.status(400).send('Missing event_type field');
    }

    console.log(`Drata webhook: event_type=${payload.event_type} key=${dedupeKey(payload)}`);

    try {
      await dispatch(payload);
    } catch (err) {
      console.error(`Drata webhook processing failed: ${err.message}`);
      // Non-2xx lets Drata retry the step (up to three times).
      return res.status(500).send('Processing failed');
    }

    return res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, EVENTS, verifyDrataSecret, dedupeKey, dispatch };

// Start the server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  if (!process.env.DRATA_WEBHOOK_SECRET) {
    console.warn('DRATA_WEBHOOK_SECRET is not set: every delivery will get a 500 (fail closed).');
  }
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}${WEBHOOK_PATH}`);
  });
}
