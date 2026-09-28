// Generated with: ordinal-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * ORDINAL DOES NOT SIGN WEBHOOK DELIVERIES.
 *
 * There is no signature header, no signing secret, no `whsec_` key, no timestamp
 * header, no HMAC and no Standard Webhooks / Svix headers. The Create webhook
 * response returns only id, name, url, topics, createdAt — no secret is ever
 * issued. Do NOT write an HMAC verifier: there are no inputs for one, and a
 * fabricated verifier rejects 100% of genuine deliveries.
 *
 * The ONLY authentication mechanism is a STATIC custom header YOU configure on
 * the webhook via its optional `headers` field ("Optional custom headers to
 * include in webhook requests"). Ordinal adds those headers to every delivery.
 * The header NAME is your choice — it is NOT an Ordinal-defined header.
 *
 * This is a shared-secret CHANNEL check, not integrity protection: the value is
 * identical on every delivery, so it is only as good as TLS and secret hygiene.
 * It proves the caller knows the secret, NOT that the body is unmodified.
 * Rotate by PATCHing `headers` on the webhook.
 *
 * Because nothing is signed over the body, there is NO RAW-BODY REQUIREMENT.
 * `await request.json()` before authenticating is fine here — the opposite of
 * Stripe / Shopify / GitHub, where a body parser before verification breaks the
 * HMAC. (This handler still checks the header first, out of habit and because
 * there is no reason to parse untrusted input any earlier than necessary.)
 */

/** Every Ordinal delivery uses exactly this envelope. */
export interface OrdinalEvent {
  /** The event type, e.g. "post.published". */
  type: string;
  /** Event-specific payload with ONE key, whose name depends on the family. */
  data?: Record<string, any>;
  /** ISO 8601 time the event was emitted. */
  createdAt?: string;
}

/**
 * The header name you set in the webhook's `headers` object.
 *
 * Read at call time (not module load) so the value always reflects the running
 * environment. `Headers.get()` is case-insensitive, so `X-Webhook-Secret` in the
 * webhook config matches this lowercase lookup.
 */
export function secretHeaderName(): string {
  return (process.env.ORDINAL_WEBHOOK_SECRET_HEADER || 'x-webhook-secret').toLowerCase();
}

/**
 * Constant-time comparison of the inbound secret header.
 *
 * FAILS CLOSED: an unconfigured `expected` returns false. Never `return true`
 * here — that would turn a misconfigured deploy into a fully open endpoint.
 *
 * @param provided - the inbound header value (null when absent)
 * @param expected - ORDINAL_WEBHOOK_SECRET
 */
export function verifyOrdinalSecret(
  provided: string | null | undefined,
  expected: string | undefined
): boolean {
  if (!expected) return false; // fail closed on misconfiguration
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // crypto.timingSafeEqual THROWS on length mismatch — compare lengths first.
  // Never use === : it short-circuits and leaks the secret prefix via timing.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export type OrdinalResourceKey = 'profile' | 'post' | 'comment' | 'approval' | 'invite';

/**
 * The single key inside `data` depends on the event family. Reading `data.post`
 * on a comment or approval event yields undefined — the most common Ordinal bug.
 */
export function resourceKeyFor(type: string | undefined): OrdinalResourceKey | null {
  if (typeof type !== 'string') return null;
  if (type.startsWith('social_profile.')) return 'profile';
  if (type === 'post.comment.created' || type === 'post.inline_comment.created') return 'comment';
  // Covers post.approval.* AND campaign.approval.* — both use `data.approval`.
  if (type.includes('.approval.')) return 'approval';
  if (type.startsWith('invite.')) return 'invite';
  if (type.startsWith('post.')) return 'post';
  return null;
}

/** Read the resource out of the envelope regardless of family. */
export function extractResource(event: OrdinalEvent): {
  key: OrdinalResourceKey | null;
  resource: Record<string, any>;
} {
  const key = resourceKeyFor(event?.type);
  const data = event?.data ?? {};
  const value = key ? data[key] : undefined;
  return { key, resource: value && typeof value === 'object' ? value : {} };
}

/**
 * Derive an idempotency key.
 *
 * ORDINAL SHIPS NO EVENT ID: the envelope has no top-level id and no delivery-id
 * header is documented. This composite of type + the resource id inside `data` +
 * `createdAt` is OUR OWN CONVENTION for dedupe, not a documented Ordinal key.
 */
export function idempotencyKeyFor(event: OrdinalEvent): string {
  const { resource } = extractResource(event);
  // Approvals nest the subject; fall back through the plausible id locations.
  const id = resource.id ?? resource.post?.id ?? resource.campaign?.id ?? 'unknown';
  return `${event.type}:${id}:${event.createdAt}`;
}

export async function POST(request: NextRequest) {
  const header = secretHeaderName();
  const secret = process.env.ORDINAL_WEBHOOK_SECRET;

  // FAIL CLOSED, and use 500 (not 401) so an operator can tell "my server is
  // misconfigured" apart from "someone sent a bad secret".
  if (!secret) {
    console.error(
      'ORDINAL_WEBHOOK_SECRET is not set — refusing to accept unauthenticated webhooks. ' +
        'Generate one (openssl rand -hex 32) and set it on the webhook via ' +
        'PATCH /api/v1/webhooks/{id} with {"headers":{"X-Webhook-Secret":"<secret>"}}.'
    );
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // 401, not 400: a bad or absent secret is an AUTHENTICATION failure.
  if (!verifyOrdinalSecret(request.headers.get(header), secret)) {
    console.error(`Ordinal webhook rejected: ${header} missing or mismatched`);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Safe to parse: nothing is signed over the raw bytes.
  let event: OrdinalEvent;
  try {
    event = (await request.json()) as OrdinalEvent;
  } catch {
    console.error('Ordinal webhook rejected: body is not valid JSON');
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!event || typeof event !== 'object' || typeof event.type !== 'string') {
    console.error('Ordinal webhook rejected: envelope missing a string `type`');
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const idempotencyKey = idempotencyKeyFor(event);
  console.log(`✓ Authenticated Ordinal webhook: ${event.type} (${idempotencyKey})`);

  try {
    await handleEvent(event, idempotencyKey);
  } catch (err) {
    // Log and still acknowledge: Ordinal documents no retry policy, so a non-2xx
    // has undefined consequences and re-delivery is not something to rely on for
    // a bug in your own handler.
    console.error(`Error handling Ordinal event ${idempotencyKey}:`, err);
  }

  // Any 2xx acknowledges receipt (docs: "Your endpoint should respond with a 2xx
  // status code to acknowledge receipt"). Ordinal documents no delivery timeout,
  // so acknowledge fast and enqueue slow work instead of awaiting it.
  return NextResponse.json({ received: true }, { status: 200 });
}

/**
 * Dispatch on the exact event type strings.
 *
 * NOTE THE MIXED SEPARATORS: publish_failed, reconnect_needed,
 * permanently_deleted and inline_comment use UNDERSCORES inside an otherwise
 * dot-separated name. `post.publish.failed` and `post.publishFailed` are wrong.
 */
async function handleEvent(event: OrdinalEvent, idempotencyKey: string) {
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
        `📝 Post created: ${resource.title} [${(resource.channels ?? []).join(', ')}] status=${resource.status}`
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
      console.log(`💬 Comment on "${resource.post?.title}": ${resource.message}`);
      break;
    case 'post.inline_comment.created':
      // Text-anchored comment. One event per comment, INCLUDING replies in a
      // thread (documented for inline comments); thread context is in `thread`.
      console.log(`💬 Inline comment on "${resource.post?.title}": ${resource.message}`);
      break;

    // --- Approvals (data.approval for BOTH post.* and campaign.*) -----------
    case 'post.approval.requested':
      console.log(
        `🔍 Approval requested on "${resource.post?.title}" for ` +
          `${(resource.createdApprovals ?? []).length} approver(s)`
      );
      break;
    case 'post.approval.approved':
      console.log(`✅ Post approved: ${resource.post?.title}`);
      break;
    case 'campaign.approval.requested':
      // Same `data.approval` key, but with `campaign` instead of `post`.
      console.log(`🔍 Campaign approval requested: ${resource.campaign?.name}`);
      break;
    case 'campaign.approval.approved':
      console.log(`✅ Campaign approved: ${resource.campaign?.name}`);
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
