import crypto from 'crypto';

/**
 * Verify a Storyblok webhook signature.
 * Storyblok sends hex(HMAC-SHA1(secret, rawBody)) in the `webhook-signature` header.
 * This is NOT Standard Webhooks: no timestamp, no message ID, no prefix.
 */
export function verifyStoryblokWebhook(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
  const received = signatureHeader.trim().toLowerCase();

  // timingSafeEqual throws when lengths differ
  if (received.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

/**
 * Storyblok has no event-type header: the event is `action` in the body, and
 * `action` is shared between entities, so pick the entity from its id field.
 */
export function entityOf(payload: Record<string, unknown>): string {
  if (payload.experiment_id !== undefined) return 'experiment';
  if (payload.release_id !== undefined) return 'release';
  if (payload.branch_id !== undefined) return 'pipeline';
  if (payload.datasource_slug !== undefined) return 'datasource';
  if (payload.asset_id !== undefined) return 'asset';
  if (payload.user_id !== undefined) return 'user';
  if (payload.workflow_name !== undefined) return 'workflow';
  if (payload.block_uid !== undefined) return 'discussion';
  if (payload.story_id !== undefined) return 'story';
  return 'unknown';
}
