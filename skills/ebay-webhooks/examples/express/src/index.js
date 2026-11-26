// Generated with: ebay-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

// Public key cache — keyed by `kid` (the key ID from the x-ebay-signature
// header). eBay recommends caching ~1 hour; a new key rotation shows up as a
// new `kid`, which is a natural cache miss. Exported so tests can preload it
// and avoid the live OAuth + getPublicKey call.
const ONE_HOUR_MS = 60 * 60 * 1000;
const keyCache = new Map(); // kid -> { pem: string, expires: number }

function loadConfig() {
  const env = (process.env.EBAY_ENV || 'production').toLowerCase();
  return {
    clientId: process.env.EBAY_CLIENT_ID,
    clientSecret: process.env.EBAY_CLIENT_SECRET,
    verificationToken: process.env.EBAY_VERIFICATION_TOKEN,
    endpoint: process.env.EBAY_ENDPOINT,
    apiHost: env === 'sandbox' ? 'api.sandbox.ebay.com' : 'api.ebay.com',
  };
}

// Wrap a bare Base64 SubjectPublicKeyInfo (or a header-only PEM) into a
// well-formed PEM with line breaks so crypto can parse it.
function toPem(key) {
  if (key.includes('BEGIN PUBLIC KEY')) {
    return key
      .replace('-----BEGIN PUBLIC KEY-----', '-----BEGIN PUBLIC KEY-----\n')
      .replace('-----END PUBLIC KEY-----', '\n-----END PUBLIC KEY-----');
  }
  return `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
}

// Application access token via OAuth client-credentials grant — required to
// call getPublicKey.
async function getAppToken(config) {
  const creds = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const res = await fetch(`https://${config.apiHost}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body:
      'grant_type=client_credentials&scope=' +
      encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
  });
  if (!res.ok) throw new Error(`OAuth token request failed: ${res.status}`);
  return (await res.json()).access_token;
}

// Fetch (and cache) the public key for a `kid` from eBay's Notification API.
async function getPublicKey(kid, config) {
  const cached = keyCache.get(kid);
  if (cached && cached.expires > Date.now()) return cached.pem;

  const token = await getAppToken(config);
  const res = await fetch(
    `https://${config.apiHost}/commerce/notification/v1/public_key/${kid}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`getPublicKey failed: ${res.status}`);
  const body = await res.json();
  const pem = toPem(body.key);
  keyCache.set(kid, { pem, expires: Date.now() + ONE_HOUR_MS });
  return pem;
}

// Verify the ECDSA signature in x-ebay-signature over the RAW request body.
async function verifyEbaySignature(rawBody, signatureHeader, config) {
  if (!signatureHeader) return false;

  let sig;
  try {
    sig = JSON.parse(Buffer.from(signatureHeader, 'base64').toString('utf8'));
  } catch {
    return false; // decoded JSON carries kid and signature
  }
  if (!sig.kid || !sig.signature) return false;

  let pem;
  try {
    pem = await getPublicKey(sig.kid, config);
  } catch {
    return false;
  }

  const verifier = crypto.createVerify('sha1'); // eBay signs ECDSA with SHA-1
  verifier.update(rawBody); // body exactly as received
  verifier.end();
  try {
    return verifier.verify(pem, sig.signature, 'base64');
  } catch {
    return false;
  }
}

// GET — endpoint challenge validation. eBay calls this when a destination is
// saved. Respond 200 with { challengeResponse: SHA-256(code+token+endpoint) }.
app.get('/webhooks/ebay', (req, res) => {
  const challengeCode = req.query.challenge_code;
  if (!challengeCode) {
    return res.status(400).send('Missing challenge_code');
  }
  const config = loadConfig();
  if (!config.verificationToken || !config.endpoint) {
    console.error('EBAY_VERIFICATION_TOKEN or EBAY_ENDPOINT is not set');
    return res.status(500).send('Server misconfigured');
  }
  // ORDER IS MANDATORY: challengeCode + verificationToken + endpoint
  const hash = crypto.createHash('sha256');
  hash.update(challengeCode);
  hash.update(config.verificationToken);
  hash.update(config.endpoint);
  res.status(200).json({ challengeResponse: hash.digest('hex') });
});

// POST — incoming notification. CRITICAL: express.raw() so the signature is
// verified against the exact bytes eBay signed.
app.post('/webhooks/ebay', express.raw({ type: '*/*' }), async (req, res) => {
  const config = loadConfig();
  const signatureHeader = req.headers['x-ebay-signature'];

  const valid = await verifyEbaySignature(req.body, signatureHeader, config);
  if (!valid) {
    // 412 Precondition Failed matches eBay's SDK behaviour for a bad signature.
    return res.status(412).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const topic = event.metadata && event.metadata.topic;
  const data = (event.notification && event.notification.data) || {};

  switch (topic) {
    case 'MARKETPLACE_ACCOUNT_DELETION':
      console.log('Account deletion for user:', data.userId, data.username);
      // Your code: delete or anonymize this user's data
      break;
    case 'AUTHORIZATION_REVOCATION':
      console.log('Authorization revoked for user:', data.userId, data.username);
      // Your code: stop API calls for this user and purge stored OAuth tokens
      break;
    case 'ITEM_AVAILABILITY':
      console.log('Item availability changed:', data.itemId);
      break;
    case 'ITEM_PRICE_REVISION':
      console.log('Item price revised:', data.itemId);
      break;
    case 'PRIORITY_LISTING_REVISION':
      console.log('Priority listing revised:', data.listingId);
      break;
    default:
      console.log('Unhandled topic:', topic);
  }

  // 204 No Content acknowledges the notification (eBay wants a 2xx).
  res.status(204).end();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, keyCache, verifyEbaySignature, getPublicKey };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/ebay`);
    console.log(`Challenge endpoint: GET http://localhost:${PORT}/webhooks/ebay`);
  });
}
