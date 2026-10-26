// Generated with: azure-devops-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time comparison of two Buffers. Hashing both sides first gives
 * equal-length digests, so timingSafeEqual never throws and length isn't leaked.
 */
function safeEqual(a: Buffer, b: Buffer): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Parse "Authorization: Basic base64(username:password)". The scheme is
 * case-insensitive and the credentials are split on the FIRST colon (the
 * password may contain colons). Returns null if missing or malformed.
 */
export function parseBasicAuth(
  header: string | null | undefined
): { username: Buffer; password: Buffer } | null {
  if (typeof header !== 'string') return null;
  const match = /^basic +([A-Za-z0-9+/]+={0,2})\s*$/i.exec(header);
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64');
  const colon = decoded.indexOf(0x3a);
  if (colon < 0) return null;
  return { username: decoded.subarray(0, colon), password: decoded.subarray(colon + 1) };
}

/**
 * Azure DevOps does not sign Web Hooks payloads. The subscription's basic
 * authentication credentials arrive on every request; they authenticate the
 * sender, not the body, and give no replay protection. Both fields are compared
 * before deciding, so there is no short-circuit.
 */
export function verifyAzureDevOpsRequest(
  headers: Headers,
  username: string | undefined = process.env.AZURE_DEVOPS_WEBHOOK_USERNAME,
  password: string | undefined = process.env.AZURE_DEVOPS_WEBHOOK_PASSWORD
): boolean {
  if (!username || !password) return false; // never accept when unconfigured
  const creds = parseBasicAuth(headers.get('authorization'));
  if (!creds) return false;
  const userOk = safeEqual(creds.username, Buffer.from(username, 'utf8'));
  const passOk = safeEqual(creds.password, Buffer.from(password, 'utf8'));
  return userOk && passOk;
}
