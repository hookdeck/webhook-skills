// Generated with: omnara-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const { Webhook } = require('standardwebhooks');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// IMPORTANT: express.raw() keeps the exact bytes Omnara signed, whatever the content type.
// Parse the body only after the signature check.
app.post('/webhooks/omnara', express.raw({ type: '*/*' }), (req, res) => {
  // Fail closed: never accept deliveries when no secret is configured
  const secret = process.env.OMNARA_WEBHOOK_SECRET;
  if (!secret) {
    console.error('OMNARA_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Read the webhook-* headers; when webhook-id is absent, fall back to the svix-* headers
  const prefix = req.headers['webhook-id'] ? 'webhook' : 'svix';
  const id = req.headers[`${prefix}-id`];
  const timestamp = req.headers[`${prefix}-timestamp`];
  const signature = req.headers[`${prefix}-signature`];
  if (!id || !timestamp || !signature) {
    // Omnara only signs when event_webhook.signing_secret_id is set on the agent
    return res.status(400).json({ error: 'Missing required webhook headers' });
  }

  let payload;
  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, entry and enforces
    // a fixed 5-minute timestamp window (see references/verification.md to change that).
    // The library strips a whsec_ prefix if present, otherwise base64-decodes the whole secret.
    // On success it returns the parsed JSON body, so there is no second parse.
    payload = new Webhook(secret).verify(req.body, {
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    });
  } catch (err) {
    console.error('Omnara webhook verification failed:', err.message);
    // The signature was valid but the body is not JSON
    if (err instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON' });
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  // Body: { event, data }. `event` is the event type; timeline events repeat it in data.event_kind.
  // Webhook-Id is stable across retries: deduplicate on it (and tool calls on data.tool_call_id).
  const event = payload?.event;
  const data = payload?.data ?? {};
  console.log(`Received Omnara webhook ${id}: ${event}`);

  switch (event) {
    case 'agent_input':
      console.log('Agent input:', data.agent_id, data.input_kind, data.turn_id);
      break;
    case 'model_output':
      console.log('Model output:', data.agent_id, data.stop_reason, data.turn_id);
      break;
    case 'tool_result':
      console.log('Tool result:', data.tool_call_id, data.outcome);
      break;
    case 'context_checkpoint':
      console.log('Context checkpoint:', data.context_checkpoint_id, data.summarized_through_event_sequence);
      break;
    case 'tool_call_update':
      // A notification to fetch the tool call: state snapshot only, no arguments.
      // For custom tool execution handle `ready` and deduplicate by tool_call_id.
      console.log('Tool call update:', data.tool_call_id, data.state, data.interaction_update?.state);
      break;
    default:
      // Return 2xx for events you don't handle, or Omnara keeps retrying them
      console.log('Unhandled event type:', event);
  }

  res.status(200).json({ success: true, event });
});

// Start the server only when run directly (not when imported by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Omnara webhook server running on http://localhost:${PORT}/webhooks/omnara`);
  });
}

module.exports = { app };
