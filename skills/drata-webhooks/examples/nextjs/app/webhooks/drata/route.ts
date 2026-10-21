// Generated with: drata-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Drata webhooks are the "Send webhook" step of a Drata workflow. There is no
// published signature or signing secret (Drata sends through Svix but does not
// document svix-* headers), so authenticate with a shared secret YOU add as a
// custom header (e.g. `X-Webhook-Secret: <hex>`). The body is flat JSON with an
// `event_type` such as CONTROL_EVIDENCE_LINKED.

const DEFAULT_HEADER = 'X-Webhook-Secret';

// `event_type` values for control workflows, as listed in Drata's help center.
export const EVENTS = {
  CONTROL_DETAILS_UPDATED: 'CONTROL_DETAILS_UPDATED',
  CONTROL_READINESS_CHANGED_TO_NOT_READY: 'CONTROL_READINESS_CHANGED_TO_NOT_READY',
  CONTROL_READINESS_CHANGED_TO_READY: 'CONTROL_READINESS_CHANGED_TO_READY',
  CONTROL_EVIDENCE_LINKED: 'CONTROL_EVIDENCE_LINKED',
  CONTROL_EVIDENCE_UNLINKED: 'CONTROL_EVIDENCE_UNLINKED',
  CONTROL_POLICY_LINKED: 'CONTROL_POLICY_LINKED',
  CONTROL_POLICY_UNLINKED: 'CONTROL_POLICY_UNLINKED',
  CONTROL_TEST_MAPPED: 'CONTROL_TEST_MAPPED',
  CONTROL_TEST_UNMAPPED: 'CONTROL_TEST_UNMAPPED',
  CONTROL_REQUIREMENT_MAPPED: 'CONTROL_REQUIREMENT_MAPPED',
  CONTROL_REQUIREMENT_UNMAPPED: 'CONTROL_REQUIREMENT_UNMAPPED',
  CONTROL_TEST_CHANGED_TO_PASS: 'CONTROL_TEST_CHANGED_TO_PASS',
  CONTROL_TEST_CHANGED_TO_FAIL: 'CONTROL_TEST_CHANGED_TO_FAIL',
  CONTROL_OWNER_UPDATED: 'CONTROL_OWNER_UPDATED',
  CONTROL_MARKED_IN_SCOPE: 'CONTROL_MARKED_IN_SCOPE',
  CONTROL_MARKED_OUT_OF_SCOPE: 'CONTROL_MARKED_OUT_OF_SCOPE',
} as const;

const KNOWN_EVENTS = new Set<string>(Object.values(EVENTS));

// Base properties plus whichever control/trigger properties the admin selected.
export interface DrataPayload {
  event_type: string;
  timestamp?: string;
  organization_id?: string | number;
  workspace?: unknown;
  control_id?: string | number;
  control_code?: string;
  control_name?: string;
  evidence_name?: string;
  test_name?: string;
  updated_by?: string;
  [key: string]: unknown;
}

/**
 * Compare the shared secret from the custom header in constant time.
 * Throws when DRATA_WEBHOOK_SECRET is unset so the route fails closed.
 */
export function verifyDrataSecret(headerValue: string | null): boolean {
  const expected = process.env.DRATA_WEBHOOK_SECRET;
  if (!expected) {
    throw new Error('DRATA_WEBHOOK_SECRET is not set');
  }
  if (headerValue === null) return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  // Length check first: timingSafeEqual throws when lengths differ.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Drata sends no delivery ID and retries failed steps, so dedupe on body fields. */
export function dedupeKey(payload: DrataPayload): string | null {
  if (!payload.control_id) return null;
  return `${payload.event_type}:${payload.control_id}:${payload.timestamp ?? ''}`;
}

function controlRef(payload: DrataPayload): string {
  return String(payload.control_code ?? payload.control_id ?? 'unknown');
}

async function handleReadinessChanged(payload: DrataPayload) {
  console.log(`Control ${controlRef(payload)} readiness: ${payload.event_type}`);
  // TODO: open or close a ticket when a control becomes Not ready / Ready.
}

async function handleEvidenceChanged(payload: DrataPayload) {
  console.log(`Control ${controlRef(payload)}: ${payload.event_type} (${payload.evidence_name ?? 'unknown evidence'})`);
  // TODO: sync evidence links into your system.
}

async function handleTestResultChanged(payload: DrataPayload) {
  console.log(`Control ${controlRef(payload)}: ${payload.event_type} (${payload.test_name ?? 'unknown test'})`);
  // TODO: alert the control owner when a mapped test starts failing.
}

async function handleOwnerUpdated(payload: DrataPayload) {
  console.log(`Control ${controlRef(payload)} owner changed by ${payload.updated_by ?? 'unknown'}`);
  // TODO: update ownership in your system.
}

async function handleControlChange(payload: DrataPayload) {
  console.log(`Control ${controlRef(payload)}: ${payload.event_type}`);
  // TODO: handle details, policy, requirement and scope changes.
}

/** Dispatch on `event_type`. Returns whether the event was recognised. */
export async function dispatch(payload: DrataPayload): Promise<boolean> {
  switch (payload.event_type) {
    case EVENTS.CONTROL_READINESS_CHANGED_TO_NOT_READY:
    case EVENTS.CONTROL_READINESS_CHANGED_TO_READY:
      await handleReadinessChanged(payload);
      return true;
    case EVENTS.CONTROL_EVIDENCE_LINKED:
    case EVENTS.CONTROL_EVIDENCE_UNLINKED:
      await handleEvidenceChanged(payload);
      return true;
    case EVENTS.CONTROL_TEST_CHANGED_TO_PASS:
    case EVENTS.CONTROL_TEST_CHANGED_TO_FAIL:
      await handleTestResultChanged(payload);
      return true;
    case EVENTS.CONTROL_OWNER_UPDATED:
      await handleOwnerUpdated(payload);
      return true;
    default:
      if (KNOWN_EVENTS.has(payload.event_type)) {
        await handleControlChange(payload);
        return true;
      }
      // Risk, evidence and personnel workflows use other event_type values.
      // Acknowledge them so Drata doesn't retry.
      console.warn(`Unhandled Drata event: ${payload.event_type}`);
      return false;
  }
}

export async function POST(request: NextRequest) {
  const headerName = process.env.DRATA_WEBHOOK_HEADER || DEFAULT_HEADER;

  // Check the shared secret BEFORE reading the body.
  let ok: boolean;
  try {
    // Headers.get() is case-insensitive.
    ok = verifyDrataSecret(request.headers.get(headerName));
  } catch (err) {
    console.error(`Drata webhook misconfigured: ${(err as Error).message}`);
    return new NextResponse('Webhook secret not configured', { status: 500 });
  }
  if (!ok) {
    console.error(`Drata webhook rejected: ${headerName} missing or wrong`);
    return new NextResponse('Invalid webhook secret', { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof (payload as DrataPayload).event_type !== 'string'
  ) {
    return new NextResponse('Missing event_type field', { status: 400 });
  }
  const event = payload as DrataPayload;

  console.log(`Drata webhook: event_type=${event.event_type} key=${dedupeKey(event)}`);

  try {
    await dispatch(event);
  } catch (err) {
    console.error(`Drata webhook processing failed: ${(err as Error).message}`);
    // Non-2xx lets Drata retry the step (up to three times).
    return new NextResponse('Processing failed', { status: 500 });
  }

  return NextResponse.json({ received: true });
}
