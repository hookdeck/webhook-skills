// Generated with: agentset-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyAgentsetSignature } from '../../../lib/verify-agentset';

type JsonObject = Record<string, unknown>;

const isObject = (v: unknown): v is JsonObject =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

// Every parsed field is untrusted: check its type before reading into it.
function handleEvent(payload: JsonObject): void {
  const event = str(payload.event);
  const data: JsonObject = isObject(payload.data) ? payload.data : {};
  const id = str(data.id);
  const name = str(data.name);

  switch (event) {
    case 'document.ready':
      console.log(`Document ready: ${id} (${name})`);
      // TODO: mark the document as searchable
      break;

    case 'document.error':
      console.log(`Document failed: ${id} (${name}): ${str(data.error)}`);
      // TODO: alert and surface the error
      break;

    case 'document.deleted':
      console.log(`Document deleted: ${id}`);
      // TODO: remove local records
      break;

    case 'ingest_job.ready':
      console.log(`Ingest job ready: ${id} (${name})`);
      // TODO: mark the import as complete
      break;

    case 'ingest_job.error':
      console.log(`Ingest job failed: ${id} (${name}): ${str(data.error)}`);
      // TODO: alert and retry
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// Agentset's docs don't name the HTTP method, so the same handler serves all five.
async function handle(request: NextRequest) {
  // Raw bytes (zero bytes if there is no body), verified before anything is parsed.
  const rawBody = Buffer.from(await request.arrayBuffer());

  if (!verifyAgentsetSignature(rawBody, request.headers.get('agentset-signature'))) {
    return NextResponse.json({ error: 'Invalid or missing signature' }, { status: 401 });
  }

  const text = rawBody.toString('utf8');
  if (text.trim() === '') {
    console.log(`${request.method} webhook with empty body`);
    return NextResponse.json({ received: true });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!isObject(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Agentset webhook:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const GET = handle;
export const DELETE = handle;
