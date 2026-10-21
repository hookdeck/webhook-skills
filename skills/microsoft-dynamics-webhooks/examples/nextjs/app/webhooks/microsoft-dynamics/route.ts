// Generated with: microsoft-dynamics-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Dynamics 365 (Dataverse) webhooks are NOT signed. Register the webhook with the
// HttpHeader authentication option (e.g. `X-Webhook-Secret: <hex>`) and compare
// it in constant time. The body is a serialized RemoteExecutionContext: the
// event is `MessageName` (Create, Update, Delete), the table `PrimaryEntityName`.

const DEFAULT_HEADER = 'X-Webhook-Secret';

export const EVENTS = {
  CREATE: 'Create',
  UPDATE: 'Update',
  DELETE: 'Delete',
} as const;

interface KeyValue {
  key: string;
  value: unknown;
}

interface DataverseEntity {
  Id?: string;
  LogicalName?: string;
  Attributes?: KeyValue[];
}

export interface RemoteExecutionContext {
  MessageName: string;
  PrimaryEntityName?: string;
  PrimaryEntityId?: string;
  OperationId?: string;
  InputParameters?: KeyValue[];
  OwningExtension?: { Id?: string };
}

/**
 * Compare the shared secret from the HttpHeader authentication option in constant time.
 * Throws when DYNAMICS_WEBHOOK_SECRET is unset so the route fails closed.
 */
export function verifyDynamicsSecret(headerValue: string | null): boolean {
  const expected = process.env.DYNAMICS_WEBHOOK_SECRET;
  if (!expected) {
    throw new Error('DYNAMICS_WEBHOOK_SECRET is not set');
  }
  if (headerValue === null) return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  // Length check first: timingSafeEqual throws when lengths differ.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Dataverse serializes attributes as [{ key, value }, ...]. Flatten to an object. */
export function flattenAttributes(entity?: DataverseEntity): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (entity && Array.isArray(entity.Attributes)) {
    for (const { key, value } of entity.Attributes) out[key] = value;
  }
  return out;
}

/** Find the Target entity in InputParameters. Absent when the payload exceeded 256 KB. */
export function getTarget(context: RemoteExecutionContext): DataverseEntity | undefined {
  if (!Array.isArray(context.InputParameters)) return undefined;
  const entry = context.InputParameters.find((p) => p && p.key === 'Target');
  return entry ? (entry.value as DataverseEntity) : undefined;
}

/** Dataverse has no delivery ID, so dedupe on OperationId plus the step id. */
export function dedupeKey(context: RemoteExecutionContext): string | null {
  if (!context.OperationId) return null;
  return `${context.OperationId}:${context.OwningExtension?.Id ?? ''}`;
}

async function handleCreate(context: RemoteExecutionContext) {
  const attrs = flattenAttributes(getTarget(context));
  console.log(`${context.PrimaryEntityName} created: ${context.PrimaryEntityId} ${attrs.fullname ?? attrs.name ?? ''}`);
  // TODO: create the record in your system.
}

async function handleUpdate(context: RemoteExecutionContext) {
  const attrs = flattenAttributes(getTarget(context));
  console.log(`${context.PrimaryEntityName} updated: ${context.PrimaryEntityId} changed=${Object.keys(attrs).join(',') || 'n/a'}`);
  // TODO: sync the change. Update carries only the changed attributes, so upsert
  // on PrimaryEntityId or re-fetch the row from the Web API.
}

async function handleDelete(context: RemoteExecutionContext) {
  console.log(`${context.PrimaryEntityName} deleted: ${context.PrimaryEntityId}`);
  // TODO: remove or archive the record.
}

/** Dispatch on MessageName. Returns whether the event was recognised. */
export async function dispatch(context: RemoteExecutionContext): Promise<boolean> {
  switch (context.MessageName) {
    case EVENTS.CREATE:
      await handleCreate(context);
      return true;
    case EVENTS.UPDATE:
      await handleUpdate(context);
      return true;
    case EVENTS.DELETE:
      await handleDelete(context);
      return true;
    default:
      // Acknowledge messages this app doesn't handle.
      console.warn(`Unhandled Dataverse message: ${context.MessageName}`);
      return false;
  }
}

export async function POST(request: NextRequest) {
  const headerName = process.env.DYNAMICS_WEBHOOK_HEADER || DEFAULT_HEADER;

  // Check the shared secret BEFORE reading the body.
  let ok: boolean;
  try {
    // Headers.get() is case-insensitive.
    ok = verifyDynamicsSecret(request.headers.get(headerName));
  } catch (err) {
    console.error(`Dynamics webhook misconfigured: ${(err as Error).message}`);
    return new NextResponse('Webhook secret not configured', { status: 500 });
  }
  if (!ok) {
    console.error(`Dynamics webhook rejected: ${headerName} missing or wrong`);
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
    typeof (payload as RemoteExecutionContext).MessageName !== 'string'
  ) {
    return new NextResponse('Missing MessageName', { status: 400 });
  }
  const context = payload as RemoteExecutionContext;

  console.log(
    `Dynamics webhook: ${context.MessageName} ${context.PrimaryEntityName ?? 'n/a'} key=${dedupeKey(context)}` +
      (request.headers.get('x-ms-dynamics-msg-size-exceeded') ? ' (payload over 256 KB: InputParameters removed)' : '')
  );

  try {
    await dispatch(context);
  } catch (err) {
    console.error(`Dynamics webhook processing failed: ${(err as Error).message}`);
    // Non-2xx fails a synchronous step; 502/503/504 are retried once.
    return new NextResponse('Processing failed', { status: 500 });
  }

  return NextResponse.json({ received: true });
}
