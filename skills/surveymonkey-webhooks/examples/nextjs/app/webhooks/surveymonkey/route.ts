// Generated with: surveymonkey-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextResponse } from 'next/server';
import {
  verifySurveyMonkeySignature,
  handleSurveyMonkeyEvent,
  type SurveyMonkeyEvent,
} from '../../../lib/verify-surveymonkey';

// SurveyMonkey checks the URL with a HEAD request when the webhook is created
// or replaced. It carries no signature: answer 200 and do nothing else.
export async function HEAD() {
  return new Response(null, { status: 200 });
}

export async function POST(request: Request) {
  const clientId = process.env.SURVEYMONKEY_CLIENT_ID;
  const clientSecret = process.env.SURVEYMONKEY_CLIENT_SECRET;
  if (!clientId?.trim() || !clientSecret?.trim()) {
    console.error('SURVEYMONKEY_CLIENT_ID and SURVEYMONKEY_CLIENT_SECRET must both be set: rejecting request');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read the raw bytes: the HMAC covers the exact body.
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifySurveyMonkeySignature(rawBody, request.headers.get('sm-signature'), clientId, clientSecret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: SurveyMonkeyEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8')) as SurveyMonkeyEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  return NextResponse.json(handleSurveyMonkeyEvent(event));
}
