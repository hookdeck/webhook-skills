// Generated with: ordinal-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

// ORDINAL DOES NOT SIGN WEBHOOK DELIVERIES.
//
// There is no signature header, no signing secret, no `whsec_` key, no timestamp
// header, no HMAC and no Standard Webhooks / Svix headers. The Create webhook
// response returns only id, name, url, topics, createdAt — no secret is ever
// issued. Do NOT write an HMAC verifier: there are no inputs for one, and a
// fabricated verifier rejects 100% of genuine deliveries.
//
// The ONLY authentication mechanism is a STATIC custom header YOU configure on
// the webhook via its optional `headers` field ("Optional custom headers to
// include in webhook requests"). Ordinal adds those headers to every delivery.
// The header NAME is your choice — it is NOT an Ordinal-defined header.
//
// This is a shared-secret CHANNEL check, not integrity protection: the value is
// identical on every delivery, so it is only as good as TLS and secret hygiene.
// It proves the caller knows the secret, NOT that the body is unmodified.
// Rotate by PATCHing `headers` on the webhook.
//
// Because nothing is signed over the body, there is NO RAW-BODY REQUIREMENT.
// Parsing JSON before authenticating is fine here — the opposite of Stripe /
// Shopify / GitHub, where a body parser before verification breaks the HMAC.

/** The header name you set in the webhook's `headers`. Node lowercases inbound names. */
const SECRET_HEADER = (process.env.ORDINAL_WEBHOOK_SECRET_HEADER || 'x-webhook-secret').toLowerCase();

const app = express();

// Safe on an Ordinal route: there is no signature over the raw bytes.
app.use('/webhooks/ordinal', express.json());

/**
 * Constant-time comparison of the inbound secret header.
 *
 * FAILS CLOSED: an unconfigured `expected` returns false. Never `return true`
 * here — that would turn a misconfigured deploy into a fully open endpoint.
 *
 * @param {Record<string, unknown>} headers - req.headers (names lowercased by Node)
 * @param {string|undefined} expected - ORDINAL_WEBHOOK_SECRET
 * @returns {boolean}
 */
function verifyOrdinalSecret(headers, expected) {
  if (!expected) return false; // fail closed on misconfiguration
  const provided = headers[SECRET_HEADER];
  // A missing header is undefined, and a repeated header is an array — both are
  // rejections. Buffer.from(undefined) throws, so check the type first.
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // crypto.timingSafeEqual THROWS on length mismatch — compare lengths first.
  // Never use === : it short-circuits and leaks the secret prefix via timing.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * The single key inside `data` depends on the event family. Reading `data.post`
 * on a comment or approval event yields undefined — the most common Ordinal bug.
 *
 * @param {string} type - the event type
 * @returns {'profile'|'post'|'comment'|'approval'|'invite'|null}
 */
function resourceKeyFor(type) {
  if (typeof type !== 'string') return null;
  if (type.startsWith('social_profile.')) return 'profile';
  if (type === 'post.comment.created' || type === 'post.inline_comment.created') return 'comment';
  // Covers post.approval.* AND campaign.approval.* — both use `data.approval`.
  if (type.includes('.approval.')) return 'approval';
  if (type.startsWith('invite.')) return 'invite';
  if (type.startsWith('post.')) return 'post';
  return null;
}

/**
 * Read the resource out of the envelope regardless of family.
 *
 * @param {{type?: string, data?: Record<string, unknown>}} event
 * @returns {{key: string|null, resource: Record<string, unknown>}}
 */
function extractResource(event) {
  const key = resourceKeyFor(event && event.type);
  const data = (event && event.data) || {};
  const resource = key && typeof data[key] === 'object' && data[key] !== null ? data[key] : {};
  return { key, resource };
}

/**
 * Derive an idempotency key.
 *
 * ORDINAL SHIPS NO EVENT ID: the envelope has no top-level id and no delivery-id
 * header is documented. This composite of type + the resource id inside `data` +
 * `createdAt` is OUR OWN CONVENTION for dedupe, not a documented Ordinal key.
 *
 * @param {{type?: string, createdAt?: string}} event
 * @returns {string}
 */
function idempotencyKeyFor(event) {
  const { resource } = extractResource(event);
  // Approvals nest the subject; fall back through the plausible id locations.
  const id =
    resource.id ||
    (resource.post && resource.post.id) ||
    (resource.campaign && resource.campaign.id) ||
    'unknown';
  return `${event.type}:${id}:${event.createdAt}`;
}

app.post('/webhooks/ordinal', (req, res) => {
  const secret = process.env.ORDINAL_WEBHOOK_SECRET;

  // FAIL CLOSED, and use 500 (not 401) so an operator can tell "my server is
  // misconfigured" apart from "someone sent a bad secret".
  if (!secret) {
    console.error(
      'ORDINAL_WEBHOOK_SECRET is not set — refusing to accept unauthenticated webhooks. ' +
        'Generate one (openssl rand -hex 32) and set it on the webhook via ' +
        'PATCH /api/v1/webhooks/{id} with {"headers":{"X-Webhook-Secret":"<secret>"}}.'
    );
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // 401, not 400: a bad or absent secret is an AUTHENTICATION failure.
  if (!verifyOrdinalSecret(req.headers, secret)) {
    console.error(`Ordinal webhook rejected: ${SECRET_HEADER} missing or mismatched`);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // express.json() responds 400 itself on malformed JSON, but an empty or
  // non-object body still reaches here.
  const event = req.body;
  if (!event || typeof event !== 'object' || typeof event.type !== 'string') {
    console.error('Ordinal webhook rejected: envelope missing a string `type`');
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const idempotencyKey = idempotencyKeyFor(event);
  console.log(`✓ Authenticated Ordinal webhook: ${event.type} (${idempotencyKey})`);

  try {
    handleEvent(event, idempotencyKey);
  } catch (err) {
    // Log and still acknowledge: Ordinal documents no retry policy, so a non-2xx
    // has undefined consequences and re-delivery is not something to rely on for
    // a bug in your own handler.
    console.error(`Error handling Ordinal event ${idempotencyKey}:`, err);
  }

  // Any 2xx acknowledges receipt (docs: "Your endpoint should respond with a 2xx
  // status code to acknowledge receipt"). Ordinal documents no delivery timeout,
  // so acknowledge fast and do slow work out of band.
  res.status(200).json({ received: true });
});

/**
 * Dispatch on the exact event type strings.
 *
 * NOTE THE MIXED SEPARATORS: publish_failed, reconnect_needed,
 * permanently_deleted and inline_comment use UNDERSCORES inside an otherwise
 * dot-separated name. `post.publish.failed` and `post.publishFailed` are wrong.
 *
 * @param {{type: string, data?: object, createdAt?: string}} event
 * @param {string} idempotencyKey
 */
function handleEvent(event, idempotencyKey) {
  // TODO: check idempotencyKey against your store and return early if seen.
  //   if (await store.has(idempotencyKey)) return;

  const { resource } = extractResource(event);

  switch (event.type) {
    // --- Social profiles (data.profile) -------------------------------------
    case 'social_profile.connected':
      console.log(`🔗 Profile connected: ${resource.name} (${resource.channel})`);
      break;
    case 'social_profile.disconnected':
      console.log(`🔌 Profile disconnected: ${resource.name}`);
      break;
    case 'social_profile.reconnect_needed':
      // Act on this one — scheduled posts on this profile will start failing.
      console.log(`⚠️  Profile needs reconnecting: ${resource.name} (${resource.channel})`);
      break;

    // --- Posts (data.post) --------------------------------------------------
    case 'post.created':
      // post.created uses `channels` (ARRAY), unlike post.published's singular
      // `channel`. Per-channel content is in `linkedIn` and `x` (both nullable).
      console.log(
        `📝 Post created: ${resource.title} [${(resource.channels || []).join(', ')}] status=${resource.status}`
      );
      break;
    case 'post.scheduled':
      console.log(`📅 Post scheduled: ${resource.title}`);
      break;
    case 'post.rescheduled':
      console.log(`🔄 Post rescheduled: ${resource.title}`);
      break;
    case 'post.unscheduled':
      console.log(`🚫 Post unscheduled: ${resource.title}`);
      break;
    case 'post.published':
      // `postUrl` is the live link on the channel and MAY BE NULL; `url` is the
      // Ordinal app link. `campaign` may be null too.
      console.log(
        `🚀 Post published: ${resource.title} → ${resource.postUrl || '(no channel URL)'}`
      );
      break;
    case 'post.publish_failed':
      // data.post.error carries the reason (e.g. "Token expired"), and this
      // event has createdBy + failedAt rather than publishedBy + publishedAt.
      console.error(`❌ Publish failed: ${resource.title} — ${resource.error}`);
      break;
    case 'post.archived':
      console.log(`🗄️  Post archived (moved to trash): ${resource.title}`);
      break;
    case 'post.permanently_deleted':
      console.log(`🗑️  Post permanently deleted: ${resource.id}`);
      break;
    case 'post.content.edited':
      // DEBOUNCED PER POST — fires ~5 minutes after edits and includes the
      // latest content for ALL channels. Treat it as current state, not a diff.
      console.log(`✏️  Post content edited (debounced ~5m): ${resource.title}`);
      break;

    // --- Comments (data.comment, NOT data.post) -----------------------------
    case 'post.comment.created':
      // Post-level comment.
      console.log(`💬 Comment on "${resource.post && resource.post.title}": ${resource.message}`);
      break;
    case 'post.inline_comment.created':
      // Text-anchored comment. One event per comment, INCLUDING replies in a
      // thread (documented for inline comments); thread context is in `thread`.
      console.log(
        `💬 Inline comment on "${resource.post && resource.post.title}": ${resource.message}`
      );
      break;

    // --- Approvals (data.approval for BOTH post.* and campaign.*) -----------
    case 'post.approval.requested':
      console.log(
        `🔍 Approval requested on "${resource.post && resource.post.title}" for ` +
          `${(resource.createdApprovals || []).length} approver(s)`
      );
      break;
    case 'post.approval.approved':
      console.log(`✅ Post approved: ${resource.post && resource.post.title}`);
      break;
    case 'campaign.approval.requested':
      // Same `data.approval` key, but with `campaign` instead of `post`.
      console.log(`🔍 Campaign approval requested: ${resource.campaign && resource.campaign.name}`);
      break;
    case 'campaign.approval.approved':
      console.log(`✅ Campaign approved: ${resource.campaign && resource.campaign.name}`);
      break;

    // --- Invites (data.invite) ----------------------------------------------
    case 'invite.created':
      // If the invitee already has an account they are added directly and NO
      // email is sent — don't promise "check your inbox" on this event.
      console.log(`✉️  Invite created for ${resource.email}`);
      break;
    case 'invite.accepted':
      console.log(`🎉 Invite accepted by ${resource.email}`);
      break;

    default:
      // New topics may appear before this skill is updated. Log and move on
      // rather than guessing the payload shape. There is no `ping` event.
      console.log(`ℹ️  Unhandled Ordinal event type: ${event.type}`);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app and helpers for testing
module.exports = {
  app,
  verifyOrdinalSecret,
  resourceKeyFor,
  extractResource,
  idempotencyKeyFor,
  SECRET_HEADER,
};

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  if (!process.env.ORDINAL_WEBHOOK_SECRET) {
    // Fail closed loudly at boot too, not only per request.
    console.warn(
      'ORDINAL_WEBHOOK_SECRET is not set — every delivery will be rejected with 500.'
    );
  }
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/ordinal`);
    console.log(`Authenticating with the "${SECRET_HEADER}" header (Ordinal signs nothing)`);
  });
}
