require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a CallRail webhook signature.
 *
 * CallRail sends `Signature` = base64(HMAC-SHA1(companySigningKey, rawBody)).
 * The key is used as a plain string (not hex-decoded).
 *
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string|undefined} signature - `Signature` header value
 * @param {string|undefined} signingKey - Company signing key from the Webhooks page
 * @returns {boolean} - Whether the signature is valid
 */
function verifyCallRailSignature(rawBody, signature, signingKey) {
  if (!signature || !signingKey) {
    return false;
  }

  const expected = crypto
    .createHmac('sha1', signingKey)
    .update(rawBody)
    .digest('base64');

  // Timing-safe comparison; throws on length mismatch
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Optional replay check using the timestamp inside the body
 * (`timestamp`, or `submitted_at` for form submissions).
 * A tolerance of 0 disables the check.
 */
function isTimestampFresh(payload, toleranceSeconds, nowMs = Date.now()) {
  if (!toleranceSeconds || toleranceSeconds <= 0) {
    return true;
  }
  const value = payload && (payload.timestamp || payload.submitted_at);
  const sentAt = Date.parse(value);
  if (Number.isNaN(sentAt)) {
    return false;
  }
  return Math.abs(nowMs - sentAt) <= toleranceSeconds * 1000;
}

// Event names match the keys of the webhook integration `config` object
// (minus the `_webhook` suffix), e.g. `post_call_webhook` -> `post_call`.
const KNOWN_EVENTS = [
  'pre_call',
  'answered_call',
  'post_call',
  'updated_call',
  'post_outbound_call',
  'updated_outbound_call',
  'sms_received',
  'sms_sent',
  'form_captured',
  'convert_assist_complete',
];

/**
 * CallRail does not put an event type in the body or a header. The event is
 * whichever webhook URL you registered, so either add `?callrail_event=<name>`
 * to the URL, or fall back to inferring it from the payload shape.
 */
function classifyCallRailEvent(payload, hint) {
  if (hint && KNOWN_EVENTS.includes(hint)) {
    return hint;
  }
  if (Array.isArray(payload.changes)) {
    return payload.direction === 'outbound' ? 'updated_outbound_call' : 'updated_call';
  }
  if (payload.form_data) {
    return 'form_captured';
  }
  if (payload.answers && payload.last_interaction_resource_id) {
    return 'convert_assist_complete';
  }
  if (payload.source_number && payload.destination_number && 'content' in payload) {
    return 'agent' in payload ? 'sms_sent' : 'sms_received';
  }
  if (payload.call_type !== undefined || payload.customer_phone_number !== undefined) {
    // Pre-call, call routing complete and post-call share one call object
    return payload.direction === 'outbound' ? 'post_outbound_call' : 'call';
  }
  return 'unknown';
}

function handleCallRailEvent(event, payload) {
  switch (event) {
    case 'pre_call':
      console.log(`Incoming call from ${payload.customer_phone_number} to ${payload.tracking_phone_number}`);
      // TODO: Screen-pop or CRM lookup (respond quickly, the call is still ringing)
      break;

    case 'answered_call':
      console.log(`Call ${payload.id} routed`);
      // TODO: Update the agent's live view
      break;

    case 'post_call':
    case 'post_outbound_call':
      console.log(`Call ${payload.id} finished (${payload.duration}s, answered=${payload.answered})`);
      // TODO: Store the call, recording and transcription
      break;

    case 'updated_call':
    case 'updated_outbound_call':
      console.log(`Call ${payload.id} modified: ${payload.changes.join(', ')}`);
      // TODO: Refresh tags, notes, value, transcription or call summary
      break;

    case 'sms_received':
      console.log(`Text received from ${payload.source_number}: ${payload.content}`);
      // TODO: Route the message to your inbox or CRM
      break;

    case 'sms_sent':
      console.log(`Text sent by ${payload.agent} to ${payload.destination_number}`);
      // TODO: Log the outbound message
      break;

    case 'form_captured':
      console.log(`Form submission ${payload.id} from ${payload.form_url}`);
      // TODO: Create a lead from payload.form_data
      break;

    case 'convert_assist_complete':
      console.log(`Convert Assist finished for ${payload.person_resource_id}`);
      // TODO: Store payload.answers
      break;

    case 'call':
      // Inbound call object (pre-call, call routing complete or post-call).
      // Add ?callrail_event=<name> to each webhook URL to tell them apart.
      console.log(`Call event for ${payload.id}`);
      break;

    default:
      console.log('Unhandled CallRail webhook payload');
  }
}

// CallRail webhook endpoint - must use the raw body for signature verification
app.post('/webhooks/callrail',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const signingKey = process.env.CALLRAIL_SIGNING_KEY;
    if (!signingKey) {
      console.error('CALLRAIL_SIGNING_KEY is not configured');
      return res.status(500).send('Webhook secret not configured');
    }

    const signature = req.headers['signature'];
    if (!signature) {
      return res.status(400).send('Missing Signature header');
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!verifyCallRailSignature(rawBody, signature, signingKey)) {
      console.error('CallRail webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse only after verification
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).send('Invalid payload');
    }

    const tolerance = Number(process.env.CALLRAIL_TIMESTAMP_TOLERANCE_SECONDS || 0);
    if (!isTimestampFresh(payload, tolerance)) {
      return res.status(400).send('Timestamp outside tolerance');
    }

    const event = classifyCallRailEvent(payload, req.query.callrail_event);
    // CallRail does not resend failed webhooks: respond 2xx quickly and
    // de-duplicate on payload.id / payload.resource_id if you process async.
    handleCallRailEvent(event, payload);

    res.status(200).json({ received: true, event });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyCallRailSignature, isTimestampFresh, classifyCallRailEvent };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/callrail`);
  });
}
