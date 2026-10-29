// Generated with: scaleway-topics-and-events-webhooks skill
// https://github.com/hookdeck/webhook-skills

import fs from 'fs';
import {
  CertFetchError,
  DEFAULT_CERT_HOSTS,
  confirmSubscription as defaultConfirm,
  createVerifier,
  isObject,
  isValidSubscribeUrl,
  type Envelope,
} from './scaleway-sns';

const list = (value: string | undefined) =>
  (value || '').split(',').map((s) => s.trim()).filter(Boolean);
const json = (body: unknown, status = 200) => Response.json(body, { status });

export interface HandlerOptions {
  trustChainPem?: string;
  allowedCertHosts?: string[];
  topicArns?: string[];
  maxAgeSeconds?: number;
  fetchCert?: (url: string) => Promise<string | null>;
  confirmSubscription?: (url: string) => Promise<boolean>;
  now?: () => number;
}

/**
 * Builds the POST handler. Options default to environment variables:
 *   SCALEWAY_SNS_TRUST_CHAIN_PATH  Scaleway's sns-trust-chain.pem, downloaded once (required)
 *   SCALEWAY_SNS_CERT_HOSTS        hosts SigningCertURL may use (default messaging.s3.fr-par.scw.cloud)
 *   SCALEWAY_SNS_TOPIC_ARNS        accept only these topics (recommended; comma-separated)
 *   SCALEWAY_SNS_MAX_AGE_SECONDS   opt-in replay window on the signed Timestamp (unset or 0 = off)
 */
export function createHandler(options: HandlerOptions = {}) {
  const trustChainPath = process.env.SCALEWAY_SNS_TRUST_CHAIN_PATH;
  const trustChainPem = options.trustChainPem ?? (trustChainPath ? fs.readFileSync(trustChainPath, 'utf8') : '');
  if (!trustChainPem) throw new Error("Set SCALEWAY_SNS_TRUST_CHAIN_PATH to Scaleway's sns-trust-chain.pem");

  const envHosts = list(process.env.SCALEWAY_SNS_CERT_HOSTS);
  const verifyMessage = createVerifier({
    trustChainPem,
    allowedCertHosts: options.allowedCertHosts ?? (envHosts.length ? envHosts : DEFAULT_CERT_HOSTS),
    fetchCert: options.fetchCert,
    now: options.now,
  });
  const topicArns = options.topicArns ?? list(process.env.SCALEWAY_SNS_TOPIC_ARNS);
  if (topicArns.length === 0) {
    console.warn(
      'SCALEWAY_SNS_TOPIC_ARNS is not set: messages from ANY Scaleway topic are accepted, and ' +
        'subscriptions to any topic are confirmed. Set it to your topic ARNs.'
    );
  }
  const maxAgeSeconds = options.maxAgeSeconds ?? Number(process.env.SCALEWAY_SNS_MAX_AGE_SECONDS || 0);
  const confirm = options.confirmSubscription ?? defaultConfirm;
  const now = options.now ?? (() => Date.now());

  return async function handle(request: Request): Promise<Response> {
    // Scaleway doesn't document the Content-Type (AWS SNS sends text/plain): read the bytes and
    // parse the JSON envelope ourselves.
    let msg: unknown;
    try {
      msg = JSON.parse(Buffer.from(await request.arrayBuffer()).toString('utf8'));
    } catch {
      return json({ error: 'Body is not a JSON envelope' }, 400);
    }
    if (!isObject(msg)) return json({ error: 'Body is not a JSON envelope' }, 400);

    // 1. Verify the signature against Scaleway's CA trust chain. Route on the signed Type, not on
    //    the x-amz-sns-message-type header (which is not signed).
    let result;
    try {
      result = await verifyMessage(msg);
    } catch (err) {
      if (err instanceof CertFetchError) {
        console.error(err.message);
        return json({ error: 'Signing certificate unavailable' }, 503);
      }
      throw err;
    }
    if (!result.ok) {
      console.error(`Scaleway message rejected: ${result.reason}`);
      return json({ error: 'Invalid signature' }, 401);
    }
    const envelope: Envelope = msg;

    // 2. A valid signature proves Scaleway sent it, not that it came from YOUR topic: anyone can
    //    subscribe your URL to their own topic. Pin the topics you expect.
    if (topicArns.length && !topicArns.includes(envelope.TopicArn as string)) {
      console.error(`Message from unexpected topic ${String(envelope.TopicArn)}`);
      return json({ error: 'Unexpected topic' }, 403);
    }

    // 3. Optional replay window (off by default: Hookdeck retries and replays resend the original
    //    envelope, Timestamp included).
    if (maxAgeSeconds > 0) {
      const sent = Date.parse(envelope.Timestamp as string);
      if (Number.isNaN(sent) || Math.abs(now() - sent) > maxAgeSeconds * 1000) {
        return json({ error: 'Message too old' }, 401);
      }
    }

    switch (envelope.Type) {
      case 'SubscriptionConfirmation': {
        // Only a receiver Scaleway calls directly sees this: Hookdeck's Scaleway source confirms the
        // subscription itself and does not forward the confirmation.
        if (!isValidSubscribeUrl(envelope)) return json({ error: 'Unexpected SubscribeURL' }, 400);
        let confirmed = false;
        try {
          confirmed = await confirm(envelope.SubscribeURL as string);
        } catch (err) {
          console.error(`Confirming the subscription failed: ${(err as Error).message}`);
        }
        if (!confirmed) return json({ error: 'Subscription confirmation failed' }, 502);
        console.log(`Confirmed subscription to ${envelope.TopicArn}`);
        return json({ confirmed: true });
      }

      case 'Notification': {
        // Standard topics deliver at least once: dedupe on MessageId.
        // Message is whatever the publisher sent (often JSON, but any string); treat it as untrusted.
        let payload: unknown = envelope.Message;
        try {
          payload = JSON.parse(envelope.Message as string);
        } catch {
          // plain-text message
        }
        const kind = isObject(payload) ? 'JSON object' : typeof payload;
        console.log(
          `Notification ${envelope.MessageId} from ${envelope.TopicArn}` +
            (typeof envelope.Subject === 'string' ? ` (subject: ${envelope.Subject})` : '') +
            `: ${kind}`
        );
        // TODO: process the message idempotently (keyed on envelope.MessageId)
        return json({ received: true });
      }

      case 'UnsubscribeConfirmation':
        // An SNS message type; Scaleway's docs don't say whether it sends one.
        console.log(`Unsubscribed from ${envelope.TopicArn}`);
        return json({ received: true });

      default:
        // Unreachable: verifyMessage only accepts the three types above
        return json({ error: 'Unknown message type' }, 400);
    }
  };
}
