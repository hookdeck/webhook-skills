// Generated with: surveymonkey-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// SurveyMonkey callbacks carry Sm-Apikey (your client ID) and Sm-Signature:
// the base64 HMAC-SHA1 of the raw body, keyed with the literal string
// "<client ID>&<client secret>" ("<API key>&<API secret>" for old-auth apps).

export interface SurveyMonkeyEvent {
  name?: string;
  filter_type?: string;
  filter_id?: string;
  event_type: string;
  event_id: string;
  object_type?: string;
  object_id?: string;
  event_datetime?: string;
  resources?: { respondent_id?: string; recipient_id?: string; collector_id?: string; survey_id?: string; user_id?: string };
}

/** Verify Sm-Signature against the exact bytes SurveyMonkey sent. */
export function verifySurveyMonkeySignature(
  rawBody: Buffer | string,
  signature: string | null | undefined,
  clientId: string | null | undefined,
  clientSecret: string | null | undefined
): boolean {
  const id = String(clientId ?? '').trim();
  const secret = String(clientSecret ?? '').trim();
  const value = String(signature ?? '').trim();
  // SHA-1 is 20 bytes: 28 base64 characters with one '='.
  if (!id || !secret || !/^[A-Za-z0-9+/]{27}=$/.test(value)) return false;
  const expected = crypto.createHmac('sha1', `${id}&${secret}`).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(value, 'base64'), expected);
}

/** The body names the event and the IDs; fetch the response itself from the API. */
export function handleSurveyMonkeyEvent(event: SurveyMonkeyEvent) {
  if (event.event_type === 'response_completed') {
    console.log(`Response ${event.object_id} completed for survey ${event.resources?.survey_id}`);
  } else {
    console.log(`SurveyMonkey event: ${event.event_type}`);
  }
  return { received: true, event_type: event.event_type, event_id: event.event_id };
}
