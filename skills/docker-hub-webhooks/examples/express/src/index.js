// Generated with: docker-hub-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

// Docker Hub repository webhooks are UNSIGNED.
//
//   1. THERE IS NO SIGNATURE VERIFICATION. No signature header, no shared
//      secret, no HMAC, no timestamp, no auth option. The create-webhook form
//      takes exactly two inputs: a name and a destination URL. Do NOT write an
//      HMAC verifier or check for an X-Docker-Signature / X-Hub-Signature
//      header — no such header is sent. Docker also publishes no source-IP
//      allowlist, so there is nothing to allowlist either.
//   2. THERE IS NO EVENT TYPE. Docker Hub webhooks have one trigger (a push)
//      and the payload carries no `event` / `type` / `action` field and no
//      X-...-Event header. Never `switch (payload.event)`. Route on
//      repository.repo_name + push_data.tag, and branch on the presence of
//      dhi_metadata.
//
// What replaces verification: a long random token in the URL you register
// (compared in constant time, failing closed when unset), a repository
// allowlist, and re-confirming the push against the Docker Hub API before
// doing anything consequential.

// REQUIRED. The token you put in the registered URL, e.g.
// https://example.com/webhooks/docker-hub/<token>. NOT a Docker Hub signature.
// Unset => every delivery is rejected with 500 (fail closed).
//
// Read from the environment per request rather than captured at module load, so
// the fail-closed path stays testable and a restart isn't needed after a
// rotation.
const webhookToken = () => process.env.DOCKER_HUB_WEBHOOK_TOKEN || '';
if (!webhookToken()) {
  console.warn(
    'DOCKER_HUB_WEBHOOK_TOKEN is not set — the webhook route will fail closed ' +
      'with 500. Docker Hub provides no signing secret, so this token (which ' +
      'you place in the registered URL yourself) is the only authentication ' +
      'available. Generate one with: openssl rand -hex 32'
  );
}

// OPTIONAL. Comma-separated repository.repo_name allowlist. When set, a push
// for any other repo is rejected with 403.
const allowedRepos = () =>
  (process.env.DOCKER_HUB_ALLOWED_REPOS || '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

const app = express();

/**
 * Timing-safe string comparison that tolerates a length mismatch
 * (crypto.timingSafeEqual throws when buffer lengths differ).
 */
function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Check the secret token taken from the webhook URL path.
 *
 * This is NOT a Docker Hub signature — Docker Hub signs nothing. It is your own
 * secret, placed in the URL you registered and echoed straight back to you, so
 * it is visible to Docker Hub and to anything that logs request paths. A path
 * segment and a `?token=` query param are equally visible to Docker Hub; the
 * path segment is a style choice, not a security gain.
 *
 * @param {unknown} provided - the token from the request path
 * @param {string} expected - DOCKER_HUB_WEBHOOK_TOKEN
 * @returns {boolean|null} null when unconfigured — the caller MUST fail closed
 */
function verifyUrlToken(provided, expected) {
  if (!expected) return null; // unset => fail closed, never silently accept
  if (typeof provided !== 'string') return false;
  return safeEqual(provided, expected);
}

/**
 * Minimal, defensive shape validation.
 *
 * Only `push_data.tag` and `repository.repo_name` are required — every other
 * documented field may be absent or null, and the documented example payload is
 * from 2014 (it still carries `dockerfile` / `is_trusted` from the retired
 * Automated Builds era). Unknown fields are ignored, not asserted on.
 *
 * @param {unknown} payload
 * @returns {{ ok: true, tag: string, repoName: string, pusher: string|null, pushedAt: number|null }
 *          | { ok: false, error: string }}
 */
function parsePush(payload) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { ok: false, error: 'payload is not a JSON object' };
  }

  const pushData = payload.push_data;
  const repository = payload.repository;

  if (typeof pushData !== 'object' || pushData === null) {
    return { ok: false, error: 'missing push_data' };
  }
  if (typeof repository !== 'object' || repository === null) {
    return { ok: false, error: 'missing repository' };
  }
  if (typeof pushData.tag !== 'string' || pushData.tag === '') {
    return { ok: false, error: 'missing or invalid push_data.tag' };
  }
  if (typeof repository.repo_name !== 'string' || repository.repo_name === '') {
    return { ok: false, error: 'missing or invalid repository.repo_name' };
  }

  return {
    ok: true,
    tag: pushData.tag,
    repoName: repository.repo_name,
    pusher: typeof pushData.pusher === 'string' ? pushData.pusher : null,
    // UNIX SECONDS (inferred from the 10-digit documented example; the docs
    // never state the unit). Do not feed this to a millisecond-based API.
    pushedAt: typeof pushData.pushed_at === 'number' ? pushData.pushed_at : null,
  };
}

/**
 * Summarize the dhi_metadata object, present only on pushes to a mirrored
 * Docker Hardened Image repository.
 *
 * It is a MAP KEYED BY ARCHITECTURE-SPECIFIC MANIFEST DIGEST, with one entry
 * per platform that has a changelog — match the digest key against the platform
 * you care about instead of assuming a single entry.
 *
 * Note: Docker builds this from a signed changelog attestation at delivery
 * time, but the POST carrying it is still unsigned and the embedded copy is not
 * independently verifiable.
 *
 * @param {unknown} dhiMetadata - payload.dhi_metadata
 * @returns {Array<{digest: string, schemaVersion: number|null, categories: string[],
 *                  previousTag: string|null, vulnerabilitiesFixed: number,
 *                  packagesUpdated: number}>}
 */
function summarizeDhiMetadata(dhiMetadata) {
  if (typeof dhiMetadata !== 'object' || dhiMetadata === null || Array.isArray(dhiMetadata)) {
    return [];
  }

  return Object.entries(dhiMetadata).map(([digest, entry]) => {
    const e = typeof entry === 'object' && entry !== null ? entry : {};
    const changes = typeof e.changes === 'object' && e.changes !== null ? e.changes : {};
    const previous =
      typeof e.previous_version === 'object' && e.previous_version !== null
        ? e.previous_version
        : {};

    return {
      digest,
      schemaVersion: typeof e.schema_version === 'number' ? e.schema_version : null,
      // Any of: vulnerability_fix, version_upgrade, other. An empty array means
      // the build had no changes at all.
      categories: Array.isArray(e.change_categories) ? e.change_categories : [],
      previousTag: typeof previous.tag === 'string' ? previous.tag : null,
      // "When a change type has no entries, its array is present but empty."
      vulnerabilitiesFixed: Array.isArray(changes.vulnerabilities_fixed)
        ? changes.vulnerabilities_fixed.length
        : 0,
      packagesUpdated: Array.isArray(changes.packages_updated)
        ? changes.packages_updated.length
        : 0,
    };
  });
}

// Cached Docker Hub API JWT: { token: string, expiresAt: number }
let cachedHubJwt = null;

/**
 * Exchange a Docker Hub credential for the short-lived JWT the Hub API wants.
 *
 * A PAT/OAT is NOT itself a bearer token for hub.docker.com (per the Hub API
 * reference), and an unrecognised bearer value gets a 401 even on a public repo.
 * It is the `secret` you POST
 * to /v2/auth/token, which returns `access_token`: a short-lived JWT that IS the
 * bearer token. Cached here because it expires.
 *
 * @returns {Promise<string|null>} the JWT, or null when unconfigured
 */
async function hubApiJwt() {
  const identifier = process.env.DOCKER_HUB_API_IDENTIFIER;
  const secret = process.env.DOCKER_HUB_API_TOKEN;
  if (!identifier || !secret) return null;

  if (cachedHubJwt && cachedHubJwt.expiresAt > Date.now()) return cachedHubJwt.token;

  const response = await fetch('https://hub.docker.com/v2/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, secret }),
  });
  if (!response.ok) return null;

  const body = await response.json();
  if (typeof body.access_token !== 'string') return null;

  // The JWT is short-lived; re-exchange well before any plausible expiry.
  cachedHubJwt = { token: body.access_token, expiresAt: Date.now() + 5 * 60 * 1000 };
  return cachedHubJwt.token;
}

/**
 * OPTIONAL and ILLUSTRATIVE: re-confirm the pushed tag against Docker Hub.
 *
 * The webhook is unsigned, so the payload is an untrusted HINT, not a fact.
 * Before deploying, promoting or pulling, check the tag against the API
 * (operationId GetRepositoryTag) and prefer pulling by digest over by tag.
 *
 * Disabled unless DOCKER_HUB_API_TOKEN is set — the tests never hit the network.
 *
 * @param {string} repoName - "namespace/name"
 * @param {string} tag
 * @returns {Promise<object|null>} the tag record, or null when unconfigured
 */
async function confirmTag(repoName, tag) {
  if (!process.env.DOCKER_HUB_API_TOKEN) return null;

  const [namespace, repository] = repoName.split('/');
  if (!namespace || !repository) return null;

  const url =
    `https://hub.docker.com/v2/namespaces/${encodeURIComponent(namespace)}` +
    `/repositories/${encodeURIComponent(repository)}/tags/${encodeURIComponent(tag)}`;

  // GetRepositoryTag needs no auth at all for a PUBLIC repository, so send the
  // header only when the credential exchange produced a JWT. Never send the
  // raw PAT/OAT as the bearer: that turns a working call into a 401.
  const jwt = await hubApiJwt();
  const response = await fetch(url, {
    headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
  });

  if (!response.ok) return null;
  return response.json();
}

// POST, with a JSON body. There is no signature to verify, so there is no
// raw-body requirement here — express.json() is fine.
app.post('/webhooks/docker-hub/:token', express.json(), (req, res) => {
  // 1. Fail closed when no token is configured. Treating "unconfigured" as
  //    "accept everything" would be worse than having no handler, because it
  //    looks secure.
  const tokenCheck = verifyUrlToken(req.params.token, webhookToken());
  if (tokenCheck === null) {
    console.error('Docker Hub webhook refused: DOCKER_HUB_WEBHOOK_TOKEN is not set');
    return res.status(500).json({ error: 'Webhook token not configured' });
  }
  if (tokenCheck === false) {
    console.error('Docker Hub webhook rejected: URL token mismatch');
    return res.status(401).json({ error: 'Invalid token' });
  }

  // 2. Validate the shape. express.json() has already rejected invalid JSON
  //    with 400 via the error handler below.
  const parsed = parsePush(req.body);
  if (!parsed.ok) {
    console.error(`Docker Hub webhook rejected: ${parsed.error}`);
    return res.status(400).json({ error: parsed.error });
  }

  // 3. Repository allowlist. Without it, anyone who learns the URL can name any
  //    repository — including one they control — and steer whatever happens
  //    next. (Returning 200 and silently ignoring is a defensible alternative;
  //    this example chooses an explicit, greppable 403.)
  const allowlist = allowedRepos();
  if (allowlist.length > 0 && !allowlist.includes(parsed.repoName)) {
    console.warn(`Docker Hub webhook rejected: ${parsed.repoName} is not in the allowlist`);
    return res.status(403).json({ error: 'Repository not allowed' });
  }

  // There is NO event type to switch on — route on the repo and tag instead.
  console.log(
    `Docker Hub push: ${parsed.repoName}:${parsed.tag} by ${parsed.pusher ?? 'unknown'}`
  );

  // Mirrored Docker Hardened Image repositories add dhi_metadata. Its presence
  // is the only payload-shape variation — and it is NOT an event type.
  const dhi = summarizeDhiMetadata(req.body.dhi_metadata);
  for (const entry of dhi) {
    console.log(
      `  DHI ${entry.digest}: [${entry.categories.join(', ') || 'no changes'}] ` +
        `${entry.vulnerabilitiesFixed} CVE(s) fixed, ` +
        `${entry.packagesUpdated} package(s) updated, ` +
        `previous tag ${entry.previousTag ?? 'unknown'}`
    );
  }

  // `callback_url` is a LEGACY field and is no longer supported. It still
  // appears in the documented example payload, so tolerate it — but never POST
  // to it. Webhook chains are gone, and the URL was reported to
  // 404 on GET and POST (docker/docs#23955).

  // 4. Acknowledge fast. Retry policy and timeout are undocumented, so do the
  //    work asynchronously and handle it idempotently (dedupe on
  //    repo_name + tag + pushed_at).
  res.status(200).json({ received: true });

  // 5. Then re-confirm before acting. Off unless DOCKER_HUB_API_TOKEN is set.
  //    TODO: replace the log with your own processing, and deploy by DIGEST
  //    rather than by tag.
  confirmTag(parsed.repoName, parsed.tag)
    .then((record) => {
      if (record) {
        console.log(
          `Confirmed ${parsed.repoName}:${parsed.tag} via Docker Hub API ` +
            `(last pushed ${record.tag_last_pushed ?? 'unknown'}, digest ${record.digest ?? 'unknown'})`
        );
      }
    })
    .catch((err) => console.error(`Failed to confirm tag: ${err.message}`));
});

// express.json() throws on a malformed body — turn that into a 400 rather than
// a 500. Must be registered after the route.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    console.error('Docker Hub webhook rejected: invalid JSON body');
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  return next(err);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app and helpers for testing
module.exports = {
  app,
  verifyUrlToken,
  parsePush,
  summarizeDhiMetadata,
  confirmTag,
};

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/docker-hub/<token>`);
  });
}
