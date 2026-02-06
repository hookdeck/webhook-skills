// Generated with: clerk-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { verifyWebhook } from '@clerk/backend/webhooks';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const evt = await verifyWebhook(request, {
      signingSecret: process.env.CLERK_WEBHOOK_SIGNING_SECRET || process.env.CLERK_WEBHOOK_SECRET
    });
    const event = evt as { type: string; data: Record<string, unknown> };

    console.log(`Received Clerk webhook: ${event.type}`);

    switch (event.type) {
      case 'user.created':
        console.log('New user created:', {
          userId: event.data.id,
          email: (event.data as { email_addresses?: Array<{ email_address: string }> }).email_addresses?.[0]?.email_address
        });
        break;
      case 'user.updated':
        console.log('User updated:', { userId: event.data.id });
        break;
      case 'user.deleted':
        console.log('User deleted:', { userId: event.data.id });
        break;
      case 'session.created':
        console.log('Session created:', {
          sessionId: event.data.id,
          userId: (event.data as { user_id: string }).user_id
        });
        break;
      case 'session.ended':
        console.log('Session ended', {
          sessionId: event.data.id,
          userId: (event.data as { user_id: string }).user_id
        });
        break;
      case 'organization.created':
        console.log('Organization created:', {
          orgId: event.data.id,
          name: (event.data as { name: string }).name
        });
        break;
      default:
        console.log('Unhandled event type:', event.type);
    }

    return NextResponse.json(
      { success: true, type: event.type },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook verification failed';
    let errorResponse = 'Webhook verification failed';
    if (message.includes('Missing required Svix headers')) errorResponse = 'Missing required Svix headers';
    else if (message === 'No matching signature found') errorResponse = 'Invalid signature';
    else if (message === 'Message timestamp too old') errorResponse = 'Timestamp too old';
    else errorResponse = message;
    console.error('Webhook verification failed:', err);
    return NextResponse.json(
      { error: errorResponse },
      { status: 400 }
    );
  }
}
