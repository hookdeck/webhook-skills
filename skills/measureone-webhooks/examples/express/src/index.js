// Generated with: measureone-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * MeasureOne does not sign webhooks. You add a static header to
 * delivery_details[].headers on each Data Request; the header name is yours to choose.
 * Compare the WHOLE header value (do not strip or parse a "Bearer " prefix).
 * This authenticates the sender only: it does not cover the body and gives no replay protection.
 */
function verifyMeasureOneRequest(
  headers,
  secret = process.env.MEASUREONE_WEBHOOK_SECRET,
  headerName = process.env.MEASUREONE_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lowercases incoming header names
  return Boolean(received) && safeEqual(received, secret);
}

function handleEvent(payload) {
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

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/measureone', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyMeasureOneRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook header' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling MeasureOne event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyMeasureOneRequest = verifyMeasureOneRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/measureone`);
  });
}
