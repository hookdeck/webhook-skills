// Generated with: datocms-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Hashing both sides gives equal-length buffers, so timingSafeEqual never throws
// and the length of the credential isn't leaked.
const digest = (value) => crypto.createHash('sha256').update(value).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));

/**
 * DatoCMS does not sign payloads. If the webhook has HTTP basic auth set, every request
 * carries `Authorization: Basic base64(username:password)`. This authenticates the sender
 * only: it does not cover the body and gives no replay protection, so use HTTPS and rotate
 * the credentials if they leak.
 */
function verifyDatoCmsRequest(
  headers,
  username = process.env.DATOCMS_WEBHOOK_USERNAME,
  password = process.env.DATOCMS_WEBHOOK_PASSWORD
) {
  if (!username || !password) return false; // never accept when unconfigured

  // Scheme is case-insensitive.
  const match = /^basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(headers['authorization'] || '');
  if (!match) return false;

  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const colon = decoded.indexOf(':'); // split on the first colon: passwords may contain ':'
  if (colon < 0) return false;

  // Evaluate both comparisons before deciding (no short-circuit).
  const userOk = safeEqual(decoded.slice(0, colon), username);
  const passOk = safeEqual(decoded.slice(colon + 1), password);
  return userOk && passOk;
}

function handleEvent(payload) {
  const { entity_type: entityType, event_type: eventType } = payload;

  switch (`${entityType} ${eventType}`) {
    case 'item create':
      console.log(`Record created: ${payload.entity?.id}`);
      // TODO: index the new record
      break;

    case 'item update':
      console.log(`Record updated: ${payload.entity?.id}`);
      // TODO: diff payload.previous_entity against payload.entity
      break;

    case 'item delete':
      console.log(`Record deleted: ${payload.entity?.id}`);
      // TODO: remove the record from external systems
      break;

    case 'item publish':
      console.log(`Record published: ${payload.entity?.id}`);
      // TODO: trigger a site rebuild or sync published content
      break;

    case 'item unpublish':
      console.log(`Record unpublished: ${payload.entity?.id}`);
      // TODO: remove the record from public search
      break;

    case 'item_type create':
    case 'item_type update':
    case 'item_type delete':
      console.log(`Model ${eventType}: ${payload.entity?.id}`);
      // TODO: sync the schema
      break;

    case 'upload create':
    case 'upload update':
    case 'upload delete':
      console.log(`Upload ${eventType}: ${payload.entity?.id}`);
      // TODO: sync the asset to your CDN
      break;

    case 'build_trigger deploy_started':
    case 'build_trigger deploy_succeeded':
    case 'build_trigger deploy_failed':
      console.log(`Build trigger ${eventType}: ${payload.entity?.id}`);
      // TODO: post a deploy notification
      break;

    case 'environment deploy_started':
    case 'environment deploy_succeeded':
    case 'environment deploy_failed':
      console.log(`Environment ${eventType}: ${payload.entity?.id}`);
      // TODO: post a deploy notification
      break;

    case 'maintenance_mode change':
      console.log('Maintenance mode changed');
      // TODO: pause integrations while maintenance mode is on
      break;

    case 'sso_user create':
      console.log(`SSO user added: ${payload.entity?.id}`);
      // TODO: audit the new collaborator
      break;

    case 'cda_cache_tags invalidate':
      console.log('CDA cache tags invalidated');
      // TODO: purge your cache (payload.entity holds the tags)
      break;

    default:
      // Custom payloads may omit entity_type / event_type; acknowledge them anyway.
      console.log(`Unhandled event: ${entityType} ${eventType}`);
  }
}

// Read the body raw (any content type, custom payloads may not be JSON) so the request is
// authenticated before anything is parsed.
app.post('/webhooks/datocms', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyDatoCmsRequest(req.headers)) {
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
    console.error('Error handling DatoCMS event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyDatoCmsRequest = verifyDatoCmsRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/datocms`);
  });
}
