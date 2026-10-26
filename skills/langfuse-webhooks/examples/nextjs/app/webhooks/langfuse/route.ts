// Generated with: langfuse-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyLangfuseSignature } from '../../../lib/verify-langfuse';

interface LangfuseEvent {
  type?: string;
  action?: string;
  prompt?: { name?: string; version?: number; labels?: string[] };
  [key: string]: unknown;
}

function handleEvent(event: LangfuseEvent): void {
  switch (event.action) {
    case 'created':
      console.log(`Prompt version created: ${event.prompt?.name} v${event.prompt?.version}`);
      break;
    case 'updated':
      // Fires twice for a label/tag move: once for the version gaining it, once for the version losing it.
      console.log(`Prompt version updated: ${event.prompt?.name} v${event.prompt?.version}`, event.prompt?.labels);
      break;
    case 'deleted':
      console.log(`Prompt version deleted: ${event.prompt?.name} v${event.prompt?.version}`);
      break;
    default:
      console.log(`Unhandled Langfuse action: ${event.action}`);
  }
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get('x-langfuse-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing x-langfuse-signature header' }, { status: 401 });
  }

  // Raw bytes: verify before parsing.
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyLangfuseSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: LangfuseEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (event === null || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  try {
    handleEvent(event);
  } catch (err) {
    console.error('Error handling Langfuse event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
