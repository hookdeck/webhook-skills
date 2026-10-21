// Generated with: green-api-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * GREEN-API sends the configured webhookUrlToken as the FULL Authorization
 * header value: "Bearer <token>" (default) or "Basic <token>". Build that
 * expected value from the configured token. A bare token means "Bearer".
 */
function expectedAuthorization(token) {
  return /^(Bearer|Basic) /.test(token) ? token : `Bearer ${token}`;
}

/**
 * GREEN-API webhooks are not signed (no HMAC). Authenticate the request by
 * constant-time comparing the whole Authorization header, scheme included.
 */
function verifyGreenApiAuthorization(headerValue, token) {
  if (!headerValue || !token) return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expectedAuthorization(token));
  // timingSafeEqual throws on unequal lengths, so check length first.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Dispatch on typeWebhook. GREEN-API retries undelivered notifications every
 * minute for up to 24 hours, so make these handlers idempotent (e.g. dedupe
 * on idMessage).
 */
function handleNotification(body) {
  const { typeWebhook } = body;

  switch (typeWebhook) {
    case 'incomingMessageReceived': {
      const chatId = body.senderData?.chatId;
      const typeMessage = body.messageData?.typeMessage;
      const text = body.messageData?.textMessageData?.textMessage;
      console.log(`Incoming ${typeMessage} ${body.idMessage} from ${chatId}${text ? `: ${text}` : ''}`);
      // TODO: route to your bot / inbox, auto-reply, etc.
      break;
    }

    case 'outgoingMessageReceived':
      console.log(`Message ${body.idMessage} sent from phone to ${body.senderData?.chatId}`);
      // TODO: sync conversations sent outside your app
      break;

    case 'outgoingAPIMessageReceived':
      console.log(`Message ${body.idMessage} sent via API to ${body.senderData?.chatId}`);
      // TODO: log/audit API sends
      break;

    case 'outgoingMessageStatus':
      console.log(`Message ${body.idMessage} to ${body.chatId} is ${body.status}`);
      // TODO: update delivery/read status; handle "failed" and "noAccount" (always sent)
      break;

    case 'stateInstanceChanged':
      console.log(`Instance ${body.instanceData?.idInstance} state: ${body.stateInstance}`);
      // TODO: alert when notAuthorized or blocked
      break;

    case 'statusInstanceChanged':
      console.log(`Instance ${body.instanceData?.idInstance} socket: ${body.statusInstance}`);
      break;

    case 'incomingCall':
      console.log(`Incoming call ${body.idMessage} from ${body.from}`);
      // TODO: missed-call auto-reply
      break;

    default:
      console.log(`Unhandled typeWebhook: ${typeWebhook}`);
  }
}

// Verification uses the Authorization header, not a body signature, so
// parsing JSON up front is fine. Check the header before acting on the payload.
app.post('/webhooks/green-api', express.json(), (req, res) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).send('Missing Authorization header');
  }

  if (!verifyGreenApiAuthorization(authHeader, process.env.GREEN_API_WEBHOOK_URL_TOKEN)) {
    return res.status(401).send('Invalid Authorization header');
  }

  const body = req.body;
  if (!body || typeof body.typeWebhook !== 'string') {
    return res.status(400).send('Missing typeWebhook');
  }

  try {
    handleNotification(body);
  } catch (err) {
    console.error('Error handling notification:', err);
    // Non-2xx makes GREEN-API retry in a minute.
    return res.status(500).send('Processing error');
  }

  res.status(200).json({ received: true });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = app;
module.exports.verifyGreenApiAuthorization = verifyGreenApiAuthorization;
module.exports.expectedAuthorization = expectedAuthorization;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/green-api`);
  });
}
