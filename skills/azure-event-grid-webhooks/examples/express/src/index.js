// Generated with: azure-event-grid-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');

const {
  SUBSCRIPTION_DELETED_EVENT_TYPE,
  authenticate,
  findValidationCode,
  handleAbuseProtection,
  normalizeEvents,
} = require('./eventgrid');

const app = express();

const WEBHOOK_PATH = '/webhooks/azure-event-grid';

// Event Grid treats ONLY 200, 201, 202, 203 and 204 as successful deliveries.
// Everything outside 200-204 is a failure and is retried or dead-lettered.
// The validation handshake is stricter still: it must be 200 — "HTTP 202
// Accepted isn't recognized as a valid Event Grid subscription validation
// response" — so this handler answers 200 everywhere.
const ACK_STATUS = 200;

// Event Grid sends `application/json; charset=utf-8` for the Event Grid schema
// and `application/cloudevents+json; charset=utf-8` for CloudEvents, so the
// JSON parser must accept both. There is no signature over the body, so unlike
// an HMAC provider there is no raw-body requirement here.
const jsonParser = express.json({
  limit: '2mb', // Event Grid caps events and arrays at 1 MB
  type: [
    'application/json',
    'application/cloudevents+json',
    'application/cloudevents-batch+json',
  ],
});

/**
 * CloudEvents v1.0 abuse-protection preflight.
 *
 * This fires INSTEAD OF the SubscriptionValidationEvent when the event
 * subscription uses `--event-delivery-schema cloudeventschemav1_0`.
 */
app.options(WEBHOOK_PATH, (req, res) => {
  const result = handleAbuseProtection(req.get('WebHook-Request-Origin'));
  res.set(result.headers);
  console.log(
    'CloudEvents abuse-protection preflight from',
    req.get('WebHook-Request-Origin') || '(no WebHook-Request-Origin)',
    '->',
    result.status
  );
  res.sendStatus(result.status);
});

app.post(WEBHOOK_PATH, jsonParser, async (req, res) => {
  // Event Grid schema => JSON array. CloudEvents schema => single JSON object.
  const events = normalizeEvents(req.body);
  if (!events) {
    return res.status(400).json({ error: 'Invalid Event Grid payload' });
  }

  // The handshake arrives as an array containing ONLY the validation event.
  const validationCode = findValidationCode(events);

  // Authenticate before answering anything, including the handshake. For the
  // handshake specifically, withholding the 200 is how validation is failed on
  // purpose for a subscription we do not recognise.
  const auth = await authenticate((name) => req.get(name), {
    isValidation: validationCode !== null,
    // Event Grid replays every query parameter from the subscription's endpoint
    // URL on each delivery, so a secret can ride there instead of in a header.
    getQueryParam: (name) => req.query[name],
  });
  if (!auth.ok) {
    console.warn('Rejected Event Grid request:', auth.status, auth.error);
    return res.status(auth.status).json({ error: auth.error });
  }

  if (validationCode) {
    console.log('Subscription validation handshake for:', auth.subscriptionName);
    // Single JSON OBJECT (not an array), HTTP 200, within 30 seconds.
    // The documented field name is camelCase `validationResponse`; Microsoft's
    // own C#/JS samples emit PascalCase `ValidationResponse`.
    return res.status(200).json({ validationResponse: validationCode });
  }

  // Retry signal: `aeg-delivery-count` is the number of attempts for this event.
  const deliveryCount = Number(req.get('aeg-delivery-count') || 1);
  if (deliveryCount > 1) {
    console.log('Retry delivery, attempt', deliveryCount);
  }
  console.log('aeg-event-type:', req.get('aeg-event-type'));

  for (const event of events) {
    // Delivery is at-least-once and unordered: de-duplicate on the event id.
    // Your code: if (await alreadyProcessed(event.id)) continue;
    console.log(`[${event.schema}] ${event.type} ${event.id} subject=${event.subject}`);

    switch (event.type) {
      case SUBSCRIPTION_DELETED_EVENT_TYPE:
        // data.eventSubscriptionId is the Azure resource ID of the deleted
        // event subscription. Also flagged by `aeg-event-type: SubscriptionDeletion`.
        console.log('Event subscription deleted:', event.data && event.data.eventSubscriptionId);
        break;

      case 'Microsoft.Storage.BlobCreated':
        // Published by Azure Blob Storage, not by Event Grid itself.
        console.log('Blob created:', event.data && event.data.url);
        break;

      case 'Microsoft.Storage.BlobDeleted':
        console.log('Blob deleted:', event.data && event.data.url);
        break;

      case 'Microsoft.Resources.ResourceWriteSuccess':
        console.log('Resource write succeeded:', event.subject);
        break;

      default:
        // Event Grid is a broker: most event types belong to the publishing
        // service or to your own custom topic. Route on your own types here.
        console.log('Unhandled event type:', event.type);
    }
  }

  // Acknowledge fast. Event Grid waits 30 seconds for a response; exceeding it
  // queues the message for retry. Do slow work asynchronously.
  return res.status(ACK_STATUS).json({ received: events.length });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// express.json() rejects malformed bodies before the handler runs.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  return next(err);
});

module.exports = { app };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}${WEBHOOK_PATH}`);
    console.log(`CloudEvents preflight: OPTIONS http://localhost:${PORT}${WEBHOOK_PATH}`);
  });
}
