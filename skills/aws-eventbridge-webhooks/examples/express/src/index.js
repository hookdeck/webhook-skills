// Generated with: aws-eventbridge-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// The API destination method is configurable, so accept all of these.
const ALLOWED_METHODS = ['POST', 'PUT', 'PATCH', 'GET', 'DELETE'];

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the credential's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Parse "Authorization: Basic base64(username:password)". The scheme is
 * case-insensitive and the username/password are split on the FIRST colon, so the
 * password may itself contain colons. Returns null for a missing or malformed header.
 */
function parseBasicAuth(header) {
  if (typeof header !== 'string') return null;
  const match = /^basic +([A-Za-z0-9+/]+={0,2})$/i.exec(header.trim());
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  if (idx === -1) return null;
  return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
}

/**
 * EventBridge does not sign API destination requests. With a Basic-auth Connection it
 * populates the Authorization header, which authenticates the sender (not the body).
 */
function verifyAwsEventbridgeRequest(
  headers,
  username = process.env.AWS_EVENTBRIDGE_WEBHOOK_USERNAME,
  password = process.env.AWS_EVENTBRIDGE_WEBHOOK_PASSWORD
) {
  if (!username || !password) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers['authorization']);
  if (!creds) return false;
  // Evaluate both comparisons before deciding (no short-circuit).
  const userOk = safeEqual(creds.username, username);
  const passOk = safeEqual(creds.password, password);
  return userOk && passOk;
}

function handleEvent(event) {
  const source = event.source;
  const detailType = event['detail-type'];
  const detail = event.detail || {};

  if (source === 'aws.ec2' && detailType === 'EC2 Instance State-change Notification') {
    console.log(`EC2 instance ${detail['instance-id']} is now ${detail.state}`);
    // TODO: react to the instance state change (detail['instance-id'], detail.state)
  } else if (source === 'aws.s3' && detailType === 'Object Created') {
    console.log(`S3 object created: ${detail.bucket && detail.bucket.name}/${detail.object && detail.object.key}`);
    // TODO: process the new object (detail.bucket.name, detail.object.key)
  } else if (source === 'com.example.orders' && detailType === 'OrderCreated') {
    console.log(`Order created: ${detail.orderId}`);
    // TODO: fulfil the order (your own source and detail-type go here)
  } else {
    console.log(`Unhandled event: ${source} / ${detailType}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.all('/webhooks/aws-eventbridge', express.raw({ type: '*/*' }), (req, res) => {
  if (!ALLOWED_METHODS.includes(req.method)) {
    res.set('Allow', ALLOWED_METHODS.join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyAwsEventbridgeRequest(req.headers)) {
    res.set('WWW-Authenticate', 'Basic realm="aws-eventbridge"');
    return res.status(401).json({ error: 'Invalid or missing Basic credentials' });
  }

  // GET and DELETE usually have no body.
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (raw.trim() === '') {
    return res.status(200).json({ received: true });
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = null;
  }

  try {
    if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'detail-type' in payload) {
      handleEvent(payload); // default event envelope
    } else {
      // An input transformer builds the body, so its shape is whatever your template says.
      console.log('Received a transformed (non-envelope) payload');
    }
  } catch (err) {
    console.error('Error handling EventBridge event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyAwsEventbridgeRequest = verifyAwsEventbridgeRequest;
module.exports.parseBasicAuth = parseBasicAuth;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/aws-eventbridge (POST, PUT, PATCH, GET, DELETE)`);
  });
}
