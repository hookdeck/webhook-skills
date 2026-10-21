// Generated with: n8n-webhooks skill
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
 * n8n's HTTP Request node does not sign requests. Authenticate with the shared
 * secret from the node's credential:
 *   - Header auth: <N8N_WEBHOOK_HEADER>: <secret>   (e.g. X-Webhook-Secret)
 *   - Bearer auth: Authorization: Bearer <secret>
 *   - Basic auth:  Authorization: Basic base64(user:password)  (optional)
 */
function verifyN8nRequest(headers, config = process.env) {
  const secret = config.N8N_WEBHOOK_SECRET;
  const headerName = (config.N8N_WEBHOOK_HEADER || 'X-Webhook-Secret').toLowerCase();
  const authorization = headers['authorization'] || '';

  if (secret) {
    const headerValue = headers[headerName];
    if (headerValue && safeEqual(headerValue, secret)) return true;

    const bearer = authorization.match(/^Bearer\s+(.+)$/i);
    if (bearer && safeEqual(bearer[1].trim(), secret)) return true;
  }

  const user = config.N8N_BASIC_AUTH_USER;
  const password = config.N8N_BASIC_AUTH_PASSWORD;
  const basic = authorization.match(/^Basic\s+(.+)$/i);
  if (user && password && basic) {
    const decoded = Buffer.from(basic[1].trim(), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    if (sep !== -1) {
      // Compare both parts every time (no short-circuit on the username).
      const userOk = safeEqual(decoded.slice(0, sep), user);
      const passwordOk = safeEqual(decoded.slice(sep + 1), password);
      if (userOk && passwordOk) return true;
    }
  }

  return false;
}

/**
 * n8n has no built-in event types: the payload is whatever your workflow sends.
 * These examples assume the workflow sends { "event": "...", "id": "...", "data": {...} }.
 */
function handleEvent(payload) {
  const { event, id, data = {} } = payload;

  switch (event) {
    case 'lead.created':
      console.log(`Lead created: ${data.email}`);
      // TODO: add the lead to your CRM
      break;

    case 'order.created':
      console.log(`Order created: ${data.order_id}`);
      // TODO: fulfil the order
      break;

    case 'workflow.completed':
      console.log(`Workflow completed: ${data.workflow_name}`);
      // TODO: mark the job as done
      break;

    case 'workflow.failed':
      console.log(`Workflow failed: ${data.workflow_name} (${data.error})`);
      // TODO: alert the owning team
      break;

    default:
      console.log(`Unhandled event: ${event} (id: ${id})`);
  }
}

// Read the body raw so the request is authenticated before anything is parsed.
app.post('/webhooks/n8n', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyN8nRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing credentials' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling n8n event:', err);
    // A non-2xx makes the n8n HTTP Request node fail (and retry, if Retry On Fail is on).
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyN8nRequest = verifyN8nRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/n8n`);
  });
}
