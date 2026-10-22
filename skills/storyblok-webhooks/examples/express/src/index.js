require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Storyblok webhook signature.
 * Storyblok sends hex(HMAC-SHA1(secret, rawBody)) in the `webhook-signature` header.
 * This is NOT Standard Webhooks: no timestamp, no message ID, no prefix.
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string|undefined} signatureHeader - `webhook-signature` header value
 * @param {string|undefined} secret - Webhook secret from Storyblok settings
 * @returns {boolean}
 */
function verifyStoryblokWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
  const received = signatureHeader.trim().toLowerCase();

  // timingSafeEqual throws when lengths differ
  if (received.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

/**
 * Storyblok has no event-type header: the event is `action` in the body, and
 * `action` is shared between entities, so pick the entity from its id field.
 */
function entityOf(payload) {
  if (payload.experiment_id !== undefined) return 'experiment';
  if (payload.release_id !== undefined) return 'release';
  if (payload.branch_id !== undefined) return 'pipeline';
  if (payload.datasource_slug !== undefined) return 'datasource';
  if (payload.asset_id !== undefined) return 'asset';
  if (payload.user_id !== undefined) return 'user';
  if (payload.workflow_name !== undefined) return 'workflow';
  if (payload.block_uid !== undefined) return 'discussion';
  if (payload.story_id !== undefined) return 'story';
  return 'unknown';
}

function handleEvent(payload) {
  const entity = entityOf(payload);
  const event = `${entity}.${payload.action}`;

  switch (event) {
    case 'story.published':
      console.log(`Story published: ${payload.full_slug}`);
      // TODO: Rebuild the site or purge the cache for this slug
      break;

    case 'story.unpublished':
      console.log(`Story unpublished: ${payload.full_slug}`);
      // TODO: Remove the page from the site or search index
      break;

    case 'story.deleted':
      console.log(`Story deleted: ${payload.full_slug}`);
      // TODO: Remove the page and clean up
      break;

    case 'story.moved':
      console.log(`Story moved: ${payload.old_full_slug} -> ${payload.full_slug}`);
      // TODO: Add a redirect from the old slug
      break;

    case 'datasource.entries_updated':
    case 'datasource.entries_deleted':
      console.log(`Datasource ${payload.datasource_slug}: ${payload.action}`);
      // TODO: Refresh cached datasource entries
      break;

    case 'workflow.stage.changed':
      console.log(`Workflow ${payload.workflow_name} -> ${payload.workflow_stage_name}`);
      // TODO: Notify reviewers
      break;

    case 'release.merged':
      console.log(`Release ${payload.release_id} merged`);
      // TODO: Rebuild the site
      break;

    case 'pipeline.deployed':
      console.log(`Pipeline branch ${payload.branch_id} deployed`);
      // TODO: Trigger downstream deploys
      break;

    default:
      // asset.*, user.*, discussion.*, experiment.* and anything new
      console.log(`Unhandled event: ${event}`);
  }

  return event;
}

// Storyblok webhook endpoint.
// express.raw with '*/*' keeps the raw bytes whatever the content type is,
// which the signature is computed over.
app.post('/webhooks/storyblok',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signature = req.headers['webhook-signature'];

    // No body means req.body is not a Buffer; nothing to verify
    if (!Buffer.isBuffer(req.body)) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    if (!verifyStoryblokWebhook(req.body, signature, process.env.STORYBLOK_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Parse the payload only after verification
    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    const event = handleEvent(payload);

    // Storyblok expects a 2xx with content-type: application/json and does not retry
    res.status(200).json({ received: true, event });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyStoryblokWebhook, entityOf };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/storyblok`);
  });
}
