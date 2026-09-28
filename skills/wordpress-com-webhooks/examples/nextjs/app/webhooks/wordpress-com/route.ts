// Generated with: wordpress-com-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest } from 'next/server';
import crypto from 'crypto';

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
//
// The practical control is a random token YOU put in the registered URL's query
// string, compared in constant time. It is not provider authentication.

/** The three documented hooks. There are no others. */
export const HOOKS = {
  PUBLISH_POST: 'publish_post',
  PUBLISH_PAGE: 'publish_page',
  COMMENT_POST: 'comment_post',
} as const;

/** A parsed delivery: flat, string-valued, every key optional except `hook`. */
export type Fields = Record<string, string | string[]>;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // Length-guard first: timingSafeEqual throws on a length mismatch.
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Compare the token YOU added to the registered webhook URL
 * (https://example.com/webhooks/wordpress-com?token=<random>).
 *
 * NOT a WordPress.com signature — WordPress.com signs nothing. Throws when the
 * env var is missing so the route fails CLOSED instead of accepting everything.
 */
export function verifyUrlToken(provided: string | null): boolean {
  const expected = process.env.WORDPRESS_COM_WEBHOOK_TOKEN;
  if (!expected) throw new Error('WORDPRESS_COM_WEBHOOK_TOKEN is not set');
  if (provided === null) return false;
  return safeEqual(provided, expected);
}

/**
 * Parse the raw body into flat fields.
 *
 * application/x-www-form-urlencoded is the expected format (inferred from the
 * HookPress lineage, whose sender hands a PHP array to wp_remote_post ->
 * http_build_query). JSON is accepted defensively only — do not document it as
 * what WordPress.com sends.
 *
 * Bracket-encoded arrays (post_category[0]=1&post_category[1]=5) and repeated
 * keys are grouped into string arrays.
 */
export function parseFields(rawBody: string, contentType: string | null): Fields {
  if (contentType && contentType.toLowerCase().includes('application/json')) {
    const parsed = JSON.parse(rawBody) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('JSON body is not an object');
    }
    // Normalise to strings — WordPress.com sends strings on the form-encoded path.
    const out: Fields = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      out[key] = Array.isArray(value) ? value.map(String) : String(value);
    }
    return out;
  }

  const out: Fields = {};
  for (const [key, value] of new URLSearchParams(rawBody)) {
    const bracketed = /^([^[]+)\[\d*\]$/.exec(key);
    const name = bracketed ? bracketed[1] : key;
    const existing = out[name];
    if (bracketed || existing !== undefined) {
      const list = Array.isArray(existing) ? existing : existing === undefined ? [] : [existing];
      list.push(value);
      out[name] = list;
    } else {
      out[name] = value;
    }
  }
  return out;
}

/** Read a single-valued field, ignoring repeated/bracketed values. */
function one(fields: Fields, key: string): string | undefined {
  const value = fields[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Build a dedupe key.
 *
 * publish_post / publish_page fire on the initial publish AND on every later
 * edit of a published item, and there is no delivery-id header, so the same `ID`
 * arrives repeatedly.
 */
export function dedupeKey(hook: string, fields: Fields): string | null {
  if (hook === HOOKS.COMMENT_POST) {
    const id = one(fields, 'comment_ID');
    return id ? `${hook}:${id}` : null;
  }
  const id = one(fields, 'ID');
  if (!id) return null;
  return `${hook}:${id}:${one(fields, 'post_modified_gmt') ?? 'unknown'}`;
}

/**
 * Re-fetch the authoritative post from the WordPress.com REST API.
 *
 * The delivery is unsigned, so the payload is an untrusted HINT. Returns null
 * when WORDPRESS_COM_SITE is not configured.
 */
export async function fetchPost(postId: string): Promise<unknown | null> {
  const site = process.env.WORDPRESS_COM_SITE;
  if (!site) return null;

  const response = await fetch(
    `https://public-api.wordpress.com/rest/v1.1/sites/${encodeURIComponent(site)}/posts/${encodeURIComponent(postId)}`
  );
  if (!response.ok) throw new Error(`REST API returned ${response.status}`);
  return response.json();
}

// --- Event handlers (one per documented hook) -------------------------------

async function handlePublishPost(fields: Fields): Promise<void> {
  console.log(
    `Post published/updated: ${one(fields, 'ID') ?? 'unknown ID'} — ${one(fields, 'post_title') ?? '(post_title not selected)'}`
  );
  // TODO: upsert keyed on ID (see dedupeKey), then act on fetchPost(ID).
}

async function handlePublishPage(fields: Fields): Promise<void> {
  console.log(
    `Page published/updated: ${one(fields, 'ID') ?? 'unknown ID'} — ${one(fields, 'post_title') ?? '(post_title not selected)'}`
  );
}

async function handleCommentPost(fields: Fields): Promise<void> {
  // comment_approved is a STRING: '1' approved, '0' pending moderation, 'spam'.
  // Comments can arrive before moderation — never publish comment_content blindly.
  const approved = one(fields, 'comment_approved');
  const state = approved === '1' ? 'approved' : approved === 'spam' ? 'spam' : 'pending';
  console.log(
    `Comment ${one(fields, 'comment_ID') ?? 'unknown'} on post ${one(fields, 'comment_post_ID') ?? 'unknown'} (${state})`
  );
}

/**
 * Dispatch on the `hook` field — the payload's only discriminator. An unknown
 * hook is logged and still acknowledged with 2xx.
 */
export async function dispatch(
  hook: string,
  fields: Fields
): Promise<{ known: boolean; key: string | null }> {
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
      console.warn(`Unhandled WordPress.com hook: ${hook}`);
      return { known: false, key };
  }
}

export async function POST(request: NextRequest) {
  // 1. Validate the URL token before touching the body.
  try {
    if (!verifyUrlToken(request.nextUrl.searchParams.get('token'))) {
      console.error('WordPress.com webhook rejected: URL token missing or mismatched');
      return new Response('Invalid webhook token', { status: 401 });
    }
  } catch (err) {
    console.error(`WordPress.com webhook misconfigured: ${(err as Error).message}`);
    // Fail CLOSED — never accept a delivery we cannot authenticate at all.
    return new Response('Webhook token not configured', { status: 500 });
  }

  // 2. Parse the flat form-encoded body. `await request.formData()` also works;
  // reading the text keeps the JSON fallback (and any logging) on one path.
  let fields: Fields;
  try {
    fields = parseFields(await request.text(), request.headers.get('content-type'));
  } catch (err) {
    console.error(`WordPress.com webhook body could not be parsed: ${(err as Error).message}`);
    return new Response('Invalid body', { status: 400 });
  }

  // 3. `hook` is the only field WordPress.com always includes.
  const hook = one(fields, 'hook');
  if (!hook) {
    console.error('WordPress.com webhook rejected: no `hook` field in the body');
    return new Response('Missing hook field', { status: 400 });
  }

  // 4. Dispatch. No retries are documented, so keep the work short — in
  // production push it onto a queue (or use `after()`) and acknowledge at once.
  try {
    const { key } = await dispatch(hook, fields);
    if (key) console.log(`Processed ${key}`);
  } catch (err) {
    console.error(`WordPress.com webhook processing failed: ${(err as Error).message}`);
  }

  return new Response('OK', { status: 200 });
}
