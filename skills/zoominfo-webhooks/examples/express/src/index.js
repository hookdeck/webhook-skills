// Generated with: zoominfo-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// ZoomInfo does not sign payloads. It sends a verification token, generated
// when you create the webhook, back in the x-zoominfo-token header.
// https://tech-docs-library.zoominfo.com/webhooks-implementation-guide.pdf
function verifyZoomInfoToken(tokenHeader, expectedToken) {
  if (!tokenHeader || !expectedToken) {
    return false;
  }

  // Constant-time compare; timingSafeEqual throws on length mismatch
  const received = Buffer.from(tokenHeader);
  const expected = Buffer.from(expectedToken);
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/webhooks/zoominfo',
  // Raw body for all content types, so verification never depends on JSON parsing
  express.raw({ type: '*/*', limit: '5mb' }),
  (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const expectedToken = process.env.ZOOMINFO_WEBHOOK_TOKEN;

    // The "Validate" button in ZoomInfo posts a sample payload before any token
    // exists. With no token configured we acknowledge it but do not process it.
    if (!expectedToken) {
      console.warn('ZOOMINFO_WEBHOOK_TOKEN is not set: acknowledging without processing');
      return res.json({ received: true, verified: false });
    }

    if (!verifyZoomInfoToken(req.headers['x-zoominfo-token'], expectedToken)) {
      console.error('ZoomInfo webhook token verification failed');
      return res.status(401).send('Invalid token');
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // Subscriptions are an object type (Contact or Company) plus the Update
    // event. The guide does not define a payload field naming the event, so
    // route on your own subscription/endpoint and read the record fields you
    // need from the payload (up to 25 profiles per delivery).
    const keys = payload && typeof payload === 'object' ? Object.keys(payload) : [];
    console.log(`✓ Verified ZoomInfo webhook (${rawBody.length} bytes, keys: ${keys.join(', ') || 'none'})`);

    res.json({ received: true, verified: true });
  }
);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  console.log(`ZoomInfo webhook server listening on port ${PORT}`);
  console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/zoominfo`);
});

// For testing
module.exports = { app, server, verifyZoomInfoToken };
