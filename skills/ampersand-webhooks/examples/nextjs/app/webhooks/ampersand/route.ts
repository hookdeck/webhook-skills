// Generated with: ampersand-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { handleNotification, handleResult, verifyAmpersandWebhook } from '../../../lib/ampersand';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  // Read the RAW body (any content type) and verify before parsing.
  const rawBody = await request.text();

  const result = verifyAmpersandWebhook(rawBody, request.headers, process.env.AMPERSAND_WEBHOOK_SECRET);
  if (!result.valid) {
    console.error('Webhook verification failed:', result.error);
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }

  let message: Record<string, any>;
  try {
    message = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (message === null || typeof message !== 'object' || Array.isArray(message)) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Dispatch on notificationType when present, otherwise treat it as a read/subscribe result.
  if (typeof message.notificationType === 'string') {
    handleNotification(message.notificationType, message.data);
    return NextResponse.json({ success: true, type: message.notificationType }, { status: 200 });
  }
  handleResult(message);
  return NextResponse.json({ success: true, type: message.action ?? 'read' }, { status: 200 });
}
