// Generated with: strapi-webhooks skill
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
 * Strapi does not sign webhooks. Authenticate the request with a header you add in Strapi
 * (per webhook in the admin panel, or webhooks.defaultHeaders in config/server). The header
 * name is yours to choose; the expected value is compared in full, so a "Bearer " prefix
 * typed in Strapi must be part of STRAPI_WEBHOOK_SECRET. Nothing is stripped or parsed.
 */
function verifyStrapiRequest(
  headers,
  secret = process.env.STRAPI_WEBHOOK_SECRET,
  headerName = process.env.STRAPI_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lowercases incoming header names
  return Boolean(received) && safeEqual(received, secret);
}

function handleEvent(payload, headers) {
  // The body's `event` matches the X-Strapi-Event header.
  const event = payload.event || headers['x-strapi-event'];

  switch (event) {
    case 'entry.create':
      console.log(`Entry created: ${payload.model} ${payload.entry && payload.entry.documentId}`);
      // TODO: index the new entry (payload.entry)
      break;

    case 'entry.update':
      console.log(`Entry updated: ${payload.model} ${payload.entry && payload.entry.documentId}`);
      // TODO: refresh caches or search index
      break;

    case 'entry.delete':
      console.log(`Entry deleted: ${payload.model} ${payload.entry && payload.entry.documentId}`);
      // TODO: remove the entry downstream (payload only carries the entry's own fields)
      break;

    case 'entry.publish':
      console.log(`Entry published: ${payload.model} ${payload.entry && payload.entry.documentId}`);
      // TODO: trigger a site rebuild or revalidate the page
      break;

    case 'entry.unpublish':
      console.log(`Entry unpublished: ${payload.model} ${payload.entry && payload.entry.documentId}`);
      // TODO: take the page down
      break;

    case 'entry.draft-discard':
      console.log(`Draft discarded: ${payload.model} ${payload.entry && payload.entry.documentId}`);
      // TODO: refresh previews
      break;

    case 'media.create':
      console.log(`Media created: ${payload.media && payload.media.name}`);
      // TODO: sync the file (payload.media.url, payload.media.formats)
      break;

    case 'media.update':
      console.log(`Media updated: ${payload.media && payload.media.name}`);
      // TODO: refresh the cached file
      break;

    case 'media.delete':
      console.log(`Media deleted: ${payload.media && payload.media.name}`);
      // TODO: purge the file from your CDN
      break;

    case 'review-workflows.updateEntryStage': {
      // Enterprise only. This envelope carries `entity` and `workflow`, not `entry`.
      const stages = payload.workflow && payload.workflow.stages;
      console.log(
        `Review stage changed: ${stages && stages.from && stages.from.name} -> ${stages && stages.to && stages.to.name}`
      );
      // TODO: notify reviewers
      break;
    }

    case 'releases.publish':
      // Growth and Enterprise. This envelope carries `release`, not `entry`.
      console.log(`Release published: ${payload.release && payload.release.name}`);
      // TODO: trigger a deployment
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/strapi', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyStrapiRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook credential' });
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
    handleEvent(payload, req.headers);
  } catch (err) {
    console.error('Error handling Strapi event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyStrapiRequest = verifyStrapiRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/strapi`);
  });
}
