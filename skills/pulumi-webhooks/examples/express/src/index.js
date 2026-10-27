// Generated with: pulumi-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Pulumi Cloud signs a delivery only when the webhook has a shared secret. The
// Pulumi-Webhook-Signature header is the bare lowercase hex HMAC-SHA256 of the raw request body,
// keyed with the secret's UTF-8 bytes. Nothing else (no timestamp, no id) is signed.
// https://www.pulumi.com/docs/deployments/concepts/webhooks/
function verifyPulumi(rawBody, signature, secret) {
  if (!secret || typeof signature !== 'string') return false;
  // Exactly 64 hex chars first: Buffer.from(x, 'hex') silently drops invalid characters
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(rawBody).digest('hex'));
  return crypto.timingSafeEqual(Buffer.from(signature.toLowerCase()), expected);
}

// Raw body is required: the signature covers the exact bytes Pulumi sent.
// type: '*/*' reads the body whatever the Content-Type is, so verification never depends on it.
app.post('/webhooks/pulumi', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.PULUMI_WEBHOOK_SECRET;
  if (!secret) {
    console.error('PULUMI_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyPulumi(rawBody, req.headers['pulumi-webhook-signature'], secret)) {
    console.error('Pulumi webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (event === null || typeof event !== 'object') {
    return res.status(400).send('Invalid payload');
  }

  // The body has no event name: the Pulumi-Webhook-Kind header says which kind of event it is
  const kind = req.headers['pulumi-webhook-kind'];
  const where = `${event.projectName}/${event.stackName}`;

  switch (kind) {
    case 'stack':
      // event.action says what happened to the stack (for example created)
      console.log(`Stack ${event.action}: ${where}`);
      break;
    case 'stack_update':
      // event.kind is the operation (update, refresh, ...), event.result is succeeded or failed
      console.log(`Stack update (${event.kind}) ${event.result}: ${where} ${event.updateUrl}`);
      break;
    case 'stack_preview':
      console.log(`Stack preview (${event.kind}) ${event.result}: ${where} ${event.updateUrl}`);
      break;
    case 'deployment':
      // event.status is the deployment state (for example running)
      console.log(`Deployment ${event.version} ${event.operation} ${event.status}: ${where}`);
      break;
    case 'drift_detection':
      console.log(`Drift detection ${event.status} (drift detected: ${event.driftDetected}): ${where}`);
      break;
    case 'drift_remediation':
      console.log(`Drift remediation ${event.status}: ${where}`);
      break;
    default:
      // Includes policy_violation: log it, or add a case for it
      console.log(`Unhandled event kind: ${kind}`);
  }

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Pulumi webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyPulumi };
