// Generated with: semaphore-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Semaphore sends POST unless the notification's `action` is set to PUT or PATCH.
export const ALLOWED_METHODS = ['POST', 'PUT', 'PATCH'];

const HEX_64 = /^[0-9a-fA-F]{64}$/;

/**
 * Semaphore sends X-Semaphore-Signature-256: the lowercase hex HMAC-SHA256 of the
 * raw body bytes (no prefix, no timestamp), keyed with the WEBHOOK_SECRET value.
 */
export function verifySemaphoreSignature(
  rawBody: Buffer,
  signature: string | null | undefined,
  secret: string | undefined = process.env.SEMAPHORE_WEBHOOK_SECRET
): boolean {
  if (!secret || typeof signature !== 'string' || !HEX_64.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  // Both are exactly 64 ASCII characters; hex is compared case-insensitively.
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature.toLowerCase()));
}

export interface SemaphorePayload {
  project?: { name?: string };
  pipeline?: { id?: string; name?: string; result?: string };
  [key: string]: unknown;
}

export function handleEvent(payload: SemaphorePayload, webhookId?: string | null): void {
  // No event-name field: every delivery is a finished pipeline. Dispatch on pipeline.result.
  const pipeline = payload.pipeline || {};
  const label = `${payload.project?.name}/${pipeline.name} (${pipeline.id}) [${webhookId || 'no id'}]`;

  switch (pipeline.result) {
    case 'passed':
      console.log(`Pipeline passed: ${label}`);
      // Your code: mark the commit green, trigger a deploy
      break;

    case 'failed':
      console.log(`Pipeline failed: ${label}`);
      // Your code: alert the team, inspect payload.blocks[].jobs[] for the failing job
      break;

    case 'stopped':
      console.log(`Pipeline stopped: ${label}`);
      // Your code: record that it was stopped (pipeline.result_reason says why)
      break;

    case 'canceled':
      console.log(`Pipeline canceled: ${label}`);
      // Your code: record that it was canceled
      break;

    default:
      console.log(`Unhandled Semaphore pipeline result: ${pipeline.result}`);
  }
}
