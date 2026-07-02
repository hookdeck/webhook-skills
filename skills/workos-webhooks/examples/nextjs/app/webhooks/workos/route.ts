// Generated with: workos-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { WorkOS } from '@workos-inc/node';

export const dynamic = 'force-dynamic';

const workos = new WorkOS(process.env.WORKOS_API_KEY);

export async function POST(request: NextRequest) {
  // Read the RAW body for signature verification — do not parse first.
  const rawBody = await request.text();
  const sigHeader = request.headers.get('workos-signature');

  if (!sigHeader) {
    return NextResponse.json(
      { error: 'Missing WorkOS-Signature header' },
      { status: 400 }
    );
  }

  let event;
  try {
    // Verify the signature and parse the event using the WorkOS SDK.
    event = await workos.webhooks.constructEvent({
      payload: rawBody,
      sigHeader,
      secret: process.env.WORKOS_WEBHOOK_SECRET as string,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Webhook signature verification failed:', message);
    return NextResponse.json(
      { error: `Webhook Error: ${message}` },
      { status: 400 }
    );
  }

  // Handle the event based on its type (event.event holds the type string).
  switch (event.event) {
    case 'dsync.user.created':
      console.log('Directory user created:', event.data.id);
      // TODO: Provision the user in your app
      break;

    case 'dsync.group.user_added':
      // For this event, data is { directoryId, user, group }.
      console.log(
        'User added to directory group:',
        event.data.user.id,
        '->',
        event.data.group.id
      );
      // TODO: Grant group-based permissions
      break;

    case 'connection.activated':
      console.log('SSO connection activated:', event.data.id);
      // TODO: Enable SSO login for the organization
      break;

    case 'user.created':
      console.log('User created:', event.data.id);
      // TODO: Create a local user record
      break;

    case 'session.created':
      console.log('Session created:', event.data.id);
      // TODO: Audit the login
      break;

    default:
      console.log(`Unhandled event type: ${event.event}`);
  }

  // Return 200 to acknowledge receipt
  return NextResponse.json({ received: true });
}
