// Generated with: fusionauth-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { jwtVerify } from 'jose';

/**
 * Verify FusionAuth webhook signature
 * FusionAuth sends a JWT in X-FusionAuth-Signature-JWT header containing
 * a request_body_sha256 claim with the Base64-encoded SHA-256 hash of the body
 */
async function verifyFusionAuthWebhook(
  rawBody: string,
  signatureJwt: string | null,
  hmacSecret: string
): Promise<boolean> {
  if (!signatureJwt || !hmacSecret) return false;

  try {
    // Create key from HMAC secret
    const key = new TextEncoder().encode(hmacSecret);

    // Verify JWT signature and decode
    const { payload } = await jwtVerify(signatureJwt, key, {
      algorithms: ['HS256', 'HS384', 'HS512']
    });

    // Calculate SHA-256 hash of request body
    const bodyHash = createHash('sha256')
      .update(rawBody)
      .digest('base64');

    // Compare hash from JWT claim with calculated hash
    return payload.request_body_sha256 === bodyHash;
  } catch (err) {
    console.error('JWT verification failed:', err instanceof Error ? err.message : 'Unknown error');
    return false;
  }
}

interface FusionAuthEvent {
  event: {
    id: string;
    type: string;
    createInstant?: number;
    tenantId?: string;
    applicationId?: string;
    user?: {
      id: string;
      email?: string;
      username?: string;
      firstName?: string;
      lastName?: string;
      verified?: boolean;
      active?: boolean;
    };
    info?: {
      ipAddress?: string;
      userAgent?: string;
    };
  };
}

export async function POST(request: NextRequest) {
  // Get the raw body for signature verification
  const body = await request.text();
  const signatureJwt = request.headers.get('x-fusionauth-signature-jwt');

  // Verify signature if secret is configured
  const webhookSecret = process.env.FUSIONAUTH_WEBHOOK_SECRET;
  if (webhookSecret) {
    const isValid = await verifyFusionAuthWebhook(body, signatureJwt, webhookSecret);
    if (!isValid) {
      console.error('Webhook signature verification failed');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }
  }

  // Parse the verified webhook body
  let event: FusionAuthEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON' },
      { status: 400 }
    );
  }

  const eventType = event.event?.type;

  // Handle the event based on type
  switch (eventType) {
    case 'user.create':
      console.log('User created:', event.event.user?.id);
      // TODO: Sync user to external systems, send welcome email, etc.
      break;

    case 'user.update':
      console.log('User updated:', event.event.user?.id);
      // TODO: Sync user changes to external systems
      break;

    case 'user.delete':
      console.log('User deleted:', event.event.user?.id);
      // TODO: Clean up user data, handle GDPR compliance
      break;

    case 'user.deactivate':
      console.log('User deactivated:', event.event.user?.id);
      // TODO: Revoke access, notify admins
      break;

    case 'user.reactivate':
      console.log('User reactivated:', event.event.user?.id);
      // TODO: Restore access
      break;

    case 'user.login.success':
      console.log('User logged in:', event.event.user?.id);
      // TODO: Audit logging, session tracking
      break;

    case 'user.login.failed':
      console.log('Login failed for:', event.event.user?.email || 'unknown');
      // TODO: Security monitoring, rate limiting
      break;

    case 'user.registration.create':
      console.log('User registered:', event.event.user?.id, 'for app:', event.event.applicationId);
      // TODO: Provision app-specific access
      break;

    case 'user.registration.update':
      console.log('Registration updated:', event.event.user?.id);
      // TODO: Sync role changes
      break;

    case 'user.registration.delete':
      console.log('Registration deleted:', event.event.user?.id);
      // TODO: Revoke app access
      break;

    case 'user.email.verified':
      console.log('Email verified for:', event.event.user?.id);
      // TODO: Enable features requiring verified email
      break;

    default:
      console.log(`Unhandled event type: ${eventType}`);
  }

  // Return 200 to acknowledge receipt
  return NextResponse.json({ received: true });
}
