// Generated with: cloudflare-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

/**
 * CLOUDFLARE NOTIFICATIONS WEBHOOK AUTHENTICATION
 *
 * Cloudflare does NOT sign generic webhooks: no HMAC, no timestamp. The secret
 * you enter when creating the webhook (Alerts -> Destinations -> Webhooks) is
 * sent verbatim in the `cf-webhook-auth` header of every request. Reject the
 * request if the header is missing or isn't your value.
 */

/** Constant-time compare of the cf-webhook-auth header against the secret. */
export function verifyCloudflareAuth(
  header: string | null | undefined,
  secret: string | null | undefined
): boolean {
  if (!header || !secret) return false;
  const a = Buffer.from(header, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  // Length guard first: timingSafeEqual throws on mismatched lengths.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * The event name is the payload's `alert_type`. The dashboard's "Save and Test"
 * message carries only `text`, so it has no alert_type: treat it as "test".
 */
export function eventName(payload: any): string {
  if (payload && typeof payload.alert_type === 'string' && payload.alert_type) {
    return payload.alert_type;
  }
  return 'test';
}

export async function POST(request: NextRequest) {
  const secret = process.env.CLOUDFLARE_WEBHOOK_SECRET;

  // Fail closed on misconfiguration: 500, so it's distinguishable from a bad credential.
  if (!secret) {
    console.error('CLOUDFLARE_WEBHOOK_SECRET is not set — refusing unauthenticated webhooks');
    return NextResponse.json({ error: 'Webhook authentication not configured' }, { status: 500 });
  }

  const header = request.headers.get('cf-webhook-auth');
  if (!header) {
    return NextResponse.json({ error: 'Missing cf-webhook-auth header' }, { status: 401 });
  }

  if (!verifyCloudflareAuth(header, secret)) {
    console.error('Cloudflare webhook cf-webhook-auth mismatch');
    return NextResponse.json({ error: 'Invalid cf-webhook-auth header' }, { status: 401 });
  }

  // Authenticate first, parse second.
  let payload: any;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log(`✓ Authenticated Cloudflare webhook: ${eventName(payload)} (${payload?.policy_id ?? 'no policy_id'})`);

  handleEvent(payload);

  return NextResponse.json({ received: true });
}

function handleEvent(payload: any) {
  // Cloudflare sends no event ID. alert_correlation_id groups the START/END
  // pair of one incident (alert_event), so dedupe on
  // alert_correlation_id + alert_event + ts if you need idempotency.
  const state = payload.alert_event ? ` [${payload.alert_event}]` : '';

  switch (eventName(payload)) {
    case 'advanced_ddos_attack_l4_alert':
      console.log(`🛡️  L4 DDoS attack on ${payload.data?.target_ip}${state}`);
      break;
    case 'advanced_ddos_attack_l7_alert':
      console.log(`🛡️  L7 DDoS attack on ${payload.data?.target_hostname}${state}`);
      break;
    case 'dedicated_ssl_certificate_event_type':
      console.log(`🔐 SSL certificate event for ${payload.data?.hostnames}${state}`);
      break;
    case 'health_check_status_notification':
      console.log(
        `❤️  Health check ${payload.data?.health_check_name}: ` +
          `${payload.data?.old_status} -> ${payload.data?.new_status}${state}`
      );
      break;
    case 'workers_alert':
      console.log(`⚙️  Workers usage alert: ${payload.text}${state}`);
      break;
    case 'workers_observability_alert':
      console.log(`🔭 Workers observability alert: ${payload.data?.config?.name}${state}`);
      break;
    case 'access_custom_certificate_expiration_type':
      console.log(
        `📜 Access certificate for ${payload.data?.hostnames} expires in ` +
          `${payload.data?.days_til_expiration} days${state}`
      );
      break;
    case 'test':
      // Sent by "Save and Test" in the dashboard.
      console.log(`🧪 Test message: ${payload.text}`);
      break;
    default:
      console.log(`Unhandled Cloudflare alert_type: ${eventName(payload)} — ${payload.text}${state}`);
  }
}
