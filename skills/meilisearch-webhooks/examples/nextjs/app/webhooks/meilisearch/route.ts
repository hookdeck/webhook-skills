// Generated with: meilisearch-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { MeilisearchTask, parseTasks, verifyMeilisearchRequest } from '../../../lib/verify-meilisearch';

function handleTask(task: MeilisearchTask): void {
  const label = `${task.type} task ${task.uid} on ${task.indexUid ?? 'n/a'}: ${task.status}`;

  if (task.status === 'failed') {
    console.log(`Failed ${label}`, task.error?.message);
    // TODO: alert your team (e.g. post to Slack)
    return;
  }
  if (task.status === 'canceled') {
    console.log(`Canceled ${label}`);
    return;
  }

  switch (task.type) {
    case 'documentAdditionOrUpdate':
      console.log(`${label} (${task.details?.indexedDocuments} documents indexed)`);
      // TODO: purge your CDN or application cache
      break;
    case 'documentDeletion':
    case 'settingsUpdate':
    case 'indexCreation':
    case 'indexUpdate':
    case 'indexDeletion':
    case 'indexSwap':
    case 'dumpCreation':
    case 'snapshotCreation':
    case 'taskCancelation':
    case 'taskDeletion':
      console.log(label);
      break;
    default:
      console.log(`Unhandled Meilisearch task type: ${task.type}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading, decompressing or parsing the body.
  if (!verifyMeilisearchRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing Authorization header' }, { status: 401 });
  }

  let tasks: MeilisearchTask[];
  try {
    // Raw bytes: the body is gzip-compressed ndjson, so never use request.text() or json().
    const raw = await request.arrayBuffer();
    tasks = parseTasks(raw, request.headers.get('content-encoding'));
  } catch {
    return NextResponse.json({ error: 'Invalid gzip or ndjson body' }, { status: 400 });
  }

  try {
    tasks.forEach(handleTask);
  } catch (err) {
    console.error('Error handling Meilisearch webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true, tasks: tasks.length });
}
