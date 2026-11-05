// Generated with: workspace-one-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkspaceOneRequest } from '../../../lib/verify-workspace-one';

/**
 * Omnissa documents the event labels but no payload, so this reads no field from the
 * body. Store the raw body and Content-Type, then write your parser from real
 * notifications captured from your tenant.
 */
function storeNotification(rawBody: string, contentType: string | null): void {
  console.log(`Workspace ONE notification: ${rawBody.length} bytes, ${contentType}`);
}

export async function POST(request: NextRequest) {
  // Authenticate before reading the body.
  if (!verifyWorkspaceOneRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Basic credentials' }, { status: 401 });
  }

  try {
    // Read as text so any content type is accepted.
    storeNotification(await request.text(), request.headers.get('content-type'));
  } catch (err) {
    console.error('Error storing Workspace ONE notification:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
