require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify an Expo EAS webhook signature.
 *
 * EAS sends expo-signature = "sha1=" + hex(HMAC-SHA1(secret, rawBody)).
 *
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string|undefined} signatureHeader - expo-signature header value
 * @param {string|undefined} secret - Secret passed to `eas webhook:create --secret`
 * @returns {boolean} - Whether the signature is valid
 */
function verifyExpoSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected =
    'sha1=' + crypto.createHmac('sha1', secret).update(rawBody).digest('hex');

  // Timing-safe comparison; throws on length mismatch
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * EAS payloads have no event-type field: BUILD vs SUBMIT is set on the webhook
 * itself, so tell them apart by their fields.
 */
function classifyPayload(payload) {
  if (payload.submissionDetailsPageUrl || payload.submissionInfo || payload.archiveUrl) {
    return 'SUBMIT';
  }
  if (payload.buildDetailsPageUrl || payload.artifacts || payload.metadata) {
    return 'BUILD';
  }
  return 'UNKNOWN';
}

function handleBuild(build) {
  switch (build.status) {
    case 'finished':
      console.log(`Build ${build.id} (${build.platform}) finished: ${build.artifacts?.buildUrl}`);
      // TODO: Download the artifact, notify the team, start QA
      break;
    case 'errored':
      console.log(`Build ${build.id} (${build.platform}) errored: ${build.error?.message}`);
      // TODO: Alert the on-call channel
      break;
    case 'canceled':
      console.log(`Build ${build.id} (${build.platform}) canceled`);
      break;
    default:
      console.log(`Unhandled build status: ${build.status}`);
  }
}

function handleSubmit(submission) {
  switch (submission.status) {
    case 'finished':
      console.log(`Submission ${submission.id} (${submission.platform}) finished`);
      // TODO: Announce the release
      break;
    case 'errored':
      console.log(
        `Submission ${submission.id} (${submission.platform}) errored: ${submission.submissionInfo?.error?.message}`
      );
      // TODO: Alert the release owner
      break;
    case 'canceled':
      console.log(`Submission ${submission.id} (${submission.platform}) canceled`);
      break;
    default:
      console.log(`Unhandled submission status: ${submission.status}`);
  }
}

// Expo webhook endpoint - raw body for signature verification, any content type
app.post('/webhooks/expo',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const secret = process.env.EXPO_WEBHOOK_SECRET;
    if (!secret) {
      console.error('EXPO_WEBHOOK_SECRET is not configured');
      return res.status(500).send('Webhook secret not configured');
    }

    const signature = req.headers['expo-signature'];
    if (!signature) {
      return res.status(400).send('Missing expo-signature header');
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!verifyExpoSignature(rawBody, signature, secret)) {
      console.error('Expo webhook signature verification failed');
      return res.status(400).send('Invalid signature');
    }

    // Parse only after verification
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON');
    }

    // Use payload.id + payload.status to de-duplicate retried deliveries
    const type = classifyPayload(payload);
    if (type === 'BUILD') {
      handleBuild(payload);
    } else if (type === 'SUBMIT') {
      handleSubmit(payload);
    } else {
      console.log('Unrecognized Expo payload');
    }

    res.status(200).json({ received: true, type });
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = { app, verifyExpoSignature, classifyPayload };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/expo`);
  });
}
