// Generated with: n8n-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export interface N8nAuthConfig {
  N8N_WEBHOOK_SECRET?: string;
  N8N_WEBHOOK_HEADER?: string;
  N8N_BASIC_AUTH_USER?: string;
  N8N_BASIC_AUTH_PASSWORD?: string;
}

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * n8n's HTTP Request node does not sign requests. Authenticate with the shared
 * secret from the node's credential:
 *   - Header auth: <N8N_WEBHOOK_HEADER>: <secret>   (e.g. X-Webhook-Secret)
 *   - Bearer auth: Authorization: Bearer <secret>
 *   - Basic auth:  Authorization: Basic base64(user:password)  (optional)
 */
export function verifyN8nRequest(
  headers: Headers,
  config: N8nAuthConfig = process.env
): boolean {
  const secret = config.N8N_WEBHOOK_SECRET;
  const headerName = config.N8N_WEBHOOK_HEADER || 'X-Webhook-Secret';
  const authorization = headers.get('authorization') ?? '';

  if (secret) {
    const headerValue = headers.get(headerName);
    if (headerValue && safeEqual(headerValue, secret)) return true;

    const bearer = authorization.match(/^Bearer\s+(.+)$/i);
    if (bearer && safeEqual(bearer[1].trim(), secret)) return true;
  }

  const user = config.N8N_BASIC_AUTH_USER;
  const password = config.N8N_BASIC_AUTH_PASSWORD;
  const basic = authorization.match(/^Basic\s+(.+)$/i);
  if (user && password && basic) {
    const decoded = Buffer.from(basic[1].trim(), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    if (sep !== -1) {
      // Compare both parts every time (no short-circuit on the username).
      const userOk = safeEqual(decoded.slice(0, sep), user);
      const passwordOk = safeEqual(decoded.slice(sep + 1), password);
      if (userOk && passwordOk) return true;
    }
  }

  return false;
}
