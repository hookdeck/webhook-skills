// Generated with: dentally-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Dentally signs the raw POST body with HMAC-SHA256 keyed on the webhook
 * endpoint's secret (UTF-8) and sends a bare lowercase hex digest in
 * X-Dentally-Signature (no prefix, no timestamp).
 */
function verifyDentallySignature(rawBody, signatureHeader, secret) {
  if (!secret || typeof signatureHeader !== 'string') {
    return false;
  }

  // Validate before decoding: Buffer.from(x, 'hex') silently truncates invalid hex
  if (!/^[0-9a-f]{64}$/i.test(signatureHeader)) {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signatureHeader, 'hex'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Raw body (any Content-Type) so the signature is computed over the exact bytes sent
app.post('/webhooks/dentally', express.raw({ type: '*/*', limit: '5mb' }), (req, res) => {
  const signature = req.get('x-dentally-signature');

  if (!signature) {
    return res.status(400).send('Missing X-Dentally-Signature header');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verifyDentallySignature(rawBody, signature, process.env.DENTALLY_WEBHOOK_SECRET)) {
    console.error('Dentally webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // Payload shape: { data, event, object, user }
  switch (payload.event) {
    case 'appointment.created':
      console.log('Appointment created:', payload.data?.id);
      break;
    case 'appointment.updated':
      console.log('Appointment updated:', payload.data?.id, payload.data?.state);
      break;
    case 'appointment.deleted':
      console.log('Appointment deleted:', payload.data?.id);
      break;
    case 'patient.created':
      console.log('Patient created:', payload.data?.id);
      break;
    case 'patient.updated':
      console.log('Patient updated:', payload.data?.id);
      break;
    case 'patient.deleted':
      console.log('Patient deleted:', payload.data?.id);
      break;
    case 'payment.created':
      console.log('Payment created:', payload.data?.id);
      break;
    case 'payment.updated':
      console.log('Payment updated:', payload.data?.id);
      break;
    case 'payment.deleted':
      console.log('Payment deleted:', payload.data?.id);
      break;
    default:
      // Dentally may add events at any time: ignore unknown ones with 204
      console.log('Unhandled Dentally event:', payload.event);
      return res.status(204).end();
  }

  res.status(200).json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Dentally webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/dentally`);
  });
}

module.exports = { app, verifyDentallySignature };
