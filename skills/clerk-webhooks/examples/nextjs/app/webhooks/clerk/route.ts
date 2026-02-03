// Generated with: clerk-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Disable Next.js body parsing to access raw body
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Get Svix headers
  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');

  // Verify required headers are present
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: 'Missing required Svix headers' },
      { status: 400 }
    );
  }

  // Get raw body as text
  const body = await request.text();

  // Verify signature
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret || !secret.startsWith('whsec_')) {
    console.error('Invalid webhook secret configuration');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  try {
    // Construct the signed content
    const signedContent = `${svixId}.${svixTimestamp}.${body}`;

    // Extract the base64 secret (everything after 'whsec_')
    const secretBytes = Buffer.from(secret.split('_')[1], 'base64');

    // Calculate expected signature
    const expectedSignature = crypto
      .createHmac('sha256', secretBytes)
      .update(signedContent)
      .digest('base64');

    // Svix can send multiple signatures separated by spaces
    // Each signature is in format "v1,actualSignature"
    const signatures = svixSignature.split(' ').map(sig => sig.split(',')[1]);

    // Use timing-safe comparison
    const isValid = signatures.some(sig => {
      try {
        return crypto.timingSafeEqual(
          Buffer.from(sig),
          Buffer.from(expectedSignature)
        );
      } catch {
        // timingSafeEqual throws if buffers are different lengths
        return false;
      }
    });

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    // Check timestamp to prevent replay attacks (5 minute window)
    const timestamp = parseInt(svixTimestamp, 10);
    const currentTime = Math.floor(Date.now() / 1000);
    const fiveMinutes = 5 * 60;

    if (currentTime - timestamp > fiveMinutes) {
      return NextResponse.json(
        { error: 'Timestamp too old' },
        { status: 400 }
      );
    }

    // Parse the verified event
    const event = JSON.parse(body);

    // Handle different event types
    console.log(`Received Clerk webhook: ${event.type}`);

    switch (event.type) {
      case 'user.created':
        console.log('New user created:', {
          userId: event.data.id,
          email: event.data.email_addresses?.[0]?.email_address
        });
        // TODO: Add your user creation logic here
        break;

      case 'user.updated':
        console.log('User updated:', {
          userId: event.data.id
        });
        // TODO: Add your user update logic here
        break;

      case 'user.deleted':
        console.log('User deleted:', {
          userId: event.data.id
        });
        // TODO: Add your user deletion logic here
        break;

      case 'session.created':
        console.log('Session created:', {
          sessionId: event.data.id,
          userId: event.data.user_id
        });
        // TODO: Add your session creation logic here
        break;

      case 'session.ended':
        console.log('Session ended:', {
          sessionId: event.data.id,
          userId: event.data.user_id
        });
        // TODO: Add your session end logic here
        break;

      case 'organization.created':
        console.log('Organization created:', {
          orgId: event.data.id,
          name: event.data.name
        });
        // TODO: Add your organization creation logic here
        break;

      default:
        console.log('Unhandled event type:', event.type);
    }

    // Return success response
    return NextResponse.json(
      { success: true, type: event.type },
      { status: 200 }
    );

  } catch (err) {
    console.error('Webhook processing error:', err);
    return NextResponse.json(
      { error: 'Invalid webhook payload' },
      { status: 400 }
    );
  }
}