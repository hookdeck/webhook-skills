// Generated with: wordpress-com-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

// WordPress.com webhooks (Settings -> Webhooks, the native
// /wp-admin/options-general.php?page=webhooks feature) are UNSIGNED:
//
//   1. There is NO signature, NO secret, NO timestamp and NO handshake. Do not
//      write an HMAC verifier and do not look for X-WordPress-Signature,
//      X-WP-Signature or X-WPCOM-Signature — none of them exist.
//      (X-WC-Webhook-Signature is WooCommerce, a different product.)
//   2. The body is a FLAT application/x-www-form-urlencoded key/value set — no
//      JSON envelope, no `type`, no `data` object, no event id. The
//      discriminator is the `hook` field.
//   3. Only the fields the admin ticked are sent, and every value is a STRING.
//      Guard every access and coerce numerics explicitly.
//
// The practical control is a random token YOU put in the registered URL's query
// string, compared in constant time. It is not provider authentication.

const WEBHOOK_PATH = '/webhooks/wordpress-com';

// The three documented hooks. There are no others — no post_updated,
// delete_post, user_register or wp_insert_post.
const HOOKS = {
  PUBLISH_POST: 'publish_post',
  PUBLISH_PAGE: 'publish_page',
  COMMENT_POST: 'comment_post',
};

const app = express();

/**
 * Timing-safe string comparison that tolerates a length mismatch
 * (crypto.timingSafeEqual throws when the buffer lengths differ).
 */
function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Compare the token YOU added to the registered webhook URL
 * (https://example.com/webhooks/wordpress-com?token=<random>).
 *
 * This is NOT a WordPress.com signature — WordPress.com signs nothing. The env
 * var is read per request so the process fails CLOSED the moment it is missing,
 * rather than silently accepting everything.
 *
 * @param {unknown} provided - the `token` query param
 * @returns {boolean} true when it matches
 * @throws {Error} when WORDPRESS_COM_WEBHOOK_TOKEN is not configured
 */
function verifyUrlToken(provided) {
  const expected = process.env.WORDPRESS_COM_WEBHOOK_TOKEN;
  if (!expected) {
    // Fail CLOSED. An unconfigured endpoint must never accept every request.
    throw new Error('WORDPRESS_COM_WEBHOOK_TOKEN is not set');
  }
  if (typeof provided !== 'string') return false; // absent, or repeated (array)
  return safeEqual(provided, expected);
}

/**
 * Build a dedupe key for a delivery.
 *
 * publish_post / publish_page fire on the initial publish AND on every later
 * edit of a published item, and there is no delivery-id header, so the same `ID`
 * arrives repeatedly. post_modified_gmt (when the admin ticked it) distinguishes
 * one edit from the next.
 *
 * @param {string} hook
 * @param {Record<string, unknown>} fields
 * @returns {string|null}
 */
function dedupeKey(hook, fields) {
  if (hook === HOOKS.COMMENT_POST) {
    return fields.comment_ID ? `${hook}:${fields.comment_ID}` : null;
  }
  if (!fields.ID) return null;
  return `${hook}:${fields.ID}:${fields.post_modified_gmt || 'unknown'}`;
}

/**
 * Re-fetch the authoritative post from the WordPress.com REST API.
 *
 * The delivery is unsigned, so the payload is an untrusted HINT: anyone who
 * learns the URL can POST arbitrary values at you. Re-read anything you are
 * going to act on. Returns null when WORDPRESS_COM_SITE is not configured.
 *
 * @param {string} postId
 * @returns {Promise<object|null>}
 */
async function fetchPost(postId) {
  const site = process.env.WORDPRESS_COM_SITE;
  if (!site) return null;

  const response = await fetch(
    `https://public-api.wordpress.com/rest/v1.1/sites/${encodeURIComponent(site)}/posts/${encodeURIComponent(postId)}`
  );
  if (!response.ok) throw new Error(`REST API returned ${response.status}`);
  return response.json();
}

// --- Event handlers (one per documented hook) -------------------------------

async function handlePublishPost(fields) {
  // Every value is a string, and only ticked fields are present.
  console.log(`Post published/updated: ${fields.ID ?? 'unknown ID'} — ${fields.post_title ?? '(post_title not selected)'}`);
  console.log(`  status=${fields.post_status ?? 'n/a'} url=${fields.post_url ?? 'n/a'}`);
  // TODO: upsert keyed on fields.ID (see dedupeKey), then act on the
  // authoritative record from fetchPost(fields.ID).
}

async function handlePublishPage(fields) {
  console.log(`Page published/updated: ${fields.ID ?? 'unknown ID'} — ${fields.post_title ?? '(post_title not selected)'}`);
  // TODO: same upsert-by-ID treatment as posts.
}

async function handleCommentPost(fields) {
  // comment_approved is a STRING: '1' approved, '0' pending moderation, 'spam'.
  // Comments can arrive before moderation — never publish comment_content blindly.
  const approved = fields.comment_approved;
  const state = approved === '1' ? 'approved' : approved === 'spam' ? 'spam' : 'pending';
  console.log(`Comment ${fields.comment_ID ?? 'unknown'} on post ${fields.comment_post_ID ?? 'unknown'} (${state})`);
  // TODO: only surface comment_content once approved === '1'.
}

/**
 * Dispatch on the `hook` field — the payload's only discriminator.
 *
 * An unknown hook is logged and treated as handled: the caller still answers
 * 2xx, because rejecting gains nothing from a sender with no documented retry
 * policy.
 *
 * @param {string} hook
 * @param {Record<string, unknown>} fields
 * @returns {Promise<{ known: boolean, key: string|null }>}
 */
async function dispatch(hook, fields) {
  const key = dedupeKey(hook, fields);
  switch (hook) {
    case HOOKS.PUBLISH_POST:
      await handlePublishPost(fields);
      return { known: true, key };
    case HOOKS.PUBLISH_PAGE:
      await handlePublishPage(fields);
      return { known: true, key };
    case HOOKS.COMMENT_POST:
      await handleCommentPost(fields);
      return { known: true, key };
    default:
      // Only three hooks are documented; log anything else and move on.
      console.warn(`Unhandled WordPress.com hook: ${hook}`);
      return { known: false, key };
  }
}

// --- Middleware -------------------------------------------------------------

/**
 * Validate the URL token BEFORE any body parsing happens.
 */
function requireUrlToken(req, res, next) {
  let ok;
  try {
    ok = verifyUrlToken(req.query.token);
  } catch (err) {
    console.error(`WordPress.com webhook misconfigured: ${err.message}`);
    // Fail closed — do not process a delivery we cannot authenticate at all.
    return res.status(500).send('Webhook token not configured');
  }
  if (!ok) {
    console.error('WordPress.com webhook rejected: URL token missing or mismatched');
    return res.status(401).send('Invalid webhook token');
  }
  return next();
}

// WordPress.com sends application/x-www-form-urlencoded (inferred from the
// HookPress lineage, whose sender hands a PHP array to wp_remote_post ->
// http_build_query). `extended: true` also decodes bracketed arrays such as
// post_category[0]=1&post_category[1]=5.
const parseForm = express.urlencoded({ extended: true });
// Defensive only: accept a JSON body too if one ever shows up. Do NOT document
// JSON as what WordPress.com sends.
const parseJson = express.json();

app.post(WEBHOOK_PATH, requireUrlToken, parseForm, parseJson, (req, res) => {
  const fields = req.body && typeof req.body === 'object' ? req.body : {};

  // `hook` is the ONLY field WordPress.com always includes. There is no `type`,
  // no `event`, and nothing nested to read it out of.
  const hook = typeof fields.hook === 'string' ? fields.hook : null;
  if (!hook) {
    console.error('WordPress.com webhook rejected: no `hook` field in the body');
    return res.status(400).send('Missing hook field');
  }

  // Acknowledge FIRST. HookPress sends synchronously inside the WordPress action
  // (WordPress.com's implementation may differ), and no retry policy is
  // documented, so never hold the response open for your own work.
  res.status(200).send('OK');

  // Then process out of band. In production hand this to a queue.
  Promise.resolve()
    .then(() => dispatch(hook, fields))
    .then(({ key }) => {
      if (key) console.log(`Processed ${key}`);
    })
    .catch((err) => console.error(`WordPress.com webhook processing failed: ${err.message}`));
});

// Malformed JSON (or an oversized body) surfaces here rather than as a 500.
app.use(WEBHOOK_PATH, (err, req, res, next) => {
  if (err) {
    console.error(`WordPress.com webhook body could not be parsed: ${err.message}`);
    return res.status(400).send('Invalid body');
  }
  return next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = {
  app,
  HOOKS,
  verifyUrlToken,
  dedupeKey,
  dispatch,
  fetchPost,
  handlePublishPost,
  handlePublishPage,
  handleCommentPost,
};

// Start the server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  if (!process.env.WORDPRESS_COM_WEBHOOK_TOKEN) {
    console.warn(
      'WORDPRESS_COM_WEBHOOK_TOKEN is not set — every delivery will be answered ' +
        'with 500 (fail closed). Generate one with `openssl rand -hex 32` and add ' +
        '?token=<value> to the URL you register in Settings -> Webhooks.'
    );
  }
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}${WEBHOOK_PATH}?token=...`);
  });
}
