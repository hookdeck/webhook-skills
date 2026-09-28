// Generated with: docker-hub-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

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

export interface ParsedPush {
  ok: true;
  tag: string;
  repoName: string;
  pusher: string | null;
  pushedAt: number | null;
}

export interface ParseError {
  ok: false;
  error: string;
}

export interface DhiSummaryEntry {
  digest: string;
  schemaVersion: number | null;
  categories: string[];
  previousTag: string | null;
  vulnerabilitiesFixed: number;
  packagesUpdated: number;
}

/**
 * Timing-safe string comparison that tolerates a length mismatch
 * (crypto.timingSafeEqual throws when buffer lengths differ).
 */
function safeEqual(a: string, b: string): boolean {
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
 * Returns null when unconfigured — the caller MUST fail closed.
 */
export function verifyUrlToken(
  provided: string | undefined,
  expected: string | undefined
): boolean | null {
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
 */
export function parsePush(payload: unknown): ParsedPush | ParseError {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { ok: false, error: 'payload is not a JSON object' };
  }

  const body = payload as Record<string, unknown>;
  const pushData = body.push_data as Record<string, unknown> | undefined;
  const repository = body.repository as Record<string, unknown> | undefined;

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
 */
export function summarizeDhiMetadata(dhiMetadata: unknown): DhiSummaryEntry[] {
  if (typeof dhiMetadata !== 'object' || dhiMetadata === null || Array.isArray(dhiMetadata)) {
    return [];
  }

  return Object.entries(dhiMetadata as Record<string, unknown>).map(([digest, entry]) => {
    const e = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;
    const changes = (typeof e.changes === 'object' && e.changes !== null ? e.changes : {}) as Record<
      string,
      unknown
    >;
    const previous = (
      typeof e.previous_version === 'object' && e.previous_version !== null ? e.previous_version : {}
    ) as Record<string, unknown>;

    return {
      digest,
      schemaVersion: typeof e.schema_version === 'number' ? e.schema_version : null,
      // Any of: vulnerability_fix, version_upgrade, other. An empty array means
      // the build had no changes at all.
      categories: Array.isArray(e.change_categories) ? (e.change_categories as string[]) : [],
      previousTag: typeof previous.tag === 'string' ? previous.tag : null,
      // "When a change type has no entries, its array is present but empty."
      vulnerabilitiesFixed: Array.isArray(changes.vulnerabilities_fixed)
        ? changes.vulnerabilities_fixed.length
        : 0,
      packagesUpdated: Array.isArray(changes.packages_updated) ? changes.packages_updated.length : 0,
    };
  });
}

// Cached Docker Hub API JWT.
let cachedHubJwt: { token: string; expiresAt: number } | null = null;

/**
 * Exchange a Docker Hub credential for the short-lived JWT the Hub API wants.
 *
 * A PAT/OAT is NOT itself a bearer token for hub.docker.com (per the Hub API
 * reference), and an unrecognised bearer value gets a 401 even on a public repo.
 * It is the `secret` you POST
 * to /v2/auth/token, which returns `access_token`: a short-lived JWT that IS the
 * bearer token. Cached here because it expires.
 */
export async function hubApiJwt(): Promise<string | null> {
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
 */
export async function confirmTag(repoName: string, tag: string): Promise<any | null> {
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

function allowedRepos(): string[] {
  return (process.env.DOCKER_HUB_ALLOWED_REPOS || '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
}

// POST, with a JSON body. There is no signature to verify, so there is no
// raw-body requirement here — request.json() is fine.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // 1. Fail closed when no token is configured. Treating "unconfigured" as
  //    "accept everything" would be worse than having no handler, because it
  //    looks secure.
  const tokenCheck = verifyUrlToken(token, process.env.DOCKER_HUB_WEBHOOK_TOKEN);
  if (tokenCheck === null) {
    console.error('Docker Hub webhook refused: DOCKER_HUB_WEBHOOK_TOKEN is not set');
    return NextResponse.json({ error: 'Webhook token not configured' }, { status: 500 });
  }
  if (tokenCheck === false) {
    console.error('Docker Hub webhook rejected: URL token mismatch');
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // 2. Parse the body. Invalid JSON is a 400, not a 500.
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    console.error('Docker Hub webhook rejected: invalid JSON body');
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = parsePush(payload);
  if (!parsed.ok) {
    console.error(`Docker Hub webhook rejected: ${parsed.error}`);
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // 3. Repository allowlist. Without it, anyone who learns the URL can name any
  //    repository — including one they control — and steer whatever happens
  //    next. (Returning 200 and silently ignoring is a defensible alternative;
  //    this example chooses an explicit, greppable 403.)
  const allowlist = allowedRepos();
  if (allowlist.length > 0 && !allowlist.includes(parsed.repoName)) {
    console.warn(`Docker Hub webhook rejected: ${parsed.repoName} is not in the allowlist`);
    return NextResponse.json({ error: 'Repository not allowed' }, { status: 403 });
  }

  // There is NO event type to switch on — route on the repo and tag instead.
  console.log(
    `Docker Hub push: ${parsed.repoName}:${parsed.tag} by ${parsed.pusher ?? 'unknown'}`
  );

  // Mirrored Docker Hardened Image repositories add dhi_metadata. Its presence
  // is the only payload-shape variation — and it is NOT an event type.
  const dhi = summarizeDhiMetadata((payload as Record<string, unknown>).dhi_metadata);
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

  // 4. Re-confirm before acting. Off unless DOCKER_HUB_API_TOKEN is set. In
  //    production, push this (and your real processing) onto a queue or into
  //    `after()` so the acknowledgement isn't delayed — retry policy and
  //    timeout are undocumented, so acknowledge fast and dedupe on
  //    repo_name + tag + pushed_at.
  //    TODO: replace the log with your own processing, and deploy by DIGEST
  //    rather than by tag.
  try {
    const record = await confirmTag(parsed.repoName, parsed.tag);
    if (record) {
      console.log(
        `Confirmed ${parsed.repoName}:${parsed.tag} via Docker Hub API ` +
          `(last pushed ${record.tag_last_pushed ?? 'unknown'}, digest ${record.digest ?? 'unknown'})`
      );
    }
  } catch (err) {
    console.error(`Failed to confirm tag: ${(err as Error).message}`);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
