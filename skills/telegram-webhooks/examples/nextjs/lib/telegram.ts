// Generated with: telegram-webhooks skill
// https://github.com/hookdeck/webhook-skills

import crypto from 'crypto';

// Telegram does not sign webhook payloads. Instead, the secret_token passed to
// setWebhook is sent back unchanged in the X-Telegram-Bot-Api-Secret-Token
// header on every request.
// https://core.telegram.org/bots/api#setwebhook
export function verifyTelegramSecretToken(
  headerValue: string | null | undefined,
  expectedSecret: string | undefined
): boolean {
  // Fail closed: no configured secret or no header means reject
  if (!headerValue || !expectedSecret) {
    return false;
  }

  const received = Buffer.from(headerValue);
  const expected = Buffer.from(expectedSecret);
  // timingSafeEqual throws on length mismatch, so check length first
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// An Update has update_id plus at most one optional field; that field's name
// is the update type (message, callback_query, ...).
export type TelegramUpdate = { update_id: number } & Record<string, any>;

export function getUpdateType(update: TelegramUpdate): string | undefined {
  return Object.keys(update).find((key) => key !== 'update_id');
}
