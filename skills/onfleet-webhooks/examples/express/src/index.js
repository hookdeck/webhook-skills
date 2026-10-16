// Generated with: onfleet-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

const HEX_PATTERN = /^[0-9a-fA-F]+$/;

/**
 * Verify the X-Onfleet-Signature header.
 *
 * Algorithm: HMAC-SHA512, lowercase hex digest
 * Key:       the org-wide webhook secret, HEX-DECODED to bytes
 * Signed:    the raw request body, nothing else (no timestamp, no prefix)
 *
 * The key must be Buffer.from(secret, 'hex'). Passing the secret string
 * straight to createHmac produces a well-formed digest that never matches.
 */
function verifyOnfleetSignature(rawBody, signatureHeader, secretHex) {
  if (!signatureHeader) {
    return { valid: false, error: 'Missing X-Onfleet-Signature header' };
  }

  const expected = crypto
    .createHmac('sha512', Buffer.from(secretHex, 'hex'))
    .update(rawBody)
    .digest('hex');

  // Onfleet's docs say to compare the hex strings. Normalise case defensively.
  const received = Buffer.from(signatureHeader.trim().toLowerCase(), 'utf8');
  const computed = Buffer.from(expected, 'utf8');

  // timingSafeEqual throws on unequal lengths, so check first.
  if (received.length !== computed.length) {
    return { valid: false, error: 'Invalid signature' };
  }
  if (!crypto.timingSafeEqual(received, computed)) {
    return { valid: false, error: 'Invalid signature' };
  }
  return { valid: true };
}

/**
 * Buffer.from(str, 'hex') silently stops at the first non-hex character, so a
 * mis-pasted secret would yield a short key instead of an error. Check it.
 */
function isValidHexSecret(secret) {
  return typeof secret === 'string' && secret.length % 2 === 0 && HEX_PATTERN.test(secret);
}

/**
 * Process a verified event. Runs after the 200 has been sent: Onfleet times
 * out after 10 seconds and disables the webhook after 300 consecutive failures.
 *
 * Fields irrelevant to a trigger arrive as null (not absent), and `data` can be
 * {} — use optional access everywhere. Ids are opaque strings containing ~ and *.
 */
function handleOnfleetEvent(event) {
  const taskId = event.taskId ?? event.data?.task?.id ?? null;
  const workerId = event.workerId ?? event.data?.worker?.id ?? null;

  switch (event.triggerName) {
    // Task lifecycle (data.task)
    case 'taskStarted':
      console.log('Task started:', taskId);
      break;
    case 'taskEta':
      // etaSeconds is SECONDS and fractional; every other time field is ms.
      console.log('Task ETA:', taskId, 'eta seconds:', event.etaSeconds);
      break;
    case 'taskArrival':
      console.log('Worker arriving:', taskId, 'distance (m):', event.distance);
      break;
    case 'taskCompleted':
      console.log('Task completed:', taskId);
      break;
    case 'taskFailed':
      console.log('Task failed:', taskId, event.data?.task?.completionDetails?.failureReason);
      break;
    case 'taskCreated':
      // Does not fire for dashboard task imports or for clones (see taskCloned).
      console.log('Task created:', taskId);
      break;
    case 'taskUpdated':
      console.log('Task updated:', taskId);
      break;
    case 'taskDeleted':
      console.log('Task deleted:', taskId);
      break;
    case 'taskAssigned':
      console.log('Task assigned:', taskId, 'container:', event.data?.task?.container?.type);
      break;
    case 'taskUnassigned':
      console.log('Task unassigned:', taskId);
      break;
    case 'taskDelayed':
      console.log('Task delayed:', taskId, 'delay (s):', event.delay);
      break;
    case 'taskCloned':
      console.log('Task cloned:', taskId);
      break;
    // The trigger table names id 30 `predictedTaskDelay`; the published sample
    // payload carries `taskPredictedDelay`. Accept both (or route on triggerId 30).
    case 'predictedTaskDelay':
    case 'taskPredictedDelay':
      console.log('Predicted task delay:', taskId, 'delayTime:', event.data?.task?.delayTime);
      break;

    // Workers (data.worker)
    case 'workerDuty':
      // status: 0 = off-duty, 1 = on-duty
      console.log('Worker duty changed:', workerId, 'status:', event.status);
      break;
    case 'workerCreated':
      console.log('Worker created:', workerId);
      break;
    case 'workerDeleted':
      console.log('Worker deleted:', workerId);
      break;
    case 'workerUpdated':
      console.log('Worker updated:', workerId);
      break;

    // SMS (top-level fields, data is {})
    case 'smsRecipientResponseMissed':
      console.log('Missed SMS response from:', event.from);
      break;
    case 'SMSRecipientOptOut':
      console.log('Recipient opted out of SMS:', event.recipient?.id);
      break;

    // Jobs (large payloads)
    case 'autoDispatchJobCompleted':
      console.log('Auto-dispatch completed:', event.dispatchId ?? event.data?.dispatch?.id);
      break;
    case 'taskBatchCreateJobCompleted':
      console.log('Batch create completed:', event.status, 'created:', event.tasksCreated, 'errored:', event.tasksErrored);
      break;
    case 'routeOptimizationJobCompleted':
      console.log('Route optimization completed:', event.dispatchId);
      break;

    // Route plans (data.routePlan, data.worker)
    case 'routePlanCreated':
    case 'routePlanStarted':
    case 'routePlanCompleted':
    case 'routePlanUpdated':
    case 'routePlanUnassigned':
    case 'routePlanAssigned':
    case 'routePlanDelayed':
      console.log(`${event.triggerName}:`, event.routePlanId, 'worker:', workerId);
      break;

    default:
      // Onfleet adds triggers over time: log and acknowledge, don't error.
      console.log(`Unhandled Onfleet trigger: ${event.triggerName} (id ${event.triggerId})`);
  }
}

// Validation handshake: Onfleet sends GET ?check=<random_string> when the
// webhook is created. Echo the value as plain text with a 200 (204 is
// rejected). This request is not signed — do not verify it.
app.get('/webhooks/onfleet', (req, res) => {
  const check = req.query.check;
  if (typeof check !== 'string') {
    return res.status(400).type('text/plain').send('Missing check parameter');
  }
  res.status(200).type('text/plain').send(check);
});

// Event delivery: POST, signed. Use the raw body for verification.
app.post('/webhooks/onfleet', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.ONFLEET_WEBHOOK_SECRET;
  if (!isValidHexSecret(secret)) {
    // Fail closed: never accept unverified deliveries.
    console.error('ONFLEET_WEBHOOK_SECRET is missing or not a hex string; rejecting webhook');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const verification = verifyOnfleetSignature(
    rawBody,
    req.get('x-onfleet-signature'),
    secret
  );

  if (!verification.valid) {
    console.error('Onfleet webhook verification failed:', verification.error);
    return res.status(400).send(`Webhook Error: ${verification.error}`);
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    console.error('Invalid JSON payload:', err.message);
    return res.status(400).send('Invalid JSON payload');
  }

  // Acknowledge first, then process: Onfleet times out at 10 seconds.
  res.status(200).json({ received: true });

  setImmediate(() => {
    try {
      handleOnfleetEvent(event);
    } catch (err) {
      console.error('Error processing Onfleet event:', err);
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyOnfleetSignature = verifyOnfleetSignature;
module.exports.handleOnfleetEvent = handleOnfleetEvent;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: GET + POST http://localhost:${PORT}/webhooks/onfleet`);
  });
}
