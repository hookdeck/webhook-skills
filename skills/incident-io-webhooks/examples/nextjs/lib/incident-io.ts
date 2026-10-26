// Generated with: incident-io-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'node:crypto';

/**
 * Turn the endpoint's Signing secret into HMAC key bytes (Standard Webhooks rule):
 * `whsec_<base64>` -> base64-decode the part after the prefix; anything else -> UTF-8 bytes.
 * Returns null for a secret that is malformed or decodes to zero bytes.
 */
export function secretToKey(secret: string | undefined): Buffer | null {
  if (typeof secret !== 'string' || secret.length === 0) return null;
  if (!secret.startsWith('whsec_')) return Buffer.from(secret, 'utf8');
  const encoded = secret.slice('whsec_'.length);
  // Buffer.from(x, 'base64') skips invalid characters, so check the alphabet first
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
  const key = Buffer.from(encoded, 'base64');
  return key.length > 0 ? key : null;
}

/**
 * Verify an incident.io webhook (Standard Webhooks, `webhook-*` headers).
 *
 * signed content = `${webhook-id}.${webhook-timestamp}.` + raw body
 * expected       = base64(HMAC-SHA256(key, signed content))
 * webhook-signature is a space-delimited list of `v1,<base64>` entries (several
 * during a secret rotation); any v1 match passes.
 *
 * toleranceSeconds: null skips the replay window (the timestamp is still signed).
 */
export type VerifyResult = { ok: true } | { ok: false; error: string };

export function verifyIncidentIoSignature(
  rawBody: string | Buffer,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  key: Buffer,
  toleranceSeconds: number | null = null
): VerifyResult {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return { ok: false, error: 'Missing required webhook headers' };
  if (!/^[1-9]\d*$/.test(timestamp)) return { ok: false, error: 'Invalid webhook-timestamp' };

  if (toleranceSeconds !== null) {
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > toleranceSeconds) {
      return { ok: false, error: 'Timestamp outside tolerance window' };
    }
  }

  const expected = Buffer.from(
    crypto
      .createHmac('sha256', key)
      .update(`${id}.${timestamp}.`)
      .update(rawBody)
      .digest('base64')
  );

  // Compare the base64 text, not decoded bytes: decoding is lenient and would let junk through
  const matched = signature.split(' ').some((entry) => {
    const comma = entry.indexOf(',');
    if (comma === -1 || entry.slice(0, comma) !== 'v1') return false;
    const received = Buffer.from(entry.slice(comma + 1));
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });

  return matched ? { ok: true } : { ok: false, error: 'Invalid signature' };
}

export function toleranceFromEnv(): number | null {
  const value = process.env.INCIDENT_IO_WEBHOOK_TOLERANCE_SECONDS;
  if (!value) return null;
  const seconds = Number(value);
  return Number.isInteger(seconds) && seconds > 0 ? seconds : null;
}

/**
 * The body is `{ "event_type": "<type>", "<type>": { ...resource } }`: the resource sits
 * under a key named after the event type (dots included), so it needs bracket access.
 */
export function handleEvent(eventType: string, resource: any): void {
  switch (eventType) {
    // Private incidents, alerts and escalations carry only the resource id.
    // Fetch details from the REST API with a key that has private access.
    case 'private_incident.incident_created_v2':
    case 'private_incident.incident_updated_v2':
    case 'private_incident.action_created_v1':
    case 'private_incident.action_updated_v1':
    case 'private_incident.follow_up_created_v1':
    case 'private_incident.follow_up_created_v2':
    case 'private_incident.follow_up_updated_v1':
    case 'private_incident.follow_up_updated_v2':
    case 'private_incident.postmortem_document_status_updated_v1':
    case 'private_alert.alert_created_v1':
    case 'private_alert.alert_resolved_v1':
    case 'private_escalation.escalation_created_v1':
    case 'private_escalation.escalation_status_updated_v1':
      console.log(`${eventType}: private resource ${resource?.id} (fetch details via the API)`);
      break;

    case 'private_incident.membership_granted_v1':
    case 'private_incident.membership_revoked_v1':
      console.log(`${eventType}: user ${resource?.user_id} on incident ${resource?.incident_id}`);
      break;

    case 'public_incident.incident_created_v2':
    case 'public_incident.incident_updated_v2':
      console.log(`${eventType}: ${resource?.reference} ${resource?.name} (${resource?.incident_status?.name})`);
      break;

    case 'public_incident.incident_status_updated_v2':
      console.log(
        `Incident ${resource?.incident?.reference}: ${resource?.previous_status?.name} -> ${resource?.new_status?.name}`
      );
      break;

    // action_* is the older naming for follow-ups; both are still emitted
    case 'public_incident.action_created_v1':
    case 'public_incident.action_updated_v1':
    case 'public_incident.follow_up_created_v1':
    case 'public_incident.follow_up_created_v2':
    case 'public_incident.follow_up_updated_v1':
    case 'public_incident.follow_up_updated_v2':
      console.log(`${eventType}: follow-up ${resource?.id} on incident ${resource?.incident_id} (${resource?.status})`);
      break;

    case 'public_incident.postmortem_document_status_updated_v1':
      console.log(`Postmortem ${resource?.postmortem_document?.id}: ${resource?.previous_status} -> ${resource?.new_status}`);
      break;

    case 'public_alert.alert_created_v1':
    case 'public_alert.alert_resolved_v1':
      console.log(`${eventType}: ${resource?.title} (${resource?.status})`);
      break;

    case 'public_escalation.escalation_created_v1':
      console.log(`Escalation created: ${resource?.title} (${resource?.status})`);
      break;

    case 'public_escalation.escalation_status_updated_v1':
      console.log(`Escalation ${resource?.escalation?.id}: ${resource?.previous_status} -> ${resource?.new_status}`);
      break;

    case 'schedule.created_v1':
    case 'schedule.updated_v1':
    case 'schedule.deleted_v1':
      console.log(`${eventType}: ${resource?.name} (${resource?.id})`);
      break;

    case 'schedule.shift_change_v1':
      console.log(
        `On-call change for ${resource?.schedule?.name}:`,
        (resource?.current_users ?? []).map((u: { name?: string }) => u.name)
      );
      break;

    case 'status_page_incident.update_shared_v1':
      console.log(
        `Status page update for ${resource?.status_page_incident?.name} (${resource?.status_page_incident?.incident_status})`
      );
      break;

    default:
      console.log('Unhandled incident.io event type:', eventType);
  }
}
