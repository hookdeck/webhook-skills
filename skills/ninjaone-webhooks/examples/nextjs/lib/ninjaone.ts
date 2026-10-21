// Generated with: ninjaone-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// NinjaOne does NOT sign webhooks: there is no signature header and no HMAC.
// Authentication is the custom header you set when configuring the webhook via the API
// (PUT /v2/webhook, "headers": [{ "name": "X-Webhook-Secret", "value": "<secret>" }]).
export function verifyNinjaOneSecret(
  headerValue: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!secret) return false; // fail closed when NINJAONE_WEBHOOK_SECRET is unset
  if (typeof headerValue !== 'string') return false;
  // Hash both sides so timingSafeEqual always gets equal-length buffers
  const a = crypto.createHash('sha256').update(headerValue).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

// Field names from the NinjaOne API v2 Activity schema
export interface NinjaOneActivity {
  id?: number;
  activityTime?: number;
  deviceId?: number;
  severity?: string;
  priority?: string;
  seriesUid?: string;
  activityType: string;
  statusCode?: string;
  type?: string;
  status?: string;
  subject?: string;
  message?: string;
  data?: Record<string, unknown>;
}

// An activity is identified by activityType + statusCode (e.g. CONDITION + TRIGGERED).
export function dedupeKey(activity: NinjaOneActivity): string | null {
  return activity.id != null ? `${activity.id}:${activity.statusCode}` : null;
}
