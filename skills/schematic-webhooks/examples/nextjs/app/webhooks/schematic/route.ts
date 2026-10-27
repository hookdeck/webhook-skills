// Generated with: schematic-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextResponse } from 'next/server';
import { verifySchematicSignature } from '../../../lib/schematic';

export async function POST(request: Request) {
  const secret = process.env.SCHEMATIC_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SCHEMATIC_WEBHOOK_SECRET is not set; refusing to accept unverified webhooks');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Exact bytes as received: never request.json() or request.text() before verifying.
  const rawBody = Buffer.from(await request.arrayBuffer());

  const tolerance = Number(process.env.SCHEMATIC_WEBHOOK_TOLERANCE_SECONDS || 0);
  const result = verifySchematicSignature(
    rawBody,
    request.headers.get('x-schematic-webhook-signature'),
    request.headers.get('x-schematic-webhook-timestamp'),
    secret,
    Number.isFinite(tolerance) ? tolerance : 0
  );

  if (!result.valid) {
    console.error(`Schematic signature verification failed: ${result.error}`);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Verified: only now is it safe to parse.
  let event: SchematicEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (event === null || typeof event !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // event_id is stable across retries (also sent as X-Schematic-Webhook-Id). Dashboard
  // test sends carry neither, so don't require it.
  const eventId = event.event_id || request.headers.get('x-schematic-webhook-id') || null;

  try {
    handleEvent(event, eventId);
  } catch (err) {
    console.error(`Error handling Schematic event ${eventId}:`, err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

interface SchematicEvent {
  action: string;
  account_id?: string;
  environment_id?: string;
  event_id?: string;
  object_type?: string;
  body?: Record<string, unknown>;
  company_id?: string;
  feature_id?: string;
}

function handleEvent(event: SchematicEvent, eventId: string | null) {
  // TODO: drop the event if eventId is already in your store (when eventId is set).
  // Keep handlers fast: Schematic expects a 2xx within 5 seconds.
  const { action } = event;

  switch (action) {
    // Company & user events
    case 'company.created':
    case 'company.updated':
    case 'company.deleted':
    case 'company.plan_changed':
    case 'company.override.created':
    case 'company.override.updated':
    case 'company.override.deleted':
    case 'company.override.expired':
    case 'user.created':
    case 'user.updated':
    case 'user.deleted':
      console.log(`Company/user event ${action} (company ${event.company_id || 'n/a'})`);
      break;

    // Catalog events
    case 'feature.created':
    case 'feature.updated':
    case 'feature.deleted':
    case 'flag.created':
    case 'flag.updated':
    case 'flag.deleted':
    case 'flag_rules.updated':
    case 'rule.deleted':
    case 'plan.created':
    case 'plan.updated':
    case 'plan.deleted':
    case 'plan_version.deleted':
    case 'plan.entitlement.created':
    case 'plan.entitlement.updated':
    case 'plan.entitlement.deleted':
      console.log(`Catalog event ${action} (${event.object_type || 'unknown object'})`);
      break;

    // Billing events
    case 'subscription.trial.ended':
      console.log('Trial ended for a subscription');
      break;

    // Usage-based trigger events
    case 'entitlement.limit.reached':
    case 'entitlement.limit.warning':
    case 'entitlement.soft_limit.reached':
    case 'entitlement.soft_limit.warning':
    case 'entitlement.tier_limit.reached':
    case 'entitlement.tier_limit.warning':
    case 'credit.limit.reached':
    case 'credit.limit.warning':
    case 'credit.purchase.success':
    case 'auto.topup.hard.failure':
    case 'auto.topup.retry.exceeded':
    case 'auto.topup.success':
      console.log(`Usage event ${action} (company ${event.company_id || 'n/a'}, feature ${event.feature_id || 'n/a'})`);
      break;

    default:
      console.log(`Unhandled Schematic event: ${action}`);
  }
}
