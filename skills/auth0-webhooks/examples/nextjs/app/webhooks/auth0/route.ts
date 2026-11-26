// Generated with: auth0-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Auth0 Event Streams are not signed. With bearer authorization, Auth0 sends
 * `Authorization: Bearer <token>` on every request, so compare the whole
 * header with a timing-safe check.
 */
export function verifyAuth0Authorization(
  headerValue: string | null,
  token: string | undefined
): boolean {
  if (!headerValue || !token) return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(`Bearer ${token}`);
  // timingSafeEqual throws on unequal lengths, so guard first.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

interface Auth0Event {
  id: string;
  type: string;
  time: string;
  source?: string;
  data?: { object?: Record<string, unknown> };
  [key: string]: unknown;
}

/**
 * Handle one Auth0 event. Each request carries a single CloudEvents-shaped
 * object: `type` says what happened and `data.object` holds the entity.
 */
function handleEvent(event: Auth0Event): void {
  const object = event.data?.object ?? {};

  switch (event.type) {
    case 'user.created':
      console.log(`User created: ${object.user_id} (event ${event.id} at ${event.time})`);
      // Your code: create the user in your database
      break;

    case 'user.updated':
      console.log(`User updated: ${object.user_id}`);
      // Your code: compare `time` with your stored copy before overwriting
      break;

    case 'user.deleted':
      console.log(`User deleted: ${object.user_id}`);
      // Your code: remove or deactivate the user
      break;

    case 'organization.member.added':
      console.log(`Organization member added: event ${event.id}`);
      // Your code: grant access in your system
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  if (!authHeader) {
    return NextResponse.json(
      { error: 'Missing Authorization header' },
      { status: 401 }
    );
  }

  if (!verifyAuth0Authorization(authHeader, process.env.AUTH0_EVENT_STREAM_TOKEN)) {
    return NextResponse.json(
      { error: 'Invalid Authorization header' },
      { status: 401 }
    );
  }

  const event = (await request.json()) as Auth0Event;

  // Processed before responding, since serverless work after the response
  // isn't guaranteed to run. Auth0 retries only three times, 1s, 2s and 4s
  // apart, so hand slow work to a queue and return quickly.
  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling event:', err);
  }

  return new NextResponse(null, { status: 204 });
}
