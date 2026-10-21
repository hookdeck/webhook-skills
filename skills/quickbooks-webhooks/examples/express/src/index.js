// Generated with: quickbooks-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a QuickBooks Online webhook signature.
 * Intuit sends base64(HMAC-SHA256(rawBody, verifierToken)) in the intuit-signature header.
 * @param {Buffer|string} rawBody - Raw request body (unparsed)
 * @param {string|undefined} signature - intuit-signature header value
 * @param {string} verifierToken - Verifier Token from the app's Webhooks page
 * @returns {boolean} - Whether the signature is valid
 */
function verifyQuickBooksSignature(rawBody, signature, verifierToken) {
  if (!signature || !verifierToken) return false;

  const expected = crypto
    .createHmac('sha256', verifierToken)
    .update(rawBody)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false; // different lengths = invalid
  }
}

// Legacy eventNotifications operations -> CloudEvents event names
const LEGACY_OPERATIONS = {
  Create: 'created',
  Update: 'updated',
  Delete: 'deleted',
  Merge: 'merged',
  Void: 'voided',
  Emailed: 'emailed',
};

/**
 * Normalize both payload shapes into a flat list of events:
 * - CloudEvents (current): top-level array, type = "qbo.{entity}.{event}.v1"
 * - Legacy: { eventNotifications: [{ realmId, dataChangeEvent: { entities: [...] } }] }
 */
function normalizeEvents(payload) {
  if (Array.isArray(payload)) {
    return payload.map((event) => {
      const [, entity = '', action = ''] = String(event.type || '').split('.');
      return {
        id: event.id,
        type: event.type,
        entity,
        action,
        entityId: event.intuitentityid,
        realmId: event.intuitaccountid,
        time: event.time,
        data: event.data || {},
      };
    });
  }

  if (payload && Array.isArray(payload.eventNotifications)) {
    return payload.eventNotifications.flatMap((notification) =>
      ((notification.dataChangeEvent && notification.dataChangeEvent.entities) || []).map((entity) => {
        const name = String(entity.name || '').toLowerCase();
        const action = LEGACY_OPERATIONS[entity.operation] || String(entity.operation || '').toLowerCase();
        return {
          id: `${notification.realmId}-${entity.name}-${entity.id}-${entity.lastUpdated}`,
          type: `qbo.${name}.${action}.v1`,
          entity: name,
          action,
          entityId: entity.id,
          realmId: notification.realmId,
          time: entity.lastUpdated,
          data: entity.deletedId ? { deletedid: entity.deletedId } : {},
        };
      })
    );
  }

  return null;
}

function handleEvent(event) {
  const label = `${event.entity} ${event.entityId} (realm ${event.realmId})`;

  switch (event.action) {
    case 'created':
      console.log(`Created: ${label}`);
      // TODO: Fetch the record from the Accounting API and sync it
      break;

    case 'updated':
      console.log(`Updated: ${label}`);
      // TODO: Re-fetch the record and update your copy
      break;

    case 'deleted':
      console.log(`Deleted: ${label}`);
      // TODO: Remove or archive your copy
      break;

    case 'merged':
      console.log(`Merged: ${label}, removed ID ${event.data.deletedid}`);
      // TODO: Re-point references from data.deletedid to entityId
      break;

    case 'voided':
      console.log(`Voided: ${label}`);
      // TODO: Mark the transaction void
      break;

    case 'emailed':
      console.log(`Emailed: ${label}`);
      // TODO: Record that the document was sent
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

// QuickBooks webhook endpoint - must use raw body for signature verification.
// type: '*/*' captures the raw bytes whatever Content-Type Intuit sends
// (CloudEvents deliveries may not use application/json).
app.post(
  '/webhooks/quickbooks',
  express.raw({ type: '*/*', limit: '10mb' }),
  (req, res) => {
    const signature = req.headers['intuit-signature'];
    // req.body is a Buffer of the raw request bytes
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

    if (!signature) {
      return res.status(400).send('Missing intuit-signature header');
    }

    if (!verifyQuickBooksSignature(rawBody, signature, process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN)) {
      console.error('QuickBooks webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse only after the signature is verified
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    const events = normalizeEvents(payload);
    if (!events) {
      return res.status(400).send('Unrecognized payload');
    }

    // One notification can contain events for several companies (realm IDs).
    // Intuit expects a 200 within 3 seconds - in production, enqueue and return.
    events.forEach(handleEvent);

    res.status(200).json({ received: true, count: events.length });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyQuickBooksSignature, normalizeEvents };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/quickbooks`);
  });
}
