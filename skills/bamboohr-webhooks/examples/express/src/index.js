// Generated with: bamboohr-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

// X-BambooHR-Signature is the hex HMAC-SHA256 of the raw body followed directly by
// the X-BambooHR-Timestamp header value (no separator), keyed with the webhook's private key
function verifySignature(rawBody, signature, timestamp, privateKey) {
  if (!signature || !timestamp || !privateKey) return false;
  if (!HEX_SHA256.test(signature)) return false;
  const message = Buffer.concat([rawBody, Buffer.from(timestamp, 'latin1')]);
  const expected = crypto.createHmac('sha256', privateKey).update(message).digest();
  const provided = Buffer.from(signature.toLowerCase(), 'hex'); // validated above
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

// Opt-in replay window. Off by default: retries and replays resend the original timestamp.
// BambooHR doesn't document the header format, so it is only parsed when enabled
// (epoch seconds or milliseconds).
function withinTolerance(timestamp, toleranceSeconds) {
  if (!toleranceSeconds || toleranceSeconds <= 0) return true;
  if (!/^\d+$/.test(timestamp)) return false;
  let sent = Number(timestamp);
  if (sent > 1e11) sent /= 1000; // milliseconds
  return Math.abs(Date.now() / 1000 - sent) <= toleranceSeconds;
}

// Raw body is required for signature verification; '*/*' accepts JSON and form payloads
app.post('/webhooks/bamboohr', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const signature = req.get('X-BambooHR-Signature');
  const timestamp = req.get('X-BambooHR-Timestamp');

  if (!verifySignature(rawBody, signature, timestamp, process.env.BAMBOOHR_WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }
  if (!withinTolerance(timestamp, Number(process.env.BAMBOOHR_WEBHOOK_TOLERANCE_SECONDS || 0))) {
    return res.status(401).send('Timestamp outside tolerance');
  }

  // Parse only after verification
  const contentType = req.get('Content-Type') || '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    // Form payloads use keys like employees[40351][action]; JSON is recommended, so just acknowledge
    console.log('BambooHR: form-encoded payload received (configure the webhook for JSON to process it)');
    return res.status(200).json({ received: true });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // Event-based webhooks (recommended by BambooHR): one event per POST, { type, timestamp, data }
  if (typeof payload.type === 'string') {
    const data = payload.data || {};
    switch (payload.type) {
      case 'employee.created':
        console.log(`BambooHR: employee ${data.employeeId} created`);
        break;
      case 'employee.updated':
        console.log(`BambooHR: employee ${data.employeeId} updated:`, data.changedFields);
        break;
      case 'employee.deleted':
        console.log(`BambooHR: employee ${data.employeeId} deleted`);
        break;
      case 'company.updated':
      case 'company.deleted':
      case 'company-integrations.updated':
        console.log(`BambooHR: ${payload.type} for company ${data.companyId}`);
        break;
      default:
        console.log(`BambooHR: unhandled event type ${payload.type}`);
    }
    return res.status(200).json({ received: true });
  }

  // Field-based (legacy) webhooks: employees may be batched into one POST; ignore unrecognized fields
  const employees = Array.isArray(payload.employees) ? payload.employees : [];
  for (const employee of employees) {
    switch (employee.action) {
      case 'Created':
        console.log(`BambooHR: employee ${employee.id} created`);
        break;
      case 'Updated':
        console.log(`BambooHR: employee ${employee.id} updated:`, employee.changedFields);
        break;
      case 'Deleted':
        console.log(`BambooHR: employee ${employee.id} deleted`);
        break;
      default:
        console.log(`BambooHR: unhandled action ${employee.action} for employee ${employee.id}`);
    }
  }

  res.status(200).json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`BambooHR webhook server listening on port ${port}`));
}

module.exports = app;
