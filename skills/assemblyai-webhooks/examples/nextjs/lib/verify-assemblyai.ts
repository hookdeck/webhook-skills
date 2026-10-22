// Generated with: assemblyai-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

export interface AssemblyAIAuthConfig {
  ASSEMBLYAI_WEBHOOK_AUTH_HEADER_NAME?: string;
  ASSEMBLYAI_WEBHOOK_AUTH_HEADER_VALUE?: string;
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
 * AssemblyAI does not sign webhooks. It sends the custom header you registered
 * with webhook_auth_header_name / webhook_auth_header_value, verbatim.
 * Headers.get() is case-insensitive, so the configured name can be any case.
 */
export function verifyAssemblyAIRequest(
  headers: Headers,
  config: AssemblyAIAuthConfig = process.env
): boolean {
  const name = config.ASSEMBLYAI_WEBHOOK_AUTH_HEADER_NAME;
  const expected = config.ASSEMBLYAI_WEBHOOK_AUTH_HEADER_VALUE;
  if (!name || !expected) return false; // never accept when unconfigured

  const received = headers.get(name);
  return received !== null && safeEqual(received, expected);
}
