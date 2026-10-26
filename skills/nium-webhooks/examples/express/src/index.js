// Generated with: nium-webhooks skill
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
 * Nium does not sign payloads. During client setup Nium is told to add a static header
 * to every webhook. The name is user-chosen (NIUM_WEBHOOK_HEADER, default x-partner-key)
 * and the whole value is compared as-is: no 'Bearer ' parsing. This authenticates the
 * sender only, not the body, and gives no replay protection.
 */
function verifyNiumRequest(
  headers,
  secret = process.env.NIUM_WEBHOOK_SECRET,
  headerName = process.env.NIUM_WEBHOOK_HEADER || 'x-partner-key'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

function handleEvent(payload) {
  // Most events name themselves in `template`. RFI events carry rfiDetails.status instead.
  const event = payload.template || (payload.rfiDetails && payload.rfiDetails.status);

  switch (event) {
    case 'CUSTOMER_STATUS_WEBHOOK':
      console.log(`Customer ${payload.customerHashId} status: ${payload.status}/${payload.subStatus}`);
      // TODO: update the customer's onboarding state; check payload.resubmissionAllowed on rejection
      break;

    case 'CUSTOMER_ODD_STATUS_WEBHOOK':
      console.log(`Customer ODD status changed: ${payload.customerHashId}`);
      // TODO: track ongoing due diligence
      break;

    case 'CARD_CLIENT_KYB_STATUS_WEBHOOK':
      console.log(`Client KYB status: ${payload.status} (${payload.complianceStatus})`);
      // TODO: gate go-live on KYB completion
      break;

    case 'REMIT_TRANSACTION_INITIATED_WEBHOOK':
      console.log(`Payout initiated: ${payload.systemReferenceNumber}`);
      // TODO: mark the payout as in flight
      break;

    case 'REMIT_TRANSACTION_PAID_WEBHOOK':
      console.log(`Payout paid: ${payload.systemReferenceNumber}`);
      // TODO: mark the payout as settled
      break;

    case 'REMIT_TRANSACTION_REJECTED_WEBHOOK':
      console.log(`Payout rejected: ${payload.systemReferenceNumber}`);
      // TODO: release funds and notify the sender
      break;

    case 'REMIT_TRANSACTION_RETURNED_WEBHOOK':
      console.log(`Payout returned: ${payload.systemReferenceNumber}`);
      // TODO: refund the sender
      break;

    case 'FX_CONVERSION_COMPLETED_WEBHOOK':
      console.log(`FX conversion completed: ${payload.systemReferenceNumber}`);
      // TODO: update wallet balances
      break;

    case 'FX_CONVERSION_FAILED_WEBHOOK':
    case 'FX_CONVERSION_CANCELLED_WEBHOOK':
      console.log(`FX conversion not completed (${event}): ${payload.systemReferenceNumber}`);
      // TODO: alert and retry or release the quote
      break;

    case 'CARD_POS_APPROVED_WEBHOOK':
    case 'CARD_ATM_APPROVED_WEBHOOK':
      console.log(`Card transaction approved (${event}): ${payload.merchantName} ${payload.transactionAmount} ${payload.transactionCurrency}`);
      // TODO: record the authorization against payload.cardHashId
      break;

    case 'CARD_WALLET_FUNDING_WEBHOOK':
      console.log(`Card wallet funded: ${payload.walletHashId}`);
      // TODO: credit the customer's balance
      break;

    case 'VIRTUAL_ACCOUNT_ASSIGNED_WEBHOOK':
      console.log(`Virtual account assigned: ${payload.customerHashId}`);
      // TODO: show the new account details to the customer
      break;

    case 'INCOMING_FUNDS_WEBHOOK':
      console.log(`Incoming funds: ${payload.walletHashId}`);
      // TODO: reconcile the deposit
      break;

    case 'RFI_REQUESTED':
      console.log(`RFI requested: ${payload.rfiDetails.rfiId}`);
      // TODO: ask the customer to respond (payload.rfiDetails.query)
      break;

    case 'RFI_RESPONDED':
      console.log(`RFI responded: ${payload.rfiDetails.rfiId}`);
      // TODO: mark the RFI as answered
      break;

    case 'RFI_CLOSED':
      console.log(`RFI closed: ${payload.rfiDetails.rfiId}`);
      // TODO: stop chasing the customer
      break;

    default:
      console.log(`Unhandled event: ${event}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/nium', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyNiumRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook credential' });
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
    console.error('Error handling Nium event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  // Nium treats anything other than 200 as a failed delivery.
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyNiumRequest = verifyNiumRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/nium`);
  });
}
