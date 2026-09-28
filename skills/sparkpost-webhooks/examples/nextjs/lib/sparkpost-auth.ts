// Generated with: sparkpost-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

/**
 * SparkPost EVENT WEBHOOKS ARE NOT SIGNED. There is no HMAC, no signature
 * header and no signing secret — so there is deliberately no createHmac in this
 * module's auth path. Authentication is credential based and optional, set by
 * the webhook's `auth_type` field, whose enum is exactly
 * `none` | `basic` | `oauth2`.
 *
 * (Bird's newer platform webhooks — bird.com — DO use Standard Webhooks
 * signing. That is a different product. Don't implement it here.)
 */

/**
 * Constant-time string compare via fixed-length digests.
 *
 * crypto.timingSafeEqual THROWS when its inputs differ in length, which is how a
 * naive length check turns a bad credential into a 500. Hashing both sides first
 * gives two 32-byte buffers, so length carries no information and the comparison
 * never throws.
 */
export function secureEquals(a: string, b: string): boolean {
  return crypto.timingSafeEqual(
    crypto.createHash('sha256').update(String(a), 'utf8').digest(),
    crypto.createHash('sha256').update(String(b), 'utf8').digest()
  );
}

/**
 * Verify an RFC 7617 Basic credential (`auth_type: "basic"`).
 *
 * SparkPost sends `Authorization: Basic base64(username + ":" + password)`. The
 * credentials are the ones YOUR endpoint defines — the docs stress they are "not
 * your SparkPost username and password".
 *
 * Fails CLOSED: a missing header or unconfigured username is a rejection.
 */
export function verifyBasicAuth(
  authorizationHeader: string | null | undefined,
  username: string | undefined,
  password: string | undefined
): boolean {
  if (!authorizationHeader || !username) return false;

  const parts = authorizationHeader.trim().split(/\s+/);
  if (parts.length !== 2) return false;

  // RFC 7617: the scheme token is case-insensitive.
  if (parts[0].toLowerCase() !== 'basic') return false;

  // Buffer.from(x, 'base64') never throws — it silently ignores junk — so
  // validate by looking for the colon rather than trusting the decode.
  const decoded = Buffer.from(parts[1], 'base64').toString('utf8');

  // Split on the FIRST colon only: passwords may contain colons.
  const colon = decoded.indexOf(':');
  if (colon === -1) return false;

  const user = decoded.slice(0, colon);
  const pass = decoded.slice(colon + 1);

  // `password` is NOT a required field on `auth_credentials` — an empty password
  // is legitimate, so normalise an unset env var to '' rather than treating it
  // as "not configured".
  const expectedPassword = password ?? '';

  // Compare BOTH halves, and always both, so the response time doesn't reveal
  // which half was wrong.
  const userOk = secureEquals(user, username);
  const passOk = secureEquals(pass, expectedPassword);
  return userOk && passOk;
}

// ---------------------------------------------------------------------------
// OAuth 2.0 (`auth_type: "oauth2"`)
//
// SparkPost POSTs `auth_request_details.body` (client_id / client_secret /
// grant_type) to YOUR token URL, then sends every batch with
// `Authorization: Bearer {token}`.
//
// THE IN-MEMORY STORE BELOW IS ILLUSTRATIVE. It does not survive a restart and
// does not work across serverless instances. In production point
// `auth_request_details.url` at your real authorization server (Auth0, Okta,
// Keycloak, ...) and replace validateBearerToken with JWT signature
// verification or token introspection (RFC 7662).
// ---------------------------------------------------------------------------

export const DEFAULT_TOKEN_TTL_SECONDS = 3600;

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

/** token -> expiry (epoch ms). */
const issuedTokens = new Map<string, number>();

export function issueToken(ttlSeconds: number = DEFAULT_TOKEN_TTL_SECONDS): TokenResponse {
  const token = crypto.randomBytes(32).toString('hex');
  issuedTokens.set(token, Date.now() + ttlSeconds * 1000);
  return { access_token: token, token_type: 'Bearer', expires_in: ttlSeconds };
}

/**
 * Pluggable Bearer validation. Swap this for JWT verification or introspection.
 *
 * Returning false makes the route answer 401 — which is exactly what SparkPost
 * needs: per the support-doc FAQ, "SparkPost assumes a token is expired if the
 * webhook endpoint returns a response of 400 or 401", and it then requests a new
 * token. Answering 403 would leave it stuck with a dead token.
 */
export function validateBearerToken(token: string | undefined): boolean {
  if (!token) return false;
  const expiresAt = issuedTokens.get(token);
  if (expiresAt === undefined) return false;
  if (Date.now() >= expiresAt) {
    issuedTokens.delete(token);
    return false;
  }
  return true;
}

/** Test seam: register a token with an explicit expiry. */
export function _setToken(token: string, expiresAtMs: number): void {
  issuedTokens.set(token, expiresAtMs);
}

/** Is the OAuth 2.0 demo flow configured at all? */
export function oauthConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.SPARKPOST_OAUTH_CLIENT_ID && env.SPARKPOST_OAUTH_CLIENT_SECRET);
}

// ---------------------------------------------------------------------------
// Combined auth decision
// ---------------------------------------------------------------------------

export interface AuthResult {
  ok: boolean;
  status?: number;
  reason?: string;
  mode?: 'basic' | 'oauth2' | 'legacy-token';
}

/**
 * Authenticate one batch POST.
 *
 * Accepts EITHER a valid Basic header (Mode 1) OR a valid Bearer token (Mode 2)
 * OR — only when SPARKPOST_WEBHOOK_TOKEN is set — the deprecated
 * `X-MessageSystems-Webhook-Token` header.
 *
 * Env is read per request (not at module load) so configuration can change
 * without a redeploy, and so tests can exercise the unconfigured case.
 */
export function authenticateRequest(
  headers: Headers,
  env: NodeJS.ProcessEnv = process.env
): AuthResult {
  // Headers.get() is case-insensitive, which matters: the docs spell the legacy
  // token header several ways.
  const authorization = headers.get('authorization');
  const legacyToken = headers.get('x-messagesystems-webhook-token');

  const basicConfigured = Boolean(env.SPARKPOST_WEBHOOK_USERNAME);
  const legacyConfigured = Boolean(env.SPARKPOST_WEBHOOK_TOKEN);
  const oauth = oauthConfigured(env);

  // FAIL CLOSED. `auth_type` defaults to "none", which makes "accept anything"
  // tempting — it would let anyone who learns the URL inject fake email events.
  // 500 (not 401) so an operator misconfiguration is distinguishable from a bad
  // caller in the logs.
  if (!basicConfigured && !legacyConfigured && !oauth) {
    return { ok: false, status: 500, reason: 'Webhook authentication not configured' };
  }

  if (
    basicConfigured &&
    verifyBasicAuth(authorization, env.SPARKPOST_WEBHOOK_USERNAME, env.SPARKPOST_WEBHOOK_PASSWORD)
  ) {
    return { ok: true, mode: 'basic' };
  }

  if (oauth && authorization) {
    const parts = authorization.trim().split(/\s+/);
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer' && validateBearerToken(parts[1])) {
      return { ok: true, mode: 'oauth2' };
    }
  }

  // Deprecated header-based token. Also how RELAY webhooks authenticate, since
  // relay webhooks have no Basic Auth mode (their auth_type enum is only
  // `none` | `oauth2`).
  if (legacyConfigured && legacyToken && secureEquals(legacyToken, env.SPARKPOST_WEBHOOK_TOKEN as string)) {
    return { ok: true, mode: 'legacy-token' };
  }

  return { ok: false, status: 401, reason: 'Unauthorized' };
}
