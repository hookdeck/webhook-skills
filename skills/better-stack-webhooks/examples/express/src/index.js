// Generated with: better-stack-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const PATH = '/webhooks/better-stack';
// The webhook's http_method can be get, post, put, patch, head or options (default post).
const METHODS = ['get', 'head', 'post', 'put', 'patch', 'options'];
const DEFAULT_HEADER = 'X-Better-Stack-Secret';

/**
 * Constant-time comparison of two Buffers. Hashing both sides first gives equal-length
 * digests, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const BASIC = /^basic +([A-Za-z0-9+/]+={0,2})$/i; // auth schemes are case-insensitive (RFC 9110)

/** Decode `Basic base64(username:password)`; null unless it is canonical base64 with a colon. */
function parseBasic(header) {
  if (typeof header !== 'string') return null;
  const m = BASIC.exec(header);
  if (!m || m[1].length % 4 !== 0) return null;
  const buf = Buffer.from(m[1], 'base64'); // lenient decoder, so check it round-trips
  if (buf.toString('base64') !== m[1]) return null;
  const decoded = buf.toString('utf8');
  const i = decoded.indexOf(':'); // split on the FIRST colon: a password may contain ':'
  if (i === -1) return null;
  return { username: decoded.slice(0, i), password: decoded.slice(i + 1) };
}

/**
 * Better Stack does not sign webhooks. A webhook can carry two kinds of static credential,
 * and Hookdeck's Better Stack source offers both. A request passes if EITHER configured
 * method matches; a method that isn't configured is never used, so with neither configured
 * every request is rejected.
 * - Basic auth (auth_username / auth_password): BETTER_STACK_WEBHOOK_USERNAME and
 *   BETTER_STACK_WEBHOOK_PASSWORD.
 * - Custom header (headers_template): the header named by BETTER_STACK_WEBHOOK_HEADER
 *   (default X-Better-Stack-Secret) must equal BETTER_STACK_WEBHOOK_SECRET exactly.
 */
function verifyBetterStackRequest(headers, env = process.env) {
  // Custom header: whole value, verbatim (no prefix stripping, no trimming).
  let headerOk = false;
  const secret = env.BETTER_STACK_WEBHOOK_SECRET;
  if (secret) {
    const name = (env.BETTER_STACK_WEBHOOK_HEADER || DEFAULT_HEADER).toLowerCase();
    const value = headers[name]; // Node lower-cases incoming header names
    // Node decodes header bytes as latin1; compare against the secret's UTF-8 bytes.
    headerOk =
      typeof value === 'string' &&
      safeEqual(Buffer.from(value, 'latin1'), Buffer.from(secret, 'utf8'));
  }

  // Basic auth: evaluate username and password both, no short-circuit.
  let basicOk = false;
  const username = env.BETTER_STACK_WEBHOOK_USERNAME;
  const password = env.BETTER_STACK_WEBHOOK_PASSWORD;
  if (username && password) {
    const creds = parseBasic(headers['authorization']);
    if (creds) {
      const userOk = safeEqual(Buffer.from(creds.username), Buffer.from(username));
      const passOk = safeEqual(Buffer.from(creds.password), Buffer.from(password));
      basicOk = userOk && passOk;
    }
  }

  return headerOk || basicOk;
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
// Default templates render unset timestamps as null or an empty string.
const isSet = (v) => typeof v === 'string' && v.trim() !== '';
const text = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : undefined);
const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
const obj = (v) => (isObject(v) ? v : {});

/**
 * Work out what a delivery is from its shape. Only the top-level `event: "comment"` is a
 * documented wire value; every other state is inferred from attributes. A customised
 * body_template may carry none of these fields, in which case the kind is 'unknown'.
 * Every field is untrusted: wrong-typed values are ignored, never thrown on.
 */
function classifyBetterStackPayload(payload) {
  const data = obj(isObject(payload) ? payload.data : undefined);
  const attrs = obj(data.attributes);

  if (data.type === 'incident') {
    const base = { kind: 'incident', id: text(data.id), name: text(attrs.name) };
    if (payload.event === 'comment') {
      const comment = obj(payload.comment);
      const c = obj(comment.attributes);
      return { ...base, state: 'comment', content: text(c.content), author: text(c.user_email) };
    }
    // Inference: resolved_at set -> resolved, acknowledged_at set -> acknowledged, else started/open.
    const state = isSet(attrs.resolved_at)
      ? 'resolved'
      : isSet(attrs.acknowledged_at)
        ? 'acknowledged'
        : 'started';
    return { ...base, state, cause: text(attrs.cause) };
  }

  if (data.type === 'monitor') {
    // Created, updated, unpaused and deleted look alike; only paused_at distinguishes one.
    return {
      kind: 'monitor',
      id: text(data.id),
      name: text(attrs.pronounceable_name),
      state: isSet(attrs.paused_at) ? 'paused' : 'changed',
    };
  }

  if (data.change === 'on_call' || data.change === 'holiday') {
    return {
      kind: 'on_call',
      change: data.change,
      calendar: text(data.calendar_name),
      emails: strings(data.emails),
      onHolidayEmails: strings(data.on_holiday_emails),
    };
  }

  return { kind: 'unknown' };
}

function handleEvent(event) {
  switch (event.kind) {
    case 'incident':
      if (event.state === 'comment') {
        console.log(`Incident ${event.id} comment by ${event.author}: ${event.content}`);
        // TODO: mirror the comment into your ticketing system
      } else {
        console.log(`Incident ${event.id} ${event.state}: ${event.name} (${event.cause})`);
        // TODO: open, update or close the matching incident on your side
      }
      break;
    case 'monitor':
      console.log(`Monitor ${event.id} ${event.state}: ${event.name}`);
      // TODO: sync monitor configuration
      break;
    case 'on_call':
      console.log(`On-call ${event.change} change on ${event.calendar}: ${event.emails.join(', ')}`);
      // TODO: update who is on call in your tools
      break;
    default:
      console.log('Unrecognised Better Stack payload (customised body_template?)');
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
// Credential check first, for every method.
function receive(req, res) {
  if (!verifyBetterStackRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing credentials' });
  }

  // GET, HEAD and OPTIONS deliveries have no body: treat a missing body as empty.
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (raw.trim() === '') {
    return res.status(200).json({ received: true });
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    // body_template is user-editable, so a non-JSON body is acknowledged and logged.
    console.log('Received a non-JSON body:', raw.slice(0, 200));
    return res.status(200).json({ received: true });
  }

  try {
    handleEvent(classifyBetterStackPayload(payload));
  } catch (err) {
    console.error('Error handling Better Stack webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
}

for (const method of METHODS) {
  app[method](PATH, express.raw({ type: '*/*' }), receive);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyBetterStackRequest = verifyBetterStackRequest;
module.exports.classifyBetterStackPayload = classifyBetterStackPayload;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}${PATH}`);
  });
}
