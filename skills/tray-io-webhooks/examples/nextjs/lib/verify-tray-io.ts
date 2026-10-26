// Generated with: tray-io-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * Constant-time comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a: Buffer, b: Buffer): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Tray.io requests are unsigned. The workflow's HTTP Client step adds a secret header
 * (name chosen by the user, value from a Generic Service Authentication). We compare the
 * WHOLE header value, including any "Bearer " prefix, and never strip or parse it.
 * A static credential authenticates the sender, not the body, and gives no replay protection.
 */
export function verifyTrayRequest(
  headers: Headers,
  headerName: string = process.env.TRAY_IO_WEBHOOK_HEADER || 'Authorization',
  secret: string | undefined = process.env.TRAY_IO_WEBHOOK_SECRET
): boolean {
  if (!secret) return false; // never accept when unconfigured
  const received = headers.get(headerName); // Headers lookup is case-insensitive
  if (!received) return false;
  return safeEqual(Buffer.from(received, 'latin1'), Buffer.from(secret, 'utf8'));
}
