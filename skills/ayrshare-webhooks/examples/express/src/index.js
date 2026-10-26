// Generated with: ayrshare-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Verify an Ayrshare webhook signature.
 *
 * `X-Authorization-Content-SHA256-V2` carries `v1=<hex>`; during the 24 h after a
 * secret rotation it carries `v1=<current>,v1=<previous>`. Only the raw body is
 * signed (the timestamp header is not), so there is no replay window to check.
 *
 * @param {Buffer} rawBody - exact request bytes
 * @param {string|undefined} header - X-Authorization-Content-SHA256-V2 value
 * @param {string} secret - signing secret (UTF-8 bytes used as the HMAC key)
 * @returns {boolean}
 */
function verifyAyrshareSignature(rawBody, header, secret) {
  if (!header || !secret || !Buffer.isBuffer(rawBody)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  let matched = false;

  for (const part of header.split(',')) {
    let candidate = part.trim();
    if (candidate.startsWith('v1=')) {
      candidate = candidate.slice(3);
    } else if (candidate.includes('=')) {
      continue; // entry with some other key: ignore
    }
    // Validate length and alphabet before decoding (Buffer.from silently drops bad characters)
    if (!HEX_SHA256.test(candidate)) continue;
    const sig = Buffer.from(candidate, 'hex');
    if (crypto.timingSafeEqual(sig, expected)) matched = true;
  }
  return matched;
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : undefined);

// The payload is verified but still untrusted: check each field's type before use.
function handleAyrshareEvent(event) {
  const { action } = event;
  const subAction = str(event.subAction);

  switch (action) {
    case 'scheduled': {
      const errors = Array.isArray(event.errors) ? event.errors.length : 0;
      if (subAction === 'tikTokPublished') {
        console.log(`TikTok post published: ${str(event.id)}`);
      } else {
        console.log(`Scheduled post ${str(event.id)}: ${str(event.status)} (${errors} errors)`);
      }
      // TODO: Update your post record from event.postIds / event.errors
      break;
    }
    case 'social':
      console.log(`Social account ${str(event.type)} on ${str(event.platform)}`);
      // TODO: On "unlink" with source "system", prompt the user to relink
      break;
    case 'messages': {
      const sender = isObject(event.senderDetails) ? str(event.senderDetails.name) : undefined;
      console.log(
        `Message ${subAction ?? 'event'} on ${str(event.platform)} from ${sender ?? str(event.senderId)}: ${str(event.message) ?? ''}`
      );
      // TODO: Store the message; dedupe on id + subAction
      break;
    }
    case 'comments': {
      const from = isObject(event.from) ? str(event.from.username) : undefined;
      console.log(`Comment on ${str(event.platform)} by ${from}: ${str(event.text)}`);
      // TODO: Reply or moderate the comment
      break;
    }
    case 'ads':
      console.log(`Ads event ${str(event.type)} on ${str(event.platform) ?? 'multiple platforms'}`);
      break;
    default:
      // mentions, batch, feed, automations, demo, suspended, ...
      console.log(`Unhandled Ayrshare action: ${str(action) ?? 'unknown'}`);
  }
}

// Read the raw bytes for any content type so the exact body is what gets verified
app.post('/webhooks/ayrshare', express.raw({ type: '*/*', limit: '5mb' }), (req, res) => {
  const secret = process.env.AYRSHARE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('AYRSHARE_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyAyrshareSignature(rawBody, req.get('x-authorization-content-sha256-v2'), secret)) {
    console.error('Ayrshare signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  // Parse only after the signature check
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (!isObject(event)) {
    return res.status(400).send('Invalid payload');
  }

  // At-least-once delivery: dedupe on event.hookId (hold claims for 24 h+)
  console.log(`Ayrshare delivery hookId=${str(event.hookId)}`);
  handleAyrshareEvent(event);

  // Answer 200 within 15 s; Ayrshare retries 408/425/429 and 5xx, other 4xx are final
  res.status(200).send('OK');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyAyrshareSignature };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/ayrshare`);
  });
}
