// Generated with: twilio-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const twilio = require('twilio');

const app = express();

/**
 * Verify an X-Twilio-Signature for a form-encoded webhook.
 *
 * Uses the official Twilio SDK, which implements:
 *   HMAC-SHA1(authToken, url + concat(sortedParamName + paramValue)) -> base64
 *
 * @param {string} authToken - Your Twilio Auth Token
 * @param {string} signature - The X-Twilio-Signature header value
 * @param {string} url       - The exact URL Twilio called (scheme + host + path + query)
 * @param {object} params    - Parsed form parameters
 * @returns {boolean}
 */
function verifyTwilioWebhook(authToken, signature, url, params) {
  if (!signature) return false;
  try {
    return twilio.validateRequest(authToken, signature, url, params);
  } catch {
    return false;
  }
}

// Reconstruct the full URL Twilio called. Respect proxy headers when present
// so this works behind tunnels and load balancers.
function buildWebhookUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}${req.originalUrl}`;
}

// Twilio sends most webhooks as application/x-www-form-urlencoded.
app.post('/webhooks/twilio',
  express.urlencoded({ extended: false }),
  (req, res) => {
    const signature = req.headers['x-twilio-signature'];
    const url = buildWebhookUrl(req);
    const params = req.body || {};

    if (!verifyTwilioWebhook(process.env.TWILIO_AUTH_TOKEN, signature, url, params)) {
      console.error('Twilio signature verification failed');
      return res.status(403).send('Invalid signature');
    }

    // Route by which parameters are present — Twilio doesn't put an event field
    // in the body; the "event" is the URL you configured + the params shape.

    // Message status callback (queued, sending, sent, delivered, undelivered, failed)
    if (params.MessageSid && params.MessageStatus) {
      handleMessageStatus(params);
      return res.status(204).send();
    }

    // Call status callback (queued, ringing, in-progress, completed, busy, failed, no-answer, canceled)
    if (params.CallSid && params.CallStatus && params.Direction !== 'inbound' && !params.Body) {
      handleCallStatus(params);
      return res.status(204).send();
    }

    // Recording status callback
    if (params.RecordingSid && params.RecordingStatus) {
      handleRecordingStatus(params);
      return res.status(204).send();
    }

    // Incoming SMS / MMS — respond with TwiML
    if (params.MessageSid && typeof params.Body !== 'undefined') {
      const twiml = handleIncomingSms(params);
      res.type('text/xml');
      return res.send(twiml);
    }

    // Incoming voice call — respond with TwiML
    if (params.CallSid && params.Direction === 'inbound') {
      const twiml = handleIncomingCall(params);
      res.type('text/xml');
      return res.send(twiml);
    }

    console.log('Unhandled Twilio webhook params:', Object.keys(params));
    res.status(204).send();
  }
);

function handleIncomingSms(params) {
  console.log(`Incoming SMS ${params.MessageSid} from ${params.From}: ${params.Body}`);
  // TODO: persist message, trigger downstream logic, etc.
  return '<?xml version="1.0" encoding="UTF-8"?>'
    + '<Response><Message>Thanks, got your message!</Message></Response>';
}

function handleIncomingCall(params) {
  console.log(`Incoming call ${params.CallSid} from ${params.From}`);
  // TODO: route the call, play a recorded message, gather digits, etc.
  return '<?xml version="1.0" encoding="UTF-8"?>'
    + '<Response><Say>Hello from Twilio webhooks.</Say></Response>';
}

function handleMessageStatus(params) {
  console.log(`Message ${params.MessageSid} status: ${params.MessageStatus}`);
  switch (params.MessageStatus) {
    case 'queued':
    case 'sending':
    case 'sent':
      // In-flight states — usually informational
      break;
    case 'delivered':
      // TODO: mark message as delivered in your DB
      break;
    case 'undelivered':
    case 'failed':
      console.error(`Message ${params.MessageSid} failed: ErrorCode=${params.ErrorCode}`);
      // TODO: retry / alert / surface to user
      break;
    default:
      // Channel-specific statuses (e.g. WhatsApp "read") land here
      break;
  }
}

function handleCallStatus(params) {
  console.log(`Call ${params.CallSid} status: ${params.CallStatus}`);
  // Statuses: queued, ringing, in-progress, completed, busy, failed, no-answer, canceled
  // TODO: update your call record
}

function handleRecordingStatus(params) {
  console.log(`Recording ${params.RecordingSid} status: ${params.RecordingStatus}`);
  // TODO: download or process the recording at params.RecordingUrl
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyTwilioWebhook, buildWebhookUrl };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/twilio`);
  });
}
