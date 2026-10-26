// Generated with: vellum-webhooks skill
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
 * Vellum Monitoring webhooks are authenticated with a static header you configure:
 * API Key Header (any header name) or Bearer Token (Authorization: Bearer <token>).
 * The whole header value is compared; a "Bearer " prefix is not stripped or parsed.
 * Vellum's optional HMAC signature (X-Vellum-Timestamp / X-Vellum-Signature) is NOT verified here.
 */
function verifyVellumRequest(
  headers,
  secret = process.env.VELLUM_WEBHOOK_SECRET,
  headerName = process.env.VELLUM_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lowercases header names
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}

// In-memory dedupe on the event id. Use a shared store (Redis, database) in production.
const seen = new Set();

function handleEvent(payload) {
  const { name, body } = payload;

  switch (name) {
    case 'workflow.execution.initiated':
      console.log(`Workflow execution initiated: ${body?.workflow_class?.name}`);
      // TODO: record the run start (body.inputs)
      break;

    case 'workflow.execution.fulfilled':
      console.log(`Workflow execution fulfilled: ${body?.workflow_class?.name}`);
      // TODO: store the result (body.outputs)
      break;

    case 'workflow.execution.rejected':
      console.log(`Workflow execution rejected: ${body?.error?.code} ${body?.error?.message}`);
      // TODO: alert on the failure (body.error)
      break;

    case 'workflow_execution.usage_calculation.fulfilled':
    case 'workflow.usage_calculation.fulfilled':
      console.log('Workflow usage calculated');
      // TODO: record cost (body.usage, body.cost)
      break;

    case 'workflow_execution.usage_calculation.rejected':
      console.log('Workflow usage calculation failed');
      // TODO: flag the run for re-calculation
      break;

    case 'metric.execution.fulfilled':
      console.log('Metric execution fulfilled');
      // TODO: store the metric result (body)
      break;

    default:
      console.log(`Unhandled event: ${name}`);
  }
}

// Vellum's docs don't name the HTTP method, so accept any. Authenticate first, for every method,
// reading the body raw (any content type) and parsing it only after the check.
app.all('/webhooks/vellum', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyVellumRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook credential' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (raw.trim() === '') {
    return res.status(200).json({ received: true }); // empty body: nothing to process
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  if (payload.id) {
    if (seen.has(payload.id)) return res.status(200).json({ received: true, duplicate: true });
    seen.add(payload.id);
  }

  try {
    handleEvent(payload);
  } catch (err) {
    if (payload.id) seen.delete(payload.id); // let a retry reprocess it
    console.error('Error handling Vellum event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyVellumRequest = verifyVellumRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/vellum`);
  });
}
