// Generated with: factorial-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Factorial does not sign payloads. If the subscription was created with a
 * `challenge`, every delivery carries it, unchanged, in x-factorial-wh-challenge.
 * Compare the WHOLE header value with the challenge you stored.
 * (Without a challenge Factorial sends nothing to verify.)
 */
function verifyFactorialRequest(headers, challenge = process.env.FACTORIAL_WH_CHALLENGE) {
  if (!challenge) return false; // never accept when unconfigured
  const received = headers['x-factorial-wh-challenge'];
  return Boolean(received) && safeEqual(received, challenge);
}

// The body is the affected resource with no event field: the subscription decides the type.
// Register one target_url per subscription_type (e.g. ...?type=timeoff/leave/create) and
// dispatch on that hint. The `type` query parameter is this example's convention, not Factorial's.
const HANDLERS = {
  'employees/employee/create_with_contract': (r) => console.log(`Employee created: ${r.id} ${r.full_name}`),
  'employees/employee/update': (r) => console.log(`Employee updated: ${r.id} ${r.full_name}`),
  'employees/employee/terminate': (r) => console.log(`Employee terminated: ${r.id} on ${r.terminated_on}`),
  'contracts/contract_version/create': (r) => console.log(`Contract version created: ${r.id}`),
  'timeoff/leave/create': (r) => console.log(`Leave requested: ${r.id}`),
  'timeoff/leave/approve': (r) => console.log(`Leave approved: ${r.id}`),
  'timeoff/leave/reject': (r) => console.log(`Leave rejected: ${r.id}`),
  'attendance/shift/clock_in': (r) => console.log(`Clock in: shift ${r.id}`),
  'ats/application/create': (r) => console.log(`Application created: ${r.id}`),
  'ats/candidate/create': (r) => console.log(`Candidate created: ${r.id}`),
};

function handleResource(subscriptionType, resource) {
  const handler = HANDLERS[subscriptionType];
  if (handler) {
    // Retries re-send an identical body and there is no delivery ID, so make the work idempotent:
    // upsert on resource.id, or dedupe on `${subscriptionType}:${resource.id}:${resource.updated_at}`.
    handler(resource);
  } else {
    console.log(`Unhandled subscription type: ${subscriptionType || '(none)'}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/factorial', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyFactorialRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing x-factorial-wh-challenge' });
  }

  let resource;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    resource = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!resource || typeof resource !== 'object' || Array.isArray(resource)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleResource(req.query.type, resource);
  } catch (err) {
    console.error('Error handling Factorial webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyFactorialRequest = verifyFactorialRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/factorial`);
  });
}
