import { NextRequest, NextResponse } from 'next/server';
import { verifyFullEnrichSignature } from '../../../lib/verify-fullenrich';

// Mirrors Get Enrichment Result; `status` is the job state (there are no event types)
type EnrichmentPayload = {
  id?: string;
  name?: string;
  status?: string;
  cost?: { credits?: number };
  data?: Array<Record<string, unknown>>;
};

function handleEnrichment(payload: EnrichmentPayload) {
  switch (payload.status) {
    case 'FINISHED':
      console.log(`Enrichment ${payload.id} finished (${payload.cost?.credits ?? 0} credits)`);
      // TODO: Store payload.data[].contact_info, match rows via data[].custom
      break;

    case 'IN_PROGRESS':
      // Sent per contact by webhook_events.contact_finished
      console.log(`Contact finished in enrichment ${payload.id}`);
      // TODO: Process payload.data[0] as it completes
      break;

    case 'CANCELED':
      console.log(`Enrichment ${payload.id} was canceled`);
      break;

    case 'CREDITS_INSUFFICIENT':
      console.log(`Enrichment ${payload.id} stopped: insufficient credits`);
      // TODO: Alert and top up credits
      break;

    default:
      console.log(`Unhandled enrichment status: ${payload.status}`);
  }
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.FULLENRICH_API_KEY;
  if (!apiKey) {
    console.error('FULLENRICH_API_KEY is not configured');
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  const signature = request.headers.get('x-signature-sha1');
  if (!signature) {
    return NextResponse.json({ error: 'Missing X-Signature-SHA1 header' }, { status: 400 });
  }

  // Raw body for signature verification - don't use request.json() first
  const rawBody = await request.text();
  if (!verifyFullEnrichSignature(rawBody, signature, apiKey)) {
    console.error('FullEnrich webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse only after verification
  let payload: EnrichmentPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // FullEnrich retries non-2xx every minute (up to 5 times): keep this idempotent
  handleEnrichment(payload);

  return NextResponse.json({ received: true });
}
