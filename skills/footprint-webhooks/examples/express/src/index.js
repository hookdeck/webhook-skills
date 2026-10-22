// Generated with: footprint-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { Webhook } from 'svix';

dotenv.config({ quiet: true });

export const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// IMPORTANT: express.raw() keeps the exact bytes Footprint (Svix) signed, whatever the content type
app.post('/webhooks/footprint', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.FOOTPRINT_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('FOOTPRINT_WEBHOOK_SECRET is missing or not a whsec_ secret');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const svixId = req.headers['svix-id'];
  const svixTimestamp = req.headers['svix-timestamp'];
  const svixSignature = req.headers['svix-signature'];
  if (!svixId || !svixTimestamp || !svixSignature) {
    return res.status(400).json({ error: 'Missing required webhook headers' });
  }

  try {
    // Checks HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${body}` against every v1, signature
    // and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
    new Webhook(secret).verify(req.body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err) {
    console.error('Footprint webhook verification failed:', err.message);
    const error = /timestamp/i.test(err.message) ? 'Timestamp too old' : 'Invalid signature';
    return res.status(400).json({ error });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // The event name is in the body's `event_kind` field
  const type = event.event_kind;
  // svix-id is stable across retries: use it to deduplicate
  console.log(`Received Footprint webhook ${svixId}: ${type}`);

  switch (type) {
    case 'footprint.onboarding.completed':
      console.log('Onboarding completed:', event.fp_id, event.status, 'manual review:', event.requires_manual_review);
      break;
    case 'footprint.onboarding.incomplete':
      console.log('Onboarding incomplete:', event.fp_id, event.onboarding_id);
      break;
    case 'footprint.onboarding.status_changed':
      // Deprecated by Footprint in favor of onboarding.completed and user.manual_review
      console.log('Onboarding status changed:', event.fp_id, event.new_status);
      break;
    case 'footprint.watchlist_check.completed':
      console.log('Watchlist check completed:', event.fp_id, event.status, event.error);
      break;
    case 'footprint.user.manual_review':
      // Call GET /users/{fp_id} for the user's new status
      console.log('Manual review changed status:', event.fp_id);
      break;
    case 'footprint.user.info_requested':
      console.log('More information requested from user:', event.fp_id);
      break;
    case 'footprint.user.bank_link_updated':
      console.log('Bank link updated:', event.link_id, event.link_state);
      break;
    case 'footprint.vault.updated':
      console.log('Vault updated:', event.fp_id, event.fields);
      break;
    case 'footprint.entity.entity_status_set':
      console.log('Entity status set:', event.fp_id, event.status);
      break;
    default:
      console.log('Unhandled event type:', type);
  }

  res.status(200).json({ success: true, type });
});

// Start the server only when run directly (not when imported by tests)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Footprint webhook server running on http://localhost:${PORT}/webhooks/footprint`);
  });
}
