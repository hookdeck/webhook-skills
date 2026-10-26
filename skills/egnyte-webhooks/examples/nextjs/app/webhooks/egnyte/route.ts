// Generated with: egnyte-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyEgnyteRequest } from '../../../lib/verify-egnyte';

interface EgnyteEvent {
  eventId?: string;
  eventType?: string;
  user?: { username?: string };
  data?: Record<string, any>;
}

function handleEvent(event: EgnyteEvent): void {
  const data = event.data ?? {};

  switch (event.eventType) {
    case 'fs:add_file':
      console.log(`File added: ${data.targetPath}`);
      // TODO: sync the new file or version
      break;

    case 'fs:delete_file':
      console.log(`File deleted: ${data.targetPath}`);
      // TODO: remove the file from your cache
      break;

    case 'fs:move_file':
      console.log(`File moved: ${data.sourcePath} -> ${data.targetPath}`);
      // TODO: update stored paths
      break;

    case 'fs:add_folder':
      console.log(`Folder added: ${data.targetPath}`);
      break;

    case 'link:create':
      console.log(`Link created by ${event.user?.username}`);
      break;

    case 'comment:set_comment':
      console.log(`Comment on ${data.targetPath}: ${data.comment}`);
      break;

    case 'permission:permission_change':
      console.log(`Permission change on ${data.folderPath}: ${data.oldPrivilege} -> ${data.newPrivilege}`);
      break;

    case 'workflow:completed':
      console.log(`Workflow completed: ${data.workflow?.name}`);
      break;

    case 'group:add_members':
      console.log(`Members added to group ${data.groupName}`);
      break;

    default:
      // Still acknowledge with 200: any other status makes Egnyte retry and eventually disable the webhook.
      console.log(`Unhandled Egnyte event: ${event.eventType}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyEgnyteRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Authorization header' }, { status: 401 });
  }

  let payload: any;
  try {
    // Read the raw text so any content type works.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.data)) {
    return NextResponse.json({ error: 'Expected {"data": [...]}' }, { status: 400 });
  }

  try {
    // One request can carry several events. Dedupe on event.eventId in production.
    for (const event of payload.data as EgnyteEvent[]) {
      handleEvent(event || {});
    }
  } catch (err) {
    console.error('Error handling Egnyte webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  // Egnyte expects exactly 200 (not 202/204).
  return NextResponse.json({ received: true }, { status: 200 });
}
