// Generated with: maximizer-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyMaximizerRequest } from '../../../lib/verify-maximizer';

interface MaximizerRecord {
  Key?: string;
  [key: string]: unknown;
}

interface MaximizerWebhook {
  Id?: string;
  Entity?: string;
  Op?: string;
  Data?: {
    Op?: string;
    Original?: MaximizerRecord | null;
    New?: MaximizerRecord | null;
    Version?: string;
  } | null;
  [key: string]: unknown;
}

function handleEvent(webhook: MaximizerWebhook): void {
  const entity = webhook.Entity;
  // The operation is in Data.Op ("Create", "Update", "Delete"); tolerate other casing.
  const rawOp = webhook.Data?.Op || webhook.Op;
  const op = rawOp ? rawOp.charAt(0).toUpperCase() + rawOp.slice(1).toLowerCase() : rawOp;

  switch (`${entity}.${op}`) {
    case 'AbEntry.Create':
      console.log(`Contact created: ${webhook.Data?.New?.Key}`);
      // TODO: add the contact to your system (webhook.Data.New)
      break;

    case 'AbEntry.Update':
      console.log(`Contact updated: ${webhook.Data?.New?.Key}`);
      // TODO: sync changed fields (webhook.Data.Original vs webhook.Data.New)
      break;

    case 'AbEntry.Delete':
      console.log(`Contact deleted: ${webhook.Data?.Original?.Key}`);
      // TODO: remove or archive the contact
      break;

    case 'Opportunity.Create':
      console.log(`Opportunity created: ${webhook.Data?.New?.Key}`);
      // TODO: open a deal in your system
      break;

    case 'Opportunity.Update':
      console.log(`Opportunity updated: ${webhook.Data?.New?.Key}`);
      // TODO: handle stage changes (SalesStageSetupName in Original and New)
      break;

    case 'Opportunity.Delete':
      console.log(`Opportunity deleted: ${webhook.Data?.Original?.Key}`);
      // TODO: close the matching deal
      break;

    case 'Lead.Create':
      console.log(`Lead created: ${webhook.Data?.New?.Key}`);
      // TODO: route the lead to sales
      break;

    case 'Lead.Update':
      console.log(`Lead updated: ${webhook.Data?.New?.Key}`);
      // TODO: sync changed fields
      break;

    case 'Lead.Delete':
      console.log(`Lead deleted: ${webhook.Data?.Original?.Key}`);
      // TODO: remove the lead
      break;

    default:
      console.log(`Unhandled event: ${entity}.${op}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyMaximizerRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook credential' }, { status: 401 });
  }

  let events: unknown;
  try {
    // Read as text so any content type is accepted.
    events = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Maximizer posts a JSON ARRAY of webhook objects.
  if (
    !Array.isArray(events) ||
    !events.every((e) => e && typeof e === 'object' && !Array.isArray(e))
  ) {
    return NextResponse.json({ error: 'Expected a JSON array of webhook objects' }, { status: 400 });
  }

  // Maximizer needs a 200 within 2 seconds: keep this loop cheap and queue slow work.
  for (const webhook of events as MaximizerWebhook[]) {
    try {
      handleEvent(webhook);
    } catch (err) {
      // Don't fail the whole batch: Maximizer would redeliver events already handled.
      console.error('Error handling Maximizer event:', err);
    }
  }

  return NextResponse.json({ received: true });
}
