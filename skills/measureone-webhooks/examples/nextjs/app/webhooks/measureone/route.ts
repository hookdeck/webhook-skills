// Generated with: measureone-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyMeasureOneRequest } from '../../../lib/verify-measureone';

interface MeasureOnePayload {
  event?: string;
  datarequest_id?: string;
  individual_id?: string;
  [key: string]: unknown;
}

function handleEvent(payload: MeasureOnePayload): void {
  const { event, datarequest_id: datarequestId, individual_id: individualId } = payload;
  const ids = `datarequest=${datarequestId} individual=${individualId}`;

  switch (event) {
    case 'datarequest.report_complete':
    case 'datarequest.report_available': // deprecated
      console.log(`Report ready (${event}): ${ids} report_uri=${payload.report_uri}`);
      // TODO: fetch the report from payload.report_uri
      break;

    case 'datarequest.report_update_available':
      console.log(`Report updated: ${ids}`);
      // TODO: re-fetch the report; datarequest.report_complete follows when it is complete
      break;

    case 'datarequest.report_error':
      console.log(`Report error: ${ids} reasons=${JSON.stringify(payload.reason_codes)}`);
      // TODO: ask the individual to provide better documents
      break;

    case 'datarequest.items_available':
    case 'datarequest.items_processed':
      console.log(`Items ready (${event}): ${ids}`);
      // TODO: pull payload.items
      break;

    case 'datarequest.no_items':
      console.log(`No items: ${ids}`);
      // TODO: tell the individual nothing was found
      break;

    case 'datarequest.updates_available': // deprecated
    case 'datarequest.acquisition_completed': // deprecated
      console.log(`Data request update (${event}): ${ids}`);
      break;

    case 'datarequest.refresh_failed':
      console.log(`Refresh failed: ${ids} reasons=${JSON.stringify(payload.reason_codes)}`);
      // TODO: ask the individual to reconnect their account
      break;

    case 'datasource.connected':
      console.log(`Datasource connected: ${ids} datasource=${payload.datasource_id}`);
      break;

    case 'transaction.processed':
      console.log(`Transaction processed: transaction=${payload.transaction_id}`);
      break;

    case 'unprocessable.entity':
      console.log(`Unprocessable item: item=${payload.item_id} reasons=${JSON.stringify(payload.reason_codes)}`);
      break;

    case 'session.completed': // deprecated
    case 'session.rejected':
    case 'session.terminated':
    case 'session.no_login':
      console.log(`Session event (${event}): ${ids} session=${payload.session_id} reason=${payload.reason_code}`);
      // TODO: follow up with the individual
      break;

    case 'item.created':
    case 'item.processed':
      console.log(`Item event (${event}): item=${payload.item_id} type=${payload.item_type}`);
      break;

    case 'item.unavailable':
      console.log(`Item unavailable: type=${payload.item_type} reason=${payload.reason_code}`);
      break;

    case 'individual.purged':
      console.log(`Individual purged: individual=${individualId}`);
      // TODO: delete the individual's data on your side
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyMeasureOneRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook header' }, { status: 401 });
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
    handleEvent(payload as MeasureOnePayload);
  } catch (err) {
    console.error('Error handling MeasureOne event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
