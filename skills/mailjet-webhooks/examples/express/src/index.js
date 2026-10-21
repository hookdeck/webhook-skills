// Generated with: mailjet-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Compare via SHA-256 digests so unequal lengths don't throw or leak length
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Mailjet has no signature: it sends the user:pass from the webhook URL
// as an `Authorization: Basic ...` header.
function verifyBasicAuth(header, username, password) {
  if (!username || !password) return false;
  if (!header || !/^Basic /i.test(header)) return false;

  const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
  const idx = decoded.indexOf(':'); // password may itself contain ':'
  if (idx < 0) return false;

  // Evaluate both comparisons (no short-circuit) so timing doesn't reveal which failed
  const userOk = safeEqual(decoded.slice(0, idx), username);
  const passOk = safeEqual(decoded.slice(idx + 1), password);
  return userOk && passOk;
}

function handleEvent(event) {
  switch (event.event) {
    case 'sent':
      console.log(`Sent to ${event.email}: ${event.smtp_reply}`);
      break;
    case 'open':
      console.log(`Opened by ${event.email}`);
      break;
    case 'click':
      console.log(`Clicked ${event.url} by ${event.email}`);
      break;
    case 'bounce':
      // hard_bounce=true means a permanent failure
      console.log(`Bounce (${event.hard_bounce ? 'hard' : 'soft'}) for ${event.email}: ${event.error}`);
      break;
    case 'blocked':
      console.log(`Blocked for ${event.email}: ${event.error}`);
      break;
    case 'spam':
      console.log(`Spam complaint from ${event.email} (source: ${event.source})`);
      break;
    case 'unsub':
      console.log(`Unsubscribed ${event.email} from list ${event.mj_list_id}`);
      break;
    default:
      console.log(`Unhandled Mailjet event: ${event.event}`);
  }
}

// express.raw so the body is untouched; Mailjet sends JSON, parsed after auth
app.post('/webhooks/mailjet', express.raw({ type: '*/*' }), (req, res) => {
  const { MAILJET_WEBHOOK_USERNAME: user, MAILJET_WEBHOOK_PASSWORD: pass } = process.env;
  if (!user || !pass) {
    console.error('MAILJET_WEBHOOK_USERNAME / MAILJET_WEBHOOK_PASSWORD not set');
    return res.status(500).json({ error: 'Webhook credentials not configured' });
  }

  if (!verifyBasicAuth(req.headers.authorization, user, pass)) {
    res.set('WWW-Authenticate', 'Basic realm="mailjet"');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // With grouped events (version 2) Mailjet posts an array; otherwise one object
  const events = Array.isArray(payload) ? payload : [payload];
  if (!events.every((e) => e && typeof e === 'object' && typeof e.event === 'string')) {
    return res.status(400).json({ error: 'Invalid event payload' });
  }

  events.forEach(handleEvent);
  res.status(200).json({ received: events.length });
});

module.exports = app;

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Mailjet webhook server listening on http://localhost:${port}`));
}
