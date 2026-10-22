// Generated with: truework-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Truework does NOT sign the payload. Each webhook has an authentication token
// (Developer Settings > Webhooks) that Truework sends raw in X-Truework-Token.
export const TOKEN_HEADER = 'x-truework-token';

// Constant-time compare. Hashing both sides gives equal-length buffers, so
// timingSafeEqual never throws and the token's length isn't leaked.
export function safeEqual(a: string | null | undefined, b: string): boolean {
  if (typeof a !== 'string') return false;
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Returns null when no token is configured, so the caller can fail closed. */
export function verifyTrueworkToken(
  headerValue: string | null | undefined,
  token: string = process.env.TRUEWORK_WEBHOOK_TOKEN || ''
): boolean | null {
  if (!token) return null;
  return safeEqual(headerValue, token);
}

/**
 * Handle one webhook. Payload shape: { version, hook: { id, event, target }, data: { order_id, ... } }
 * Webhooks can be delivered more than once, so handlers must be idempotent.
 */
export function handleTrueworkEvent(payload: any): string | undefined {
  const event: string | undefined = payload?.hook?.event;
  const data = payload?.data ?? {};

  switch (event) {
    case 'order.completed':
      // All verifications on the order are completed or canceled: fetch results from the API.
      console.log(`Truework order completed: ${data.order_id}`);
      break;
    case 'verification_request.state.change':
      // state: pending-approval | processing | action-required | completed | canceled | invalid
      console.log(
        `Truework verification request ${data.verification_request_id} on order ${data.order_id} -> ${data.state}`
      );
      break;
    default:
      console.log(`Unhandled Truework event: ${event}`);
  }
  return event;
}
