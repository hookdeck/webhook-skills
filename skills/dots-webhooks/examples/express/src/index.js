// Generated with: dots-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { Webhook } from 'svix';

dotenv.config({ quiet: true });

export const app = express();
const PORT = process.env.PORT || 3000;

// Dots delivers through Svix (svix-* headers). Fall back to the Standard Webhooks
// webhook-* names when svix-id is absent, the same way Hookdeck does. Never mix the two sets.
function resolveHeaders(headers) {
  const prefix = headers['svix-id'] ? 'svix' : 'webhook';
  const id = headers[`${prefix}-id`];
  const timestamp = headers[`${prefix}-timestamp`];
  const signature = headers[`${prefix}-signature`];
  if (!id || !timestamp || !signature) return null;
  return { id, timestamp, signature };
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// IMPORTANT: express.raw() keeps the exact bytes Dots (Svix) signed, whatever the content type
app.post('/webhooks/dots', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.DOTS_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('DOTS_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const sig = resolveHeaders(req.headers);
  if (!sig) {
    return res.status(400).json({ error: 'Missing required webhook headers' });
  }

  try {
    // Checks HMAC-SHA256 over `${id}.${timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    // The values go in under both header-name sets, which the svix library accepts either of.
    new Webhook(secret).verify(req.body, {
      'svix-id': sig.id,
      'svix-timestamp': sig.timestamp,
      'svix-signature': sig.signature,
      'webhook-id': sig.id,
      'webhook-timestamp': sig.timestamp,
      'webhook-signature': sig.signature,
    });
  } catch (err) {
    console.error('Dots webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The event name is the body's top-level `event` field. Payloads carry only ids:
  // fetch the resource from the Dots API for its current state.
  const type = event?.event;
  // svix-id is stable across retries: use it to deduplicate
  console.log(`Received Dots webhook ${sig.id}: ${type}`);

  switch (type) {
    case 'payment_intent.updated':
      console.log('Payment intent updated:', event.payment_intent_id);
      break;
    case 'payment_method.updated':
      console.log('Payment method updated:', event.payment_method_id);
      break;
    case 'flow.updated':
      console.log('Flow updated:', event.flow_id);
      break;
    case 'dispute.updated':
      console.log('Dispute updated:', event.dispute_id);
      break;
    case 'payout_request.updated':
      console.log('Payout request updated:', event.payout_request_id);
      break;
    case 'organization.updated':
      console.log('Organization updated:', event.organization_id);
      break;
    case 'app.updated':
      console.log('App updated:', event.app_id);
      break;
    case 'transfer.updated':
      console.log('Transfer updated:', event.transfer_id);
      break;
    case 'payout_link.updated':
      console.log('Payout link updated:', event.payout_link_id);
      break;
    case 'user.updated':
      console.log('User updated:', event.user_id);
      break;
    case 'user.onboarded':
      // Sent once per verified bank account
      console.log('User onboarded:', event.user_id, 'bank account:', event.ach_account_id);
      break;
    case 'user.onboarding_revoked':
      console.log('User onboarding revoked:', event.user_id, 'bank account:', event.ach_account_id, 'reason:', event.reason);
      break;
    default:
      console.log('Unhandled event type:', type);
  }

  // `api_app_id` is present when an app-originated webhook arrives at an organization-level endpoint
  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Dots webhook server running on http://localhost:${PORT}/webhooks/dots`);
  });
}
