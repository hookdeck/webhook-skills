// Generated with: tripletex-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyTripletexRequest } from '../../../lib/verify-tripletex';

interface TripletexPayload {
  subscriptionId?: number;
  event?: string;
  id?: number;
  value?: unknown;
  [key: string]: unknown;
}

const CRUD_OBJECTS = [
  'supplier', 'employee', 'order', 'product', 'account', 'project',
  'customer', 'contact', 'archiverelation', 'voucher',
];
const CRUD_VERBS = ['create', 'update', 'delete'];

function handleEvent(payload: TripletexPayload): void {
  const { event, id } = payload;

  switch (event) {
    case 'invoice.charged':
      console.log(`Invoice charged: ${id}`);
      // TODO: sync the invoice (payload.value is the invoice DTO)
      return;

    case 'notification.sent':
      console.log(`Notification sent: ${id}`);
      // TODO: surface the notification to the employee
      return;

    case 'voucherstatus.ready':
      console.log(`Voucher ready for processing: ${id}`);
      // TODO: fetch the voucher from the voucher reception
      return;

    case 'closegroup.create':
      console.log(`Close group created: ${id}`);
      // TODO: store payload.value postings; fires on automatic closes (e.g. OCR matching) too
      return;

    case 'closegroup.delete':
      console.log(`Close group deleted: ${id}`);
      // TODO: value is null; reopen the postings you stored from closegroup.create
      return;
  }

  const [object, verb] = String(event).split('.');
  if (CRUD_OBJECTS.includes(object) && CRUD_VERBS.includes(verb)) {
    if (verb === 'delete') {
      console.log(`${object} deleted: ${id}`); // value is null, only the id is sent
      // TODO: remove the local copy of the object
    } else {
      console.log(`${object} ${verb}d: ${id}`);
      // TODO: upsert value (the DTO), ignoring versions older than the stored one
    }
    return;
  }

  console.log(`Unhandled event: ${event}`);
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyTripletexRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing authentication header' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as TripletexPayload);
  } catch (err) {
    console.error('Error handling Tripletex event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
