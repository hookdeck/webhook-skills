// Generated with: alipay-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config();
const express = require('express');
const { ACK_BODY, verifyAlipaySignature } = require('./verify');

const app = express();

const CLIENT_ID = process.env.ALIPAY_CLIENT_ID;
const ALIPAY_PUBLIC_KEY = process.env.ALIPAY_PUBLIC_KEY; // Antom/Alipay+ public key — verifies inbound

const WEBHOOK_PATH = '/webhooks/alipay';

// Send the SUCCESS acknowledgement. Antom resends the notification until it
// gets this fixed body; the acknowledgement needs no signature.
function sendAck(res) {
  res
    .status(200)
    .set('Client-Id', CLIENT_ID)
    .set('Response-Time', new Date().toISOString())
    .type('application/json')
    .send(ACK_BODY);
}

// The event type sits in a different field per notification API.
function notificationType(event) {
  return (
    event.notifyType || // notifyPayment, notifyCapture, notifyRefund, notifyReversal
    event.authorizationNotifyType || // notifyAuthorization
    event.disputeNotificationType || // notifyDispute
    event.subscriptionNotificationType || // notifySubscription
    null // notifyVaulting and the subscription notifyPayment carry no type
  );
}

// CRITICAL: express.raw() — the signature covers the exact raw bytes, so the
// body must NOT be parsed to JSON before verification.
app.post(WEBHOOK_PATH, express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = req.body.toString('utf8');
  const clientId = req.get('Client-Id');
  const requestTime = req.get('Request-Time');
  const signatureHeader = req.get('Signature');

  if (!signatureHeader || !clientId || !requestTime) {
    return res.status(400).send('Missing Alipay signature headers');
  }

  const valid = verifyAlipaySignature({
    method: req.method,
    uri: req.originalUrl,
    clientId,
    requestTime,
    rawBody,
    signatureHeader,
    publicKey: ALIPAY_PUBLIC_KEY,
  });

  if (!valid) {
    return res.status(401).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // `result.resultStatus` is S (success) or F (failure) where a body has it.
  const status = event.result && event.result.resultStatus;
  const type = notificationType(event);

  switch (type) {
    case 'PAYMENT_RESULT':
      // Final result. Deduplicate on notifyType + paymentId; only S means paid.
      console.log('Payment result:', event.paymentRequestId, event.paymentId, status);
      // Your code: if (status === 'S') fulfill the order
      break;
    case 'PAYMENT_PENDING':
      // The buyer has paid; wait for PAYMENT_RESULT. Never overwrite a final result.
      console.log('Payment pending:', event.paymentRequestId, event.paymentId);
      break;
    case 'CAPTURE_RESULT':
      console.log('Capture result:', event.captureRequestId, event.captureId, status);
      // Your code: settle funds / reconcile the capture
      break;
    case 'REFUND_RESULT':
      console.log('Refund result:', event.refundRequestId, event.refundId, event.refundStatus);
      // Your code: update the refund record, notify the customer
      break;
    case 'AUTHCODE_CREATED':
      // Exchange event.authCode for an access token with applyToken.
      console.log('Authorization code created:', event.authState);
      break;
    case 'TOKEN_CREATED':
    case 'TOKEN_CANCELED':
      console.log('Authorization:', type, event.authState);
      // Your code: store or revoke the access token
      break;
    case 'DISPUTE_CREATED':
    case 'DEFENSE_DUE_ALERT':
    case 'DISPUTE_JUDGED':
      console.log('Dispute:', type, event.disputeId, event.paymentId);
      // Your code: alert risk/ops, gather evidence, record the judgement
      break;
    default:
      // Acknowledge types you don't handle too, or Antom keeps resending them.
      console.log('Unhandled notification type:', type);
  }

  // Acknowledge with the fixed body so Antom stops resending.
  return sendAck(res);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}${WEBHOOK_PATH}`);
  });
}
