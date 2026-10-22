// Generated with: recruitee-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Verify a Recruitee webhook signature.
 *
 * Recruitee sends the hex HMAC-SHA256 of the RAW request body, keyed with the
 * webhook secret, in the X-Recruitee-Signature header (no prefix, no timestamp).
 */
function verifyRecruiteeWebhook(rawBody: string, signatureHeader: string | null, secret: string | undefined): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Compare the hex strings as UTF-8 bytes. Decoding with Buffer.from(x, 'hex')
  // would stop at the first non-hex character and accept a digest with trailing junk.
  const received = Buffer.from(signatureHeader.trim().toLowerCase(), 'utf8');
  const expected = Buffer.from(expectedSignature, 'utf8');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// Recruitee sends {"test":true} on "Verify and create" / "Test"; it only needs a 200.
function isTestRequest(parsed: any): boolean {
  return !!parsed && parsed.test === true && parsed.event_type === undefined;
}

export async function POST(request: NextRequest) {
  // Raw body for signature verification (do not parse first)
  const body = await request.text();
  const signature = request.headers.get('x-recruitee-signature');

  // Verify the signature before parsing
  if (!verifyRecruiteeWebhook(body, signature, process.env.RECRUITEE_WEBHOOK_SECRET)) {
    // The bare test request may arrive unsigned; it carries no event data.
    if (!signature) {
      try {
        if (isTestRequest(JSON.parse(body))) {
          return NextResponse.json({ received: true });
        }
      } catch {
        // fall through to 400
      }
    }
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Test request (signed): acknowledge without processing.
  if (isTestRequest(event)) {
    return NextResponse.json({ received: true });
  }

  // The event name is in the body: event_type (+ event_subtype), NOT a header.
  const { id, attempt_count, event_type, event_subtype, payload } = event;
  console.log(`Received Recruitee event: ${event_type}/${event_subtype} (id ${id}, attempt ${attempt_count})`);

  // Retries reuse the same id: dedupe on it in real handlers.
  switch (event_type) {
    case 'new_candidate':
      console.log('New candidate:', payload?.candidate?.id, `(${event_subtype})`);
      // TODO: Notify recruiters, sync to CRM, etc.
      break;

    case 'candidate_assigned':
      console.log('Candidate assigned to offer:', payload?.candidate?.id, payload?.offer?.id);
      // TODO: Track applications per job.
      break;

    case 'candidate_moved':
      // Disqualification arrives here, not as its own event_type.
      if (event_subtype === 'disqualified') {
        console.log('Candidate disqualified:', payload?.candidate?.id, payload?.details?.disqualify_reason?.name);
      } else if (event_subtype === 'requalified') {
        console.log('Candidate requalified:', payload?.candidate?.id);
      } else {
        console.log('Candidate moved:', payload?.candidate?.id, payload?.details?.from_stage?.name, '->', payload?.details?.to_stage?.name);
      }
      // TODO: Pipeline analytics, Slack alerts, onboarding on the hire stage, etc.
      break;

    case 'candidate_deleted':
      console.log('Candidate deleted:', payload?.candidate?.id);
      // TODO: Erase the candidate in downstream systems.
      break;

    case 'offer_published':
      console.log('Job published:', payload?.offer?.id);
      break;

    case 'offer_unpublished':
      console.log('Job unpublished:', payload?.offer?.id);
      break;

    case 'offer_updated':
      console.log('Job updated:', payload?.offer?.id, `(${event_subtype})`);
      break;

    default:
      console.log(`Unhandled event: ${event_type}`);
  }

  // Recruitee treats any status other than 200 as a failure and retries.
  return NextResponse.json({ received: true });
}
