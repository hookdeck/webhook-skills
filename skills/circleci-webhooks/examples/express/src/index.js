// Generated with: circleci-webhooks skill
// https://github.com/hookdeck/webhook-skills
//
// CircleCI OUTBOUND webhooks (CircleCI -> your endpoint), sent when a workflow
// or job reaches a terminal state.
//
//   header  : circleci-signature
//   format  : comma-separated `<version>=<signature>` pairs, e.g. `v1=<hex>`
//   version : v1 only. "Only check the latest signature type to prevent
//             downgrade attacks." No v1 entry -> reject.
//   algo    : HMAC-SHA256, LOWERCASE HEX (64 chars), not base64
//   signs   : the RAW request body bytes ONLY -- no timestamp, no id, no prefix
//   key     : the webhook's "Secret token" (API field `signing-secret`), used
//             as UTF-8 bytes DIRECTLY. No prefix to strip, no base64 decode.
//
// There is NO timestamp header and NO replay window in CircleCI's scheme.
// Replay protection is deduplication on the payload `id`.
//
// CircleCI publishes no SDK for webhook verification -- manual HMAC is the only
// path.
//
// Not Circle (circle.com, USDC/Circle Mint, ECDSA X-Circle-Signature) --
// unrelated company. Not CircleCI *custom* webhooks, which are inbound pipeline
// triggers going the other direction.

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a CircleCI outbound webhook signature.
 *
 * @param {Buffer|string} rawBody - RAW, unparsed request body.
 * @param {string|undefined} signatureHeader - The `circleci-signature` header.
 * @param {string|undefined} secret - CIRCLECI_WEBHOOK_SECRET (the Secret token).
 * @returns {boolean}
 */
function verifyCircleCISignature(rawBody, signatureHeader, secret) {
  // Fail closed. A missing header or an unconfigured secret is a rejection,
  // never a free pass -- CircleCI's Secret token is optional in the web UI, so
  // unsigned deliveries are a real possibility and must not be accepted.
  if (!signatureHeader || !secret) return false;

  // The header is a COMMA-separated list of `<version>=<signature>` pairs.
  // Split each pair on the FIRST '=' so a value containing '=' is never
  // truncated, and take the entry whose key is exactly `v1`.
  let v1 = null;
  for (const pair of String(signatureHeader).split(',')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    if (pair.slice(0, eq).trim() === 'v1') {
      v1 = pair.slice(eq + 1).trim();
      break;
    }
  }

  // No v1 entry -> REJECT. v2/v3 do not exist yet and their algorithm is
  // unknown; verifying one with SHA-256, or accepting it as a fallback, is
  // precisely the downgrade attack the docs warn about.
  if (!v1) return false;

  // Sign the RAW BODY BYTES ONLY. The secret string's UTF-8 bytes are the key.
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  // Length guard BEFORE timingSafeEqual -- it throws on mismatched lengths, and
  // an uncaught throw becomes a 500 that CircleCI retries.
  const a = Buffer.from(v1, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Read branch / commit info from a pipeline, handling BOTH payload shapes.
 *
 * `pipeline.vcs` is present for GitHub OAuth and Bitbucket Cloud pipelines.
 * GitLab and GitHub App pipelines carry `pipeline.trigger_parameters` instead
 * and have NO `vcs` at all -- so `pipeline.vcs.branch` throws on those.
 *
 * @param {object} pipeline
 */
function extractVcsInfo(pipeline = {}) {
  if (pipeline.vcs) {
    return {
      source: 'vcs',
      provider: pipeline.vcs.provider_name ?? null,
      branch: pipeline.vcs.branch ?? null,
      tag: pipeline.vcs.tag ?? null,
      revision: pipeline.vcs.revision ?? null,
      subject: pipeline.vcs.commit?.subject ?? null,
      authorName: pipeline.vcs.commit?.author?.name ?? null,
      repositoryUrl: pipeline.vcs.target_repository_url ?? pipeline.vcs.origin_repository_url ?? null,
    };
  }

  // GitLab / GitHub App pipelines. Field names below are the ones in CircleCI's
  // documented GitLab sample: `git` carries {branch, tag, ref, checkout_sha,
  // checkout_url}; commit title/author/web URL live in the `gitlab` map (the
  // reference says that map is present for GitLab AND GitHub App triggers).
  // `git.tag` is "" (not absent) on branch builds, hence `||`.
  const params = pipeline.trigger_parameters ?? {};
  const git = params.git ?? {};
  const gitlab = params.gitlab ?? {};
  return {
    source: 'trigger_parameters',
    provider: params.circleci?.trigger_type ?? null,
    branch: git.branch || gitlab.branch || null,
    tag: git.tag || null,
    revision: git.checkout_sha || gitlab.commit_sha || gitlab.checkout_sha || null,
    subject: gitlab.commit_title || null,
    authorName: gitlab.commit_author_name || null,
    repositoryUrl: gitlab.web_url || git.checkout_url || null,
  };
}

// --- Deduplication ---------------------------------------------------------
//
// CircleCI: "Webhook requests may be duplicated." There is NO delivery-id
// header, so the payload's top-level `id` is the dedupe key. The retry schedule
// is undocumented, so retain generously.
//
// In production use Redis/Postgres with a TTL, not an in-memory Set.
const processedEventIds = new Set();

function alreadyProcessed(eventId) {
  if (!eventId) return false;
  if (processedEventIds.has(eventId)) return true;
  processedEventIds.add(eventId);
  return false;
}

/**
 * Dispatch a verified event. Runs AFTER the 200 response -- CircleCI's timeout
 * is 10 seconds, so never do real work inline.
 */
function handleEvent(eventType, payload) {
  const vcs = extractVcsInfo(payload.pipeline);

  switch (eventType) {
    case 'workflow-completed': {
      // workflow.status: success | failed | error | canceled | unauthorized
      const { name, status, url } = payload.workflow ?? {};
      console.log(
        `[workflow-completed] ${payload.project?.slug} "${name}" -> ${status} ` +
          `(pipeline #${payload.pipeline?.number}, branch ${vcs.branch ?? vcs.tag ?? 'n/a'})`
      );
      console.log(`  ${url}`);

      if (status === 'success') {
        // TODO: promote the build, deploy, mark the commit green.
      } else if (status === 'failed' || status === 'error') {
        // TODO: alert the team, open an incident, record a DORA failure.
      }
      break;
    }

    case 'job-completed': {
      // job.status: success | failed | canceled | unauthorized (NO "error").
      // NOTE: payload.workflow has NO `status` on job-level webhooks.
      const { name, status, started_at: startedAt, stopped_at: stoppedAt } = payload.job ?? {};
      const durationMs =
        startedAt && stoppedAt ? new Date(stoppedAt) - new Date(startedAt) : null;
      console.log(
        `[job-completed] ${payload.project?.slug} job "${name}" -> ${status}` +
          (durationMs !== null ? ` in ${Math.round(durationMs / 1000)}s` : '')
      );

      // TODO: record job timings, track flaky tests, ingest artifacts.
      break;
    }

    case 'ping':
      // COMMUNITY-OBSERVED, not documented. The UI's "Test Ping Event" button
      // sends a normal signed POST; the docs say only that it has "an
      // abbreviated payload for ease of testing" and never publish the `type`.
      // Acknowledge it and read nothing beyond `id`/`type`.
      console.log(`[ping] webhook "${payload.webhook?.name}" reachable`);
      break;

    default:
      // Payloads are "open maps" -- new fields (and conceivably new types) may
      // appear without notice. Log and move on; never throw.
      console.log(`[unhandled] circleci-event-type: ${eventType}`);
  }
}

// CircleCI webhook endpoint.
//
// express.raw() gives the handler the exact bytes CircleCI sent. NEVER mount
// express.json() ahead of this route -- a parsed or re-serialized body breaks
// the digest.
app.post('/webhooks/circleci', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['circleci-signature'];
  const eventType = req.headers['circleci-event-type'];
  const secret = process.env.CIRCLECI_WEBHOOK_SECRET;

  // Fail closed on misconfiguration. 500 (not 200) so CircleCI retries once the
  // secret is set, rather than silently swallowing real events.
  if (!secret) {
    console.error('CIRCLECI_WEBHOOK_SECRET is not set - refusing to accept unverified webhooks');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  if (!signature) {
    // The Secret token is optional in CircleCI's UI, so a webhook can be
    // configured to send unsigned requests. Reject them rather than trusting.
    console.error('Missing circleci-signature header');
    return res.status(400).json({ error: 'Missing signature header' });
  }

  // 1. VERIFY against the raw bytes, before anything is parsed.
  if (!verifyCircleCISignature(req.body, signature, secret)) {
    console.error('CircleCI webhook signature verification failed');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // 2. PARSE -- only after verification passes.
  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // 3. DEDUPE on the payload `id`. No delivery-id header exists.
  if (alreadyProcessed(payload.id)) {
    console.log(`Duplicate delivery ${payload.id} ignored`);
    return res.status(200).json({ received: true, duplicate: true });
  }

  // 4. RESPOND FAST, then work. CircleCI's timeout is 10 seconds.
  res.status(200).json({ received: true });

  setImmediate(() => {
    try {
      // Prefer the header, fall back to the body's `type` -- they carry the
      // same value.
      handleEvent(eventType ?? payload.type, payload);
    } catch (err) {
      console.error('Error handling CircleCI webhook:', err);
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = { app, verifyCircleCISignature, extractVcsInfo, handleEvent };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/circleci`);
  });
}
