import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Vercel webhook event types
interface VercelWebhookEvent {
  id: string;
  type: string;
  createdAt: number;
  payload: Record<string, any>;
  region?: string;
}

// Verify Vercel webhook signature
function verifySignature(rawBody: string | Buffer, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha1', secret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    // Buffer length mismatch = invalid signature
    return false;
  }
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get('x-vercel-signature');

  if (!signature) {
    console.error('Missing x-vercel-signature header');
    return NextResponse.json(
      { error: 'Missing x-vercel-signature header' },
      { status: 400 }
    );
  }

  const secret = process.env.VERCEL_WEBHOOK_SECRET;
  if (!secret) {
    console.error('VERCEL_WEBHOOK_SECRET not configured');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  // Get raw body
  const rawBody = await request.text();

  // Verify signature
  const isValid = verifySignature(rawBody, signature, secret);

  if (!isValid) {
    console.error('Invalid webhook signature');
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }

  // Parse verified payload
  let event: VercelWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    console.error('Invalid JSON payload:', err);
    return NextResponse.json(
      { error: 'Invalid JSON payload' },
      { status: 400 }
    );
  }

  // Log the event
  console.log(`Received Vercel webhook: ${event.type}`);
  console.log('Event ID:', event.id);
  console.log('Created at:', new Date(event.createdAt).toISOString());

  // Handle different event types
  try {
    switch (event.type) {
      case 'deployment.created':
        console.log('Deployment created:', {
          id: event.payload.deployment?.id,
          name: event.payload.deployment?.name,
          url: event.payload.deployment?.url,
          project: event.payload.project?.name,
          team: event.payload.team?.name,
          commit: event.payload.deployment?.meta?.githubCommitRef,
          message: event.payload.deployment?.meta?.githubCommitMessage,
        });
        break;

      case 'deployment.succeeded':
        console.log('Deployment succeeded:', {
          id: event.payload.deployment?.id,
          name: event.payload.deployment?.name,
          url: event.payload.deployment?.url,
          duration: event.payload.deployment?.duration,
        });
        // You could trigger post-deployment tasks here
        break;

      case 'deployment.ready':
        console.log('Deployment ready:', {
          id: event.payload.deployment?.id,
          url: event.payload.deployment?.url,
        });
        // Deployment is now receiving traffic
        break;

      case 'deployment.error':
        console.error('Deployment failed:', {
          id: event.payload.deployment?.id,
          name: event.payload.deployment?.name,
          error: event.payload.deployment?.error,
        });
        // You could send alerts here
        break;

      case 'deployment.canceled':
        console.log('Deployment canceled:', {
          id: event.payload.deployment?.id,
          name: event.payload.deployment?.name,
        });
        break;

      case 'deployment.promoted':
        console.log('Deployment promoted:', {
          id: event.payload.deployment?.id,
          name: event.payload.deployment?.name,
          url: event.payload.deployment?.url,
          target: event.payload.deployment?.target,
        });
        // Could trigger cache clearing or feature flag updates
        break;

      case 'project.created':
        console.log('Project created:', {
          id: event.payload.project?.id,
          name: event.payload.project?.name,
          framework: event.payload.project?.framework,
        });
        break;

      case 'project.removed':
        console.log('Project removed:', {
          id: event.payload.project?.id,
          name: event.payload.project?.name,
        });
        // Clean up any external resources
        break;

      case 'project.renamed':
        console.log('Project renamed:', {
          id: event.payload.project?.id,
          oldName: event.payload.project?.oldName,
          newName: event.payload.project?.name,
        });
        // Update external references
        break;

      case 'domain.created':
        console.log('Domain created:', {
          domain: event.payload.domain?.name,
          project: event.payload.project?.name,
        });
        break;

      case 'integration-configuration.removed':
        console.log('Integration removed:', {
          id: event.payload.configuration?.id,
          integration: event.payload.integration?.name,
        });
        break;

      case 'attack.detected':
        console.warn('Attack detected:', {
          type: event.payload.attack?.type,
          action: event.payload.attack?.action,
          ip: event.payload.attack?.ip,
        });
        // Security alerting
        break;

      default:
        console.log('Unhandled event type:', event.type);
        console.log('Payload:', JSON.stringify(event.payload, null, 2));
    }

    // Return success response
    return NextResponse.json({ received: true });

  } catch (err) {
    console.error('Error processing webhook:', err);
    return NextResponse.json(
      { error: 'Error processing webhook' },
      { status: 500 }
    );
  }
}