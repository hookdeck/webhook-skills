// Generated with: snipcart-webhooks skill
// https://github.com/hookdeck/webhook-skills

/**
 * SNIPCART DOES NOT SIGN WEBHOOKS.
 *
 * There is no signature header, no HMAC, no shared webhook secret and no
 * timestamp header. Every outbound request instead carries a random token in
 * `X-Snipcart-RequestToken`, valid for one hour, which you prove
 * genuine by calling Snipcart's API with your SECRET API key:
 *
 *   GET https://app.snipcart.com/api/requestvalidation/{token}
 *   Authorization: Basic base64(SNIPCART_SECRET_API_KEY + ":")
 *
 *   200 -> genuine
 *   404 -> unknown, already validated, or expired
 *   401/403 -> your secret key is wrong, missing, or in the wrong mode
 *
 * Verification is therefore a NETWORK CALL, not a local computation. It uses
 * global fetch (Node 18+) so tests can stub it; there is no official Snipcart
 * SDK for webhook validation.
 */

export const VALIDATION_ENDPOINT = 'https://app.snipcart.com/api/requestvalidation';

/**
 * The token is attacker-controlled and gets interpolated into the URL path of a
 * request that carries the store's SECRET key. Format-check it BEFORE it
 * reaches the URL.
 *
 * encodeURIComponent is NOT enough: it leaves `.` and `..` intact and the URL
 * parser resolves them as dot segments, so a token of `..` would turn the call
 * into `GET https://app.snipcart.com/api/` — whose 200 would be misread as "the
 * token is genuine". Observed tokens are UUIDs.
 */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** Thrown when the secret key is missing. Never fail open — fail loudly. */
export class SnipcartConfigurationError extends Error {}

export type ValidationReason =
  | 'ok'
  | 'missing_token'
  | 'malformed_token'
  | 'unknown_token'
  | 'validation_unauthorized'
  | 'upstream_unreachable'
  | 'upstream_error';

export interface ValidationResult {
  valid: boolean;
  reason: ValidationReason;
  status?: number;
}

/** `Authorization: Basic base64(key + ":")` — the TRAILING COLON is required. */
export function basicAuthHeader(secretKey: string): string {
  return `Basic ${Buffer.from(`${secretKey}:`, 'utf8').toString('base64')}`;
}

/**
 * Validate an `X-Snipcart-RequestToken` against Snipcart's API.
 *
 * Fails closed on every uncertainty: malformed token, 404, 401/403, any other
 * status, a network error or a timeout all return `valid: false`.
 */
export async function validateRequestToken(
  token: string | null | undefined,
  options: { secretKey?: string; timeoutMs?: number } = {}
): Promise<ValidationResult> {
  const secretKey = options.secretKey ?? process.env.SNIPCART_SECRET_API_KEY;
  const timeoutMs =
    options.timeoutMs ?? (Number(process.env.SNIPCART_VALIDATION_TIMEOUT_MS) || 5000);

  if (!secretKey) {
    throw new SnipcartConfigurationError('SNIPCART_SECRET_API_KEY is not set');
  }

  const candidate = typeof token === 'string' ? token.trim() : '';
  if (!candidate) return { valid: false, reason: 'missing_token' };
  // Reject without ever calling Snipcart with a hostile path segment.
  if (!TOKEN_PATTERN.test(candidate)) return { valid: false, reason: 'malformed_token' };

  let response: Response;
  try {
    response = await fetch(`${VALIDATION_ENDPOINT}/${candidate}`, {
      method: 'GET',
      headers: {
        Authorization: basicAuthHeader(secretKey),
        Accept: 'application/json',
      },
      // Never forward the secret key to whatever a redirect points at, and only
      // a DIRECT 200 counts as genuine.
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // Network error or timeout. Log the failure, never the key or the token.
    console.error(
      'Snipcart request validation failed to reach the API:',
      (err as Error)?.name
    );
    return { valid: false, reason: 'upstream_unreachable' };
  }

  // Only the status matters; release the connection instead of leaving the
  // body unread.
  response.body?.cancel().catch(() => undefined);

  if (response.status === 200) return { valid: true, reason: 'ok', status: 200 };
  if (response.status === 404) {
    // Unknown, already validated, or expired (tokens live one hour).
    return { valid: false, reason: 'unknown_token', status: 404 };
  }
  if (response.status === 401 || response.status === 403) {
    // Configuration problem on our side: wrong/missing secret key, or a key
    // created in the other mode (Test keys cannot read Live data).
    console.error(
      'Snipcart rejected the validation call — check SNIPCART_SECRET_API_KEY and its mode'
    );
    return { valid: false, reason: 'validation_unauthorized', status: response.status };
  }
  // Anything else (5xx, 429 included) is NOT a success. Fail closed.
  console.error(`Snipcart request validation unavailable: HTTP ${response.status}. Failing closed.`);
  return { valid: false, reason: 'upstream_error', status: response.status };
}

/** The envelope shared by every Snipcart webhook. */
export interface SnipcartEvent {
  eventName: string;
  mode: 'Live' | 'Test';
  createdOn: string;
  content: Record<string, any>;
  /** order.status.changed / order.paymentStatus.changed add these at TOP level. */
  from?: string;
  to?: string;
  /** order.trackingNumber.changed adds these at TOP level. */
  trackingNumber?: string;
  trackingUrl?: string;
  /** Snipcart may add fields at any time — never validate strictly. */
  [key: string]: unknown;
}

export interface VerifiedRequest {
  /** Present when the request should be rejected — return it as-is. */
  errorResponse?: Response;
  event?: SnipcartEvent;
}

/**
 * Validate the token, then parse the raw body. Shared by all three routes.
 *
 * Snipcart requires Content-Type application/json AND status 200 on success,
 * so every response here is JSON.
 */
export async function verifyAndParse(request: Request): Promise<VerifiedRequest> {
  // Header lookup is case-insensitive; Snipcart has been seen sending
  // `X-Snipcart-Requesttoken` on the wire.
  const token = request.headers.get('x-snipcart-requesttoken');

  let result: ValidationResult;
  try {
    result = await validateRequestToken(token);
  } catch (err) {
    if (err instanceof SnipcartConfigurationError) {
      console.error(err.message);
      return {
        errorResponse: Response.json({ error: 'server_misconfigured' }, { status: 500 }),
      };
    }
    throw err;
  }

  if (!result.valid) {
    console.warn(`Rejected Snipcart request: ${result.reason}`);
    return {
      errorResponse: Response.json(
        { error: 'invalid_request_token', reason: result.reason },
        { status: 401 }
      ),
    };
  }

  // Parse only AFTER the token checks out.
  const raw = await request.text();
  let event: SnipcartEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return { errorResponse: Response.json({ error: 'invalid_json' }, { status: 400 }) };
  }
  if (!event || typeof event.eventName !== 'string') {
    return { errorResponse: Response.json({ error: 'missing_event_name' }, { status: 400 }) };
  }

  return { event };
}
