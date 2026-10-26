// Generated with: celcoin-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Celcoin's docs don't name the HTTP method, so accept all the usual ones.
export const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

// Constant-time string compare. Hashing first gives equal-length buffers, so
// timingSafeEqual never throws and the credential's length isn't leaked.
export function safeEqual(received: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(received, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

// Strict base64 decode: base64 alphabet only, correct padding, and the value must
// re-encode to the same string, so valid credentials followed by junk fail.
function decodeStrictBase64(value: string): string | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return null;
  const buf = Buffer.from(value, 'base64');
  if (buf.toString('base64') !== value) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return null;
  }
}

// Celcoin does not sign payloads. With auth.type "basic" on the subscription, every
// notification carries `Authorization: Basic base64(login:pwd)`.
export function verifyCelcoinAuth(
  authorization: string | null,
  username: string | undefined = process.env.CELCOIN_WEBHOOK_USERNAME,
  password: string | undefined = process.env.CELCOIN_WEBHOOK_PASSWORD
): boolean {
  if (!username || !password) return false; // never accept when unconfigured
  if (!authorization) return false;

  const match = /^basic[ \t]+(\S+)$/i.exec(authorization.trim());
  if (!match) return false;

  const decoded = decodeStrictBase64(match[1]);
  if (decoded === null) return false;

  const sep = decoded.indexOf(':'); // split on the FIRST colon; the password may contain ':'
  if (sep === -1) return false;

  // Evaluate both compares so a wrong username takes as long as a wrong password.
  const userOk = safeEqual(decoded.slice(0, sep), username);
  const passOk = safeEqual(decoded.slice(sep + 1), password);
  return userOk && passOk;
}

export interface CelcoinEvent {
  entity?: string;
  createTimestamp?: string;
  status?: string; // CONFIRMED or ERROR
  body?: Record<string, unknown>;
  error?: { errorCode?: string; message?: string };
}

export function handleEvent(payload: CelcoinEvent): void {
  const { entity, status, body } = payload;
  const id = body?.id;

  switch (entity) {
    case 'pix-payment-out':
      console.log(`Pix payment out ${status}`, id);
      // TODO: mark the Pix transfer as settled (CONFIRMED) or failed (ERROR)
      break;
    case 'pix-payment-in':
      console.log(`Pix payment in ${status}`, id);
      // TODO: credit the customer for the received Pix
      break;
    case 'pix-reversal-out':
      console.log(`Pix reversal out ${status}`, id);
      // TODO: record the refund you issued
      break;
    case 'pix-reversal-in':
      console.log(`Pix reversal in ${status}`, id);
      // TODO: reconcile the refund received for a Pix-out
      break;
    case 'internal-transfer-in':
      console.log(`Internal transfer in ${status}`, id);
      // TODO: credit the receiving account
      break;
    case 'internal-transfer-out':
      console.log(`Internal transfer out ${status}`, id);
      // TODO: confirm the debit
      break;
    case 'spb-transfer-out':
      console.log(`TED out ${status}`, id);
      // TODO: confirm the TED (on ERROR see payload.error)
      break;
    case 'spb-transfer-in':
      console.log(`TED in ${status}`, id);
      // TODO: credit the received TED
      break;
    case 'onboarding-create':
      console.log(`Onboarding account created ${status}`);
      // TODO: store the new account details
      break;
    case 'onboarding-proposal':
      console.log(`Onboarding proposal result ${status}`);
      // TODO: continue or stop the onboarding journey (proposal Approved or Reproved)
      break;
    case 'kyc':
      console.log(`KYC result ${status}`);
      // TODO: update the account's compliance state
      break;
    default:
      console.log(`Unhandled Celcoin entity: ${entity}`);
  }
}
