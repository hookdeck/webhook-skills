// Generated with: palmetto-finance-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Each Palmetto Finance subscription sets its own httpMethod, so accept all of these.
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

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
 * Palmetto Finance does not sign payloads. With the default server API key
 * authentication, every delivery carries the key Palmetto returned at registration
 * in a header (apiKey by default; some pages show api_key). We compare the WHOLE
 * header value, with no 'Bearer ' parsing, which is what Hookdeck's source does.
 * Express lowercases incoming header names, so the lookup is case-insensitive.
 */
function verifyPalmettoFinanceRequest(
  headers,
  secret = process.env.PALMETTO_FINANCE_WEBHOOK_SECRET,
  headerName = process.env.PALMETTO_FINANCE_WEBHOOK_HEADER || 'apiKey'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}

const EVENT_LABELS = {
  accountCreated: 'Account created',
  accountUpdated: 'Account updated',
  sendInvite: 'Consumer application invite sent',
  applicationStatus: 'Application status changed',
  contractApproved: 'Contract approved',
  contractSending: 'Contract sending',
  contractSent: 'Contract sent',
  contractSigned: 'Contract signed',
  contractVoided: 'Contract voided',
  contractReinstated: 'Contract reinstated',
  documentStatus: 'Document status changed',
  documentUploaded: 'Document uploaded',
  milestonePackage: 'Milestone package',
  milestoneAchieved: 'Milestone achieved',
  milestoneStatusChanged: 'Milestone status changed',
  quoteCreated: 'Quote created',
  quoteVoided: 'Quote voided',
  requirementStatusChanged: 'Requirement status changed',
  requirementCompleted: 'Requirement completed',
  termsAndConditionsAccepted: 'Terms and conditions accepted',
  allConsumerTaskEvents: 'Consumer task', // check status and activityType
};

function handleEvent(payload) {
  const { event, accountId } = payload;

  switch (event) {
    case 'accountCreated':
      console.log(`${EVENT_LABELS[event]}: ${accountId} (${payload.programType})`);
      // TODO: create the account in your system (payload.accountReference)
      break;

    case 'applicationStatus':
      console.log(`${EVENT_LABELS[event]}: ${accountId} application ${payload.applicationId}`);
      // TODO: update the application record (payload.applicants)
      break;

    case 'contractSigned':
      console.log(`${EVENT_LABELS[event]}: ${accountId} contract ${payload.contractReference}`);
      // TODO: mark the contract signed (payload.quoteReference)
      break;

    case 'milestoneAchieved':
      console.log(`${EVENT_LABELS[event]}: ${payload.newMilestone}`);
      // TODO: advance the project (payload.organizationId)
      break;

    case 'quoteCreated':
      console.log(`${EVENT_LABELS[event]}: ${accountId} quote ${payload.quoteId}`);
      // TODO: store the quote
      break;

    case 'documentUploaded':
      console.log(`${EVENT_LABELS[event]}: ${accountId} document ${payload.documentId}`);
      // TODO: fetch the document
      break;

    default:
      if (EVENT_LABELS[event]) {
        console.log(`${EVENT_LABELS[event]}: ${accountId}`);
      } else {
        console.log(`Unhandled event: ${event}`);
      }
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
function webhookHandler(req, res) {
  // Check the credential first, for every method.
  if (!verifyPalmettoFinanceRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing API key header' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';

  // GET and DELETE deliveries may have no body: acknowledge them.
  if (raw.trim() === '') {
    return res.status(200).json({ received: true });
  }

  let payload;
  try {
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
    console.error('Error handling Palmetto Finance event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
}

for (const method of METHODS) {
  app[method]('/webhooks/palmetto-finance', express.raw({ type: '*/*' }), webhookHandler);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyPalmettoFinanceRequest = verifyPalmettoFinanceRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/palmetto-finance`);
  });
}
