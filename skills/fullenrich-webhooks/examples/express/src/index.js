require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a FullEnrich webhook signature.
 *
 * FullEnrich sends X-Signature-SHA1 = lowercase hex(HMAC-SHA1(apiKey, rawBody)).
 * The key is your FullEnrich API key; there is no separate webhook secret.
 *
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string|undefined} signature - X-Signature-SHA1 header value
 * @param {string|undefined} apiKey - FullEnrich API key
 * @returns {boolean} - Whether the signature is valid
 */
function verifyFullEnrichSignature(rawBody, signature, apiKey) {
  // Check shape first: Buffer.from(x, 'hex') silently truncates invalid hex
  if (!signature || !apiKey || !/^[0-9a-f]{40}$/i.test(signature)) {
    return false;
  }

  const expected = crypto.createHmac('sha1', apiKey).update(rawBody).digest('hex');
  // Equal-length hex strings as UTF-8 buffers, compared in constant time
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature.toLowerCase()));
}

/**
 * FullEnrich has no event types: the body mirrors Get Enrichment Result and
 * `status` is the job state.
 */
function handleEnrichment(payload) {
  switch (payload.status) {
    case 'FINISHED':
      console.log(`Enrichment ${payload.id} finished (${payload.cost?.credits ?? 0} credits)`);
      // TODO: Store payload.data[].contact_info, match rows via data[].custom
      break;

    case 'IN_PROGRESS':
      // Sent per contact by webhook_events.contact_finished
      console.log(`Contact finished in enrichment ${payload.id}`);
      // TODO: Process payload.data[0] as it completes
      break;

    case 'CANCELED':
      console.log(`Enrichment ${payload.id} was canceled`);
      break;

    case 'CREDITS_INSUFFICIENT':
      console.log(`Enrichment ${payload.id} stopped: insufficient credits`);
      // TODO: Alert and top up credits
      break;

    default:
      console.log(`Unhandled enrichment status: ${payload.status}`);
  }
}

// FullEnrich webhook endpoint - raw body for any content type
app.post('/webhooks/fullenrich',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const apiKey = process.env.FULLENRICH_API_KEY;
    if (!apiKey) {
      console.error('FULLENRICH_API_KEY is not configured');
      return res.status(500).send('API key not configured');
    }

    const signature = req.headers['x-signature-sha1'];
    if (!signature) {
      return res.status(400).send('Missing X-Signature-SHA1 header');
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!verifyFullEnrichSignature(rawBody, signature, apiKey)) {
      console.error('FullEnrich webhook signature verification failed');
      return res.status(401).send('Invalid signature');
    }

    // Parse only after verification
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // FullEnrich retries non-2xx every minute (up to 5 times): keep this idempotent
    handleEnrichment(payload);

    res.status(200).json({ received: true });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyFullEnrichSignature };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/fullenrich`);
  });
}
