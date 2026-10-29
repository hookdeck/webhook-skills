// Generated with: scaleway-topics-and-events-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const fs = require('fs');
require('dotenv').config({ quiet: true });

const {
  CertFetchError,
  DEFAULT_CERT_HOSTS,
  confirmSubscription,
  createVerifier,
  isValidSubscribeUrl,
} = require('./scaleway-sns');

const PORT = process.env.PORT || 3000;

const list = (value) => (value || '').split(',').map((s) => s.trim()).filter(Boolean);
const isObject = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * Builds the app. Options default to environment variables:
 *   SCALEWAY_SNS_TRUST_CHAIN_PATH  Scaleway's sns-trust-chain.pem, downloaded once (required)
 *   SCALEWAY_SNS_CERT_HOSTS        hosts SigningCertURL may use (default messaging.s3.fr-par.scw.cloud)
 *   SCALEWAY_SNS_TOPIC_ARNS        accept only these topics (recommended; comma-separated)
 *   SCALEWAY_SNS_MAX_AGE_SECONDS   opt-in replay window on the signed Timestamp (unset or 0 = off)
 */
function createApp(options = {}) {
  const trustChainPem =
    options.trustChainPem ??
    (process.env.SCALEWAY_SNS_TRUST_CHAIN_PATH ? fs.readFileSync(process.env.SCALEWAY_SNS_TRUST_CHAIN_PATH, 'utf8') : '');
  if (!trustChainPem) throw new Error('Set SCALEWAY_SNS_TRUST_CHAIN_PATH to Scaleway\'s sns-trust-chain.pem');

  const verifyMessage = createVerifier({
    trustChainPem,
    allowedCertHosts: options.allowedCertHosts ?? (list(process.env.SCALEWAY_SNS_CERT_HOSTS).length ? list(process.env.SCALEWAY_SNS_CERT_HOSTS) : DEFAULT_CERT_HOSTS),
    fetchCert: options.fetchCert,
    now: options.now,
  });
  const topicArns = options.topicArns ?? list(process.env.SCALEWAY_SNS_TOPIC_ARNS);
  const maxAgeSeconds = options.maxAgeSeconds ?? Number(process.env.SCALEWAY_SNS_MAX_AGE_SECONDS || 0);
  const confirm = options.confirmSubscription ?? confirmSubscription;
  const now = options.now ?? (() => Date.now());

  const app = express();

  // express.raw({ type: '*/*' }): Scaleway doesn't document the Content-Type (AWS SNS sends
  // text/plain), so take the bytes as they are and parse the JSON envelope ourselves.
  app.post('/webhooks/scaleway-topics-and-events', express.raw({ type: '*/*' }), async (req, res) => {
    let msg;
    try {
      msg = JSON.parse((Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)).toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Body is not a JSON envelope' });
    }
    if (!isObject(msg)) return res.status(400).json({ error: 'Body is not a JSON envelope' });

    // 1. Verify the signature against Scaleway's CA trust chain. Route on the signed Type, not on
    //    the x-amz-sns-message-type header (which is not signed).
    let result;
    try {
      result = await verifyMessage(msg);
    } catch (err) {
      if (err instanceof CertFetchError) {
        console.error(err.message);
        return res.status(503).json({ error: 'Signing certificate unavailable' });
      }
      throw err;
    }
    if (!result.ok) {
      console.error(`Scaleway message rejected: ${result.reason}`);
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // 2. A valid signature proves Scaleway sent it, not that it came from YOUR topic: anyone can
    //    subscribe your URL to their own topic. Pin the topics you expect.
    if (topicArns.length && !topicArns.includes(msg.TopicArn)) {
      console.error(`Message from unexpected topic ${msg.TopicArn}`);
      return res.status(403).json({ error: 'Unexpected topic' });
    }

    // 3. Optional replay window (off by default: Hookdeck retries and replays resend the original
    //    envelope, Timestamp included).
    if (maxAgeSeconds > 0) {
      const sent = Date.parse(msg.Timestamp);
      if (Number.isNaN(sent) || Math.abs(now() - sent) > maxAgeSeconds * 1000) {
        return res.status(401).json({ error: 'Message too old' });
      }
    }

    switch (msg.Type) {
      case 'SubscriptionConfirmation': {
        // Only a receiver Scaleway calls directly sees this: Hookdeck's Scaleway source confirms the
        // subscription itself and does not forward the confirmation.
        if (!isValidSubscribeUrl(msg)) {
          return res.status(400).json({ error: 'Unexpected SubscribeURL' });
        }
        let confirmed = false;
        try {
          confirmed = await confirm(msg.SubscribeURL);
        } catch (err) {
          console.error(`Confirming the subscription failed: ${err.message}`);
        }
        if (!confirmed) return res.status(502).json({ error: 'Subscription confirmation failed' });
        console.log(`Confirmed subscription to ${msg.TopicArn}`);
        return res.status(200).json({ confirmed: true });
      }

      case 'Notification': {
        // Standard topics deliver at least once: dedupe on MessageId.
        // Message is whatever the publisher sent (often JSON, but any string); treat it as untrusted.
        let payload = msg.Message;
        try {
          payload = JSON.parse(msg.Message);
        } catch {
          // plain-text message
        }
        const kind = isObject(payload) ? 'JSON object' : typeof payload;
        console.log(
          `Notification ${msg.MessageId} from ${msg.TopicArn}` +
            (typeof msg.Subject === 'string' ? ` (subject: ${msg.Subject})` : '') +
            `: ${kind}`
        );
        // TODO: process the message idempotently (keyed on msg.MessageId)
        return res.status(200).json({ received: true });
      }

      case 'UnsubscribeConfirmation':
        // An SNS message type; Scaleway's docs don't say whether it sends one.
        console.log(`Unsubscribed from ${msg.TopicArn}`);
        return res.status(200).json({ received: true });

      default:
        // Unreachable: verifyMessage only accepts the three types above
        return res.status(400).json({ error: 'Unknown message type' });
    }
  });

  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  return app;
}

if (require.main === module) {
  createApp().listen(PORT, () => {
    console.log(`Scaleway Topics and Events webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { createApp };
