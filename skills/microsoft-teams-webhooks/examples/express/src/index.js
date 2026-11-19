// Generated with: microsoft-teams-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Teams outgoing webhooks send   Authorization: HMAC <base64>
// = base64(HMAC-SHA256(key = base64-DECODED security token, raw UTF-8 body)).
// Teams waits about 5 seconds and posts the JSON response as a reply to the
// message that @mentioned the webhook (public channels only).
// ---------------------------------------------------------------------------

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * @param {Buffer|string} rawBody - the exact bytes Teams sent
 * @param {string|undefined} authorization - the Authorization header
 * @param {string|undefined} securityToken - MICROSOFT_TEAMS_SECURITY_TOKEN (base64)
 * @returns {boolean}
 */
function verifyTeamsRequest(rawBody, authorization, securityToken) {
  if (!authorization || !securityToken) return false;
  const match = /^HMAC (\S+)$/i.exec(authorization.trim());
  if (!match) return false;

  // Node's base64 decoder skips invalid characters, so reject a malformed token
  // instead of keying with the wrong bytes. Trim a pasted trailing newline.
  const token = securityToken.trim();
  if (!BASE64.test(token)) return false;
  const key = Buffer.from(token, 'base64');
  if (key.length === 0) return false;

  const expected = crypto.createHmac('sha256', key).update(rawBody).digest();
  const given = Buffer.from(match[1], 'base64');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/** "<at>Helper</at> status" -> "status" (also drops other HTML tags). */
function commandText(text) {
  return String(text || '')
    .replace(/<at>.*?<\/at>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build the reply Teams posts in the thread. Keep it fast: Teams times out
 * after about 5 seconds. Push slow work to a queue and acknowledge here.
 */
function buildReply(activity) {
  const command = commandText(activity.text).toLowerCase();
  const who = (activity.from && activity.from.name) || 'there';
  switch (command) {
    case 'help':
    case '':
      return { type: 'message', text: 'Commands: status, help' };
    case 'status':
      return { type: 'message', text: `Hi ${who}, all systems are operational.` };
    default:
      return { type: 'message', text: 'Unknown command. Try "help".' };
  }
}

// express.raw() keeps the exact bytes for the HMAC; express.json() would break it.
app.post('/webhooks/microsoft-teams', express.raw({ type: '*/*' }), (req, res) => {
  const securityToken = process.env.MICROSOFT_TEAMS_SECURITY_TOKEN;
  if (!securityToken) {
    console.error('MICROSOFT_TEAMS_SECURITY_TOKEN is not set: rejecting request');
    return res.status(500).json({ error: 'Security token not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyTeamsRequest(rawBody, req.get('authorization'), securityToken)) {
    return res.status(401).json({ error: 'Invalid HMAC signature' });
  }

  let activity;
  try {
    activity = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  console.log(`Teams message ${activity.id} from ${activity.from && activity.from.name}: ${commandText(activity.text)}`);

  // Teams posts this JSON as a reply to the message that mentioned the webhook.
  return res.status(200).json(buildReply(activity));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Teams outgoing webhook server listening on port ${PORT}`);
    console.log(`Callback URL: POST http://localhost:${PORT}/webhooks/microsoft-teams`);
  });
}

module.exports = { app, verifyTeamsRequest, commandText, buildReply };
