// Generated with: google-workspace-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import { verifyChannelToken } from '../../../lib/verify';

interface GoogleWorkspaceNotification {
  channelId: string;
  resourceId: string;
  resourceState: string;
  messageNumber: number;
  resourceUri: string | null;
  channelExpiration: string | null;
  changed: string[];
  // Admin SDK Directory only: { kind, id, etag, primaryEmail }
  body: Record<string, unknown> | null;
}

export async function POST(request: NextRequest) {
  const expected = process.env.GOOGLE_WORKSPACE_CHANNEL_TOKEN;
  if (!expected) {
    console.error('GOOGLE_WORKSPACE_CHANNEL_TOKEN is not set');
    return new NextResponse('Server misconfigured', { status: 500 });
  }

  const channelId = request.headers.get('x-goog-channel-id');
  const resourceId = request.headers.get('x-goog-resource-id');
  const resourceState = request.headers.get('x-goog-resource-state');
  const messageNumber = request.headers.get('x-goog-message-number');

  if (!channelId || !resourceId || !resourceState || !messageNumber) {
    return new NextResponse('Missing X-Goog-* headers', { status: 400 });
  }

  // X-Goog-Channel-Token is only present if you set `token` in the watch request.
  if (!verifyChannelToken(request.headers.get('x-goog-channel-token'), expected)) {
    console.error(`Invalid channel token for channel ${channelId}`);
    return new NextResponse('Invalid channel token', { status: 400 });
  }

  // Drive and Calendar notifications have an empty body; Admin SDK Directory
  // notifications carry a small JSON body.
  const raw = await request.text();
  let body: Record<string, unknown> | null = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
  }

  handleNotification({
    channelId,
    resourceId,
    resourceState,
    messageNumber: Number(messageNumber),
    resourceUri: request.headers.get('x-goog-resource-uri'),
    channelExpiration: request.headers.get('x-goog-channel-expiration'),
    // Comma-separated list, e.g. "content,permissions" (Drive update only)
    changed: (request.headers.get('x-goog-changed') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    body,
  });

  // Google treats 200, 201, 202, 204 and 102 as success. Respond fast and
  // fetch the actual change (files.get, changes.list, events.list) async.
  return new NextResponse(null, { status: 200 });
}

/**
 * Dispatch on X-Goog-Resource-State. Notifications only say *that* something
 * changed — call the API to find out *what* changed.
 */
function handleNotification(n: GoogleWorkspaceNotification) {
  console.log(
    `Google Workspace notification: state=${n.resourceState} channel=${n.channelId} message=${n.messageNumber}`
  );

  switch (n.resourceState) {
    // All APIs: first message on a new channel (message number is always 1)
    case 'sync':
      console.log(`Channel ${n.channelId} is active for resource ${n.resourceId}`);
      break;

    // Drive files.watch (add/update are also Admin SDK Directory user events)
    case 'add':
      console.log(`Resource created or shared: ${n.resourceUri}`);
      break;
    case 'update':
      console.log(`Resource updated (${n.changed.join(', ') || 'unspecified'})`);
      break;
    case 'remove':
      console.log(`Resource deleted or unshared: ${n.resourceUri}`);
      break;
    case 'trash':
      console.log(`Resource moved to trash: ${n.resourceUri}`);
      break;
    case 'untrash':
      console.log(`Resource restored from trash: ${n.resourceUri}`);
      break;

    // Drive changes.watch (Google's example header shows "changed")
    case 'change':
    case 'changed':
      console.log('Changelog items added — call changes.list with your saved page token');
      break;

    // Calendar (events, ACLs, calendar lists, settings)
    case 'exists':
      console.log(`Calendar resource changed: ${n.resourceUri} — run an incremental sync`);
      break;
    case 'not_exists':
      console.log(`Calendar resource no longer exists: ${n.resourceUri}`);
      break;

    // Admin SDK Directory users.watch
    case 'delete':
    case 'undelete':
    case 'makeAdmin':
      console.log(`Directory user ${n.resourceState}: ${n.body?.primaryEmail}`);
      break;

    default:
      // Google may add new states; ignore unknown ones gracefully
      console.log(`Unhandled resource state: ${n.resourceState}`);
  }
}
