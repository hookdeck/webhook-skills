// Generated with: cronofy-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

interface CronofyNotification {
  type: string;
  changes_since?: string;
}

interface CronofyChannel {
  channel_id?: string;
  callback_url?: string;
  filters?: {
    calendar_ids?: string[];
    only_managed?: boolean;
  };
}

interface CronofyPayload {
  notification?: CronofyNotification;
  channel?: CronofyChannel;
}

/**
 * Verify a Cronofy push notification.
 *
 * Cronofy computes HMAC-SHA256 over the RAW request body, keyed with your
 * application's OAuth client secret (prefixed `CRN_`), base64-encoded. There is no
 * separate webhook signing secret.
 *
 * The `Cronofy-HMAC-SHA256` header is a COMMA-SEPARATED LIST of digests — one per
 * active client secret, because Cronofy supports secret rotation. The delivery is
 * authentic if ANY element matches. Comparing the whole header string works until a
 * rotation starts, then rejects everything.
 *
 * Nothing else is signed: no timestamp, no nonce, no channel id, no URL, no method.
 */
export function verifyCronofyWebhook(
  rawBody: Buffer | string,
  hmacHeader: string | null,
  clientSecret: string | undefined
): boolean {
  if (!hmacHeader || !clientSecret) return false;

  const expected = Buffer.from(
    crypto.createHmac('sha256', clientSecret).update(rawBody).digest('base64')
  );

  // reduce, not some: every candidate is compared, so the position of a match
  // isn't observable via timing.
  return hmacHeader.split(',').reduce((matched: boolean, candidate: string) => {
    const buf = Buffer.from(candidate.trim());
    // Guard the length first — timingSafeEqual throws on a length mismatch.
    const ok = buf.length === expected.length && crypto.timingSafeEqual(buf, expected);
    return matched || ok;
  }, false);
}

export async function POST(request: NextRequest) {
  // Read the raw bytes. The HMAC covers exactly what Cronofy sent, so the body must
  // not be parsed (or re-serialized) before verification. arrayBuffer() is byte-exact.
  const rawBody = Buffer.from(await request.arrayBuffer());

  // Header lookup is case-insensitive; Cronofy sends `Cronofy-HMAC-SHA256`.
  const hmacHeader = request.headers.get('cronofy-hmac-sha256');

  if (!hmacHeader) {
    console.error('Missing Cronofy-HMAC-SHA256 header');
    return NextResponse.json({ error: 'Missing signature header' }, { status: 400 });
  }

  // 1. Verify BEFORE parsing. The HMAC header is the only credential Cronofy sends.
  if (!verifyCronofyWebhook(rawBody, hmacHeader, process.env.CRONOFY_CLIENT_SECRET)) {
    console.error('Cronofy webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // 2. Parse only after the signature checks out.
  let payload: CronofyPayload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const notification = payload.notification ?? ({} as CronofyNotification);
  const channel = payload.channel ?? ({} as CronofyChannel);
  const type = notification.type;

  if (!type || typeof type !== 'string') {
    return NextResponse.json({ error: 'Missing notification.type' }, { status: 400 });
  }

  console.log(`✓ Verified Cronofy notification: ${type} (channel=${channel.channel_id})`);

  // 3. Handle. Cronofy requires a 2xx within 5 SECONDS; failed deliveries are retried
  //    for 24 hours and then the CHANNEL IS CLOSED automatically. Keep this fast — in
  //    production enqueue the work (e.g. after(), a queue, or Hookdeck) instead of
  //    doing it inline.
  //
  //    Cronofy has no replay protection (only the body is signed), so handling must be
  //    idempotent — upsert the downstream Read Events sync on event_uid.
  try {
    handleNotification(type, notification, channel);
  } catch (err) {
    console.error(`Error handling ${type}:`, err);
    // Still acknowledge: a non-2xx counts toward the 24-hour window that closes the
    // channel. Record the failure and reconcile out of band.
  }

  return NextResponse.json({ received: true });
}

/**
 * Dispatch on `notification.type` — a BODY field. Cronofy sends no event-type header.
 */
function handleNotification(
  type: string,
  notification: CronofyNotification,
  channel: CronofyChannel
): void {
  switch (type) {
    case 'verification':
      // Sent right after a channel is created to test the callback URL. There is NO
      // token to echo and NO challenge to reflect — a 2xx is the entire handshake.
      console.log(`🔍 Channel ${channel.channel_id} verified: ${channel.callback_url}`);
      break;

    case 'change':
      // THIN NOTIFICATION: the payload does NOT contain the changed events.
      handleChange(notification.changes_since, channel);
      break;

    case 'profile_disconnected':
      // Fires when Cronofy NEXT tries to access the profile, not at the moment the
      // user revoked access. State: UserInfo ["cronofy.data"]["profiles"].
      console.log(`🔌 Calendar profile disconnected (channel=${channel.channel_id})`);
      // Your code: prompt the user to reauthorize; pause syncs for that profile.
      break;

    case 'conferencing_profile_disconnected':
      // State: UserInfo ["cronofy.data"]["conferencing_profiles"].
      console.log(`🎥 Conferencing profile disconnected (channel=${channel.channel_id})`);
      // Your code: prompt reconnect before creating meetings with conferencing.
      break;

    case 'profile_initial_sync_completed':
      // NOT sent if the initial sync completed before this channel existed.
      console.log(`✅ Initial calendar sync completed (channel=${channel.channel_id})`);
      // Your code: run a full read now that the calendar data is complete.
      break;

    case 'gdpr_requested':
      // The account invoked their right to be forgotten.
      console.log(`🗑️  GDPR erasure requested (channel=${channel.channel_id})`);
      // Your code: delete this account's data on your side.
      break;

    default:
      // Cronofy: "your code should be tolerant of others, by ignoring them, so if more
      // are introduced in future your integration will not fail."
      console.log(`❓ Unhandled Cronofy notification type "${type}"`);
  }
}

/**
 * Fetch what actually changed.
 *
 * `changes_since` goes straight into Read Events as `last_modified`. The call MUST hit
 * the same data centre the account belongs to (api.cronofy.com, api-uk.cronofy.com,
 * api-de.cronofy.com, api-au.cronofy.com, api-ca.cronofy.com, api-sg.cronofy.com).
 *
 * Cronofy does NOT send notifications for changes caused by your own API calls.
 */
function handleChange(changesSince: string | undefined, channel: CronofyChannel): void {
  if (!changesSince) {
    console.warn('change notification without changes_since — skipping delta read');
    return;
  }

  const dataCenterUrl = process.env.CRONOFY_DATA_CENTER_URL || 'https://api.cronofy.com';
  const calendarIds = channel.filters?.calendar_ids;

  console.log(`📅 Changes since ${changesSince}`);
  if (calendarIds) {
    console.log(`   restricted to calendars: ${calendarIds.join(', ')}`);
  }

  // Your code: replace with a real, authenticated, paginated read:
  //
  //   const url = new URL('/v1/events', dataCenterUrl);
  //   url.searchParams.set('tzid', 'Etc/UTC');
  //   url.searchParams.set('last_modified', changesSince);
  //   const res = await fetch(url, {
  //     headers: { Authorization: `Bearer ${accessTokenFor(channel.channel_id)}` },
  //   });
  //   // then follow pages.next_page until exhausted, upserting on event_uid
  console.log(
    `   would GET ${dataCenterUrl}/v1/events?tzid=Etc/UTC&last_modified=${changesSince}`
  );
}

// Cronofy only ever POSTs. A GET is handy as a liveness probe while wiring up a channel.
export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'cronofy-webhooks' });
}
