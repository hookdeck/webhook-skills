// Generated with: greendot-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const jwt = require('jsonwebtoken');
const express = require('express');

const app = express();

const TOKEN_SECRET = process.env.GREENDOT_WEBHOOK_TOKEN_SECRET;
const REQUIRED_SCOPE = process.env.GREENDOT_WEBHOOK_SCOPE || 'post:webhook';

/**
 * Authenticate the delivery via the OAuth client_credentials Bearer token.
 *
 * Green Dot authenticates itself to your endpoint (push auth). The token is
 * issued by the client_credentials grant with scope `post:webhook`.
 *
 * In production, validate against your authorization server (JWKS / RS256 or
 * token introspection). Here we validate an HS256 token with a shared secret so
 * the example is self-contained and testable.
 */
function verifyToken(authHeader) {
  const token = String(authHeader || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('Missing bearer token');
  const claims = jwt.verify(token, TOKEN_SECRET); // throws on tampering / expiry
  const scopes = String(claims.scope || claims.scp || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  if (!scopes.includes(REQUIRED_SCOPE)) {
    throw new Error('Token missing required scope');
  }
  return claims;
}

// NOTE: The `x-gd-signature` header is intentionally NOT verified.
//
// A delivery may carry `x-gd-signature`, but Green Dot's public docs do not
// document its algorithm, encoding, or canonical payload — there is no published
// scheme to reproduce. Wiring in a guessed HMAC would make an unverified payload
// look verified, which is worse than no check. Authenticity comes from the OAuth
// Bearer token above (and/or the Certificate/mTLS transport). If your Green Dot
// representative gives you the exact signature spec and key, implement the check
// over the raw body here, after verifyToken.

/**
 * Build the acknowledgement Green Dot expects: a `responseDetails` body plus the
 * echoed `x-GD-RequestId` header. Green Dot's docs require both on a 200 or 201.
 */
function acknowledge(res, requestId, code = 0) {
  if (requestId) res.set('x-GD-RequestId', requestId);
  return res.status(200).json({
    responseDetails: [{ code, subCode: 0, description: requestId || '' }],
  });
}

/**
 * The body is an envelope: { accounts: [{ accountIdentifier, events: [...] }] }.
 * Each event carries eventIdentifier, eventType and eventDateTime, and one
 * request can carry several events, so loop over both arrays.
 */
function eventsIn(body) {
  return (body.accounts || []).flatMap((account) => account.events || []);
}

/** Dispatch on each event's `eventType`. */
function handleEvent(event) {
  switch (event.eventType) {
    case 'transaction':
      console.log(`Transaction event: ${event.eventIdentifier}`);
      // Your code: sync ledger, notify the customer, etc.
      break;
    case 'accountUpdated':
      console.log(`Account updated: ${event.eventIdentifier}`);
      // Your code: refresh local account record.
      break;
    case 'achTransfer':
      console.log(`ACH transfer event: ${event.eventIdentifier}`);
      // Your code: update funding / payout status.
      break;
    case 'cardUpdate':
      console.log(`Card update: ${event.eventIdentifier}`);
      // Your code: card lifecycle handling.
      break;
    case 'billPayTransfer':
      console.log(`Bill pay transfer: ${event.eventIdentifier}`);
      // Your code: bill pay status / receipts.
      break;
    case 'directDepositSwitch':
      console.log(`Direct deposit switch: ${event.eventIdentifier}`);
      // Your code: DD onboarding funnel.
      break;
    case 'provisioning':
      console.log(`Provisioning event: ${event.eventIdentifier}`);
      // Your code: onboarding orchestration.
      break;
    default:
      console.log(`Unhandled eventType: ${event.eventType}`);
  }
}

// Capture the RAW body so parsing happens only after authentication.
app.post(
  '/webhooks/greendot',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const requestId = req.get('x-GD-RequestId');
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');

    // 1) Authenticate the OAuth Bearer token (the real gate).
    try {
      verifyToken(req.get('authorization'));
    } catch (err) {
      return res.status(401).json({ error: 'Unauthorized', message: err.message });
    }

    // Note: x-gd-signature is not verified — see the note above.

    // 2) Parse only AFTER authentication succeeds.
    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    // 3) Handle the event, then acknowledge.
    try {
      eventsIn(event).forEach(handleEvent);
    } catch (err) {
      console.error('Handler error:', err);
      return res.status(500).json({ error: 'Handler error' });
    }

    // 4) Acknowledge: echo x-GD-RequestId + return responseDetails.
    return acknowledge(res, requestId);
  }
);

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Listening for Green Dot webhooks on :${PORT}`));
}

module.exports = app;
