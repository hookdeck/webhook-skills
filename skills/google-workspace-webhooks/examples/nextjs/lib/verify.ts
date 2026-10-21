// Generated with: google-workspace-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

/**
 * Verify the channel token on a Google Workspace push notification.
 *
 * Google does NOT sign push notifications. The `token` you set in the watch
 * request (max 256 chars) is echoed back in the X-Goog-Channel-Token header of
 * every notification for that channel. Compare it (timing-safe, length-checked)
 * to your stored secret.
 */
export function verifyChannelToken(
  received: string | null | undefined,
  expected: string | undefined
): boolean {
  if (!received || !expected) {
    return false;
  }
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // crypto.timingSafeEqual throws on length mismatch
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}
