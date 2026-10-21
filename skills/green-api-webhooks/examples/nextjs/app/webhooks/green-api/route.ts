// Generated with: green-api-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import {
  verifyGreenApiAuthorization,
  handleNotification,
  type GreenApiNotification,
} from '../../../lib/green-api';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  if (!authHeader) {
    return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
  }

  // Compare the whole header ("Bearer <token>" / "Basic <token>") before touching the payload.
  if (!verifyGreenApiAuthorization(authHeader, process.env.GREEN_API_WEBHOOK_URL_TOKEN)) {
    return NextResponse.json({ error: 'Invalid Authorization header' }, { status: 401 });
  }

  let body: GreenApiNotification;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || typeof body.typeWebhook !== 'string') {
    return NextResponse.json({ error: 'Missing typeWebhook' }, { status: 400 });
  }

  try {
    handleNotification(body);
  } catch (err) {
    console.error('Error handling notification:', err);
    // Non-2xx makes GREEN-API retry in a minute.
    return NextResponse.json({ error: 'Processing error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
