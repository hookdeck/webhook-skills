// Generated with: onfido-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const { WebhookEventVerifier } = require('@onfido/api');

const app = express();

// Verify the X-SHA2-Signature header (HMAC-SHA256 hex of the raw body, keyed
// with the webhook token). Returns the parsed event, or null if invalid.
function verifyOnfidoWebhook(rawBody, signature, token) {
  if (!signature || !token) return null;
  try {
    // readPayload throws on a bad signature (including wrong-length hex)
    return new WebhookEventVerifier(token).readPayload(rawBody, signature);
  } catch {
    return null;
  }
}

// Raw body is required: parsed JSON may be reordered and break the signature
app.post('/webhooks/onfido', express.raw({ type: '*/*' }), (req, res) => {
  const event = verifyOnfidoWebhook(
    req.body,
    req.get('X-SHA2-Signature'),
    process.env.ONFIDO_WEBHOOK_TOKEN
  );

  if (!event) {
    console.error('Onfido webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  const { resource_type: resourceType, action, object } = event.payload || {};

  switch (action) {
    case 'check.started':
      console.log(`Check started: ${object?.id}`);
      break;
    case 'check.completed':
      console.log(`Check completed: ${object?.id} (${object?.status})`);
      break;
    case 'report.completed':
      console.log(`Report completed: ${object?.id} (${object?.status})`);
      break;
    case 'workflow_task.started':
      console.log(`Workflow task started: ${object?.id}`);
      break;
    case 'workflow_task.completed':
      console.log(`Workflow task completed: ${object?.id}`);
      break;
    case 'workflow_run.completed':
      console.log(`Workflow run completed: ${object?.id} (${object?.status})`);
      break;
    default:
      console.log(`Unhandled Onfido event: ${resourceType} / ${action}`);
  }

  // Respond 2xx within 10 seconds or Onfido retries
  res.status(200).json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Onfido webhook server listening on port ${port}`));
}

module.exports = { app, verifyOnfidoWebhook };
