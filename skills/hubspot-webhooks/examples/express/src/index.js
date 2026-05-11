require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

// Behind a proxy/tunnel (Hookdeck, ngrok, etc.), trust X-Forwarded-* headers so
// req.protocol and req.get('host') match the public URL HubSpot called.
app.set('trust proxy', true);

const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Verify HubSpot v3 webhook signature.
 *
 * Signed content = method + URI + raw body + X-HubSpot-Request-Timestamp
 * Signature = base64(HMAC-SHA256(signed_content, app_client_secret))
 *
 * @param {object} args
 * @param {string} args.method - HTTP method, e.g. "POST"
 * @param {string} args.uri - Full request URI HubSpot called
 * @param {Buffer|string} args.rawBody - Raw request body
 * @param {string} args.timestamp - X-HubSpot-Request-Timestamp header value (ms)
 * @param {string} args.signature - X-HubSpot-Signature-v3 header value
 * @param {string} args.secret - HubSpot app Client Secret
 * @returns {boolean}
 */
function verifyHubSpotWebhook({ method, uri, rawBody, timestamp, signature, secret }) {
  if (!signature || !timestamp || !secret) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_AGE_MS) return false;

  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : (rawBody || '');
  const signedContent = `${method}${uri}${body}${timestamp}`;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedContent, 'utf8')
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// HubSpot webhook endpoint - must use raw body for HMAC verification
app.post('/webhooks/hubspot',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['x-hubspot-signature-v3'];
    const timestamp = req.headers['x-hubspot-request-timestamp'];

    // Reconstruct the URI HubSpot signed
    const uri = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    const valid = verifyHubSpotWebhook({
      method: req.method,
      uri,
      rawBody: req.body,
      timestamp,
      signature,
      secret: process.env.HUBSPOT_CLIENT_SECRET,
    });

    if (!valid) {
      console.error('HubSpot signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // HubSpot delivers an array of events per request
    let events;
    try {
      events = JSON.parse(req.body.toString('utf8'));
    } catch (err) {
      return res.status(400).send('Invalid JSON');
    }
    if (!Array.isArray(events)) events = [events];

    for (const event of events) {
      switch (event.subscriptionType) {
        case 'contact.creation':
          console.log('New contact:', event.objectId);
          // TODO: sync to CRM, trigger welcome workflow, etc.
          break;

        case 'contact.propertyChange':
          console.log('Contact property changed:', event.objectId, event.propertyName, '->', event.propertyValue);
          // TODO: re-sync the changed property downstream
          break;

        case 'contact.deletion':
          console.log('Contact deleted:', event.objectId);
          // TODO: mirror deletion in your system
          break;

        case 'company.creation':
          console.log('New company:', event.objectId);
          break;

        case 'company.propertyChange':
          console.log('Company property changed:', event.objectId, event.propertyName);
          break;

        case 'deal.creation':
          console.log('New deal:', event.objectId);
          break;

        case 'deal.propertyChange':
          console.log('Deal property changed:', event.objectId, event.propertyName, '->', event.propertyValue);
          break;

        case 'ticket.creation':
          console.log('New ticket:', event.objectId);
          break;

        default:
          console.log('Unhandled event:', event.subscriptionType);
      }
    }

    res.status(200).send('OK');
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyHubSpotWebhook };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/hubspot`);
  });
}
