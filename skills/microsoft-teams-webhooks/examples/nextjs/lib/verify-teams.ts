// Generated with: microsoft-teams-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Teams outgoing webhooks send   Authorization: HMAC <base64>
// = base64(HMAC-SHA256(key = base64-DECODED security token, raw UTF-8 body)).

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export function verifyTeamsRequest(
  rawBody: Buffer | string,
  authorization: string | null,
  securityToken: string | undefined
): boolean {
  if (!authorization || !securityToken) return false;
  const match = /^HMAC (\S+)$/i.exec(authorization.trim());
  if (!match) return false;

  // Node's base64 decoder skips invalid characters, so reject a malformed token
  // instead of keying with the wrong bytes. Trim a pasted trailing newline.
  const token = securityToken.trim();
  if (!BASE64.test(token)) return false;
  const key = Buffer.from(token, 'base64');
  if (key.length === 0) return false;

  const expected = crypto.createHmac('sha256', key).update(rawBody).digest();
  const given = Buffer.from(match[1], 'base64');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/** The fields of the Bot Framework message activity this example reads. */
export interface TeamsActivity {
  type: string;
  id?: string;
  text?: string;
  from?: { id?: string; name?: string; aadObjectId?: string };
  conversation?: { id?: string; conversationType?: string };
  [key: string]: unknown;
}

export interface TeamsReply {
  type: 'message';
  text?: string;
  attachments?: unknown[];
}

/** "<at>Helper</at> status" -> "status" (also drops other HTML tags). */
export function commandText(text: string | undefined): string {
  return String(text ?? '')
    .replace(/<at>.*?<\/at>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build the reply Teams posts in the thread. Keep it fast: Teams times out
 * after about 5 seconds.
 */
export function buildReply(activity: TeamsActivity): TeamsReply {
  const command = commandText(activity.text).toLowerCase();
  const who = activity.from?.name || 'there';
  switch (command) {
    case 'help':
    case '':
      return { type: 'message', text: 'Commands: status, help' };
    case 'status':
      return { type: 'message', text: `Hi ${who}, all systems are operational.` };
    default:
      return { type: 'message', text: 'Unknown command. Try "help".' };
  }
}
