// Generated with: green-api-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

/**
 * GREEN-API sends the configured webhookUrlToken as the FULL Authorization
 * header value: "Bearer <token>" (default) or "Basic <token>". Build that
 * expected value from the configured token. A bare token means "Bearer".
 */
export function expectedAuthorization(token: string): string {
  return /^(Bearer|Basic) /.test(token) ? token : `Bearer ${token}`;
}

/**
 * GREEN-API webhooks are not signed (no HMAC). Authenticate the request by
 * constant-time comparing the whole Authorization header, scheme included.
 */
export function verifyGreenApiAuthorization(
  headerValue: string | null | undefined,
  token: string | undefined
): boolean {
  if (!headerValue || !token) return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expectedAuthorization(token));
  // timingSafeEqual throws on unequal lengths, so check length first.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export interface GreenApiNotification {
  typeWebhook: string;
  instanceData?: { idInstance: number; wid: string; typeInstance: string };
  timestamp?: number;
  idMessage?: string;
  chatId?: string;
  status?: string;
  stateInstance?: string;
  statusInstance?: string;
  from?: string;
  senderData?: { chatId?: string; sender?: string; chatName?: string; senderName?: string };
  messageData?: {
    typeMessage?: string;
    textMessageData?: { textMessage?: string };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Dispatch on typeWebhook. GREEN-API retries undelivered notifications every
 * minute for up to 24 hours, so make these handlers idempotent (e.g. dedupe
 * on idMessage).
 */
export function handleNotification(body: GreenApiNotification): void {
  switch (body.typeWebhook) {
    case 'incomingMessageReceived': {
      const text = body.messageData?.textMessageData?.textMessage;
      console.log(
        `Incoming ${body.messageData?.typeMessage} ${body.idMessage} from ${body.senderData?.chatId}${text ? `: ${text}` : ''}`
      );
      // TODO: route to your bot / inbox, auto-reply, etc.
      break;
    }

    case 'outgoingMessageReceived':
      console.log(`Message ${body.idMessage} sent from phone to ${body.senderData?.chatId}`);
      // TODO: sync conversations sent outside your app
      break;

    case 'outgoingAPIMessageReceived':
      console.log(`Message ${body.idMessage} sent via API to ${body.senderData?.chatId}`);
      // TODO: log/audit API sends
      break;

    case 'outgoingMessageStatus':
      console.log(`Message ${body.idMessage} to ${body.chatId} is ${body.status}`);
      // TODO: update delivery/read status; handle "failed" and "noAccount" (always sent)
      break;

    case 'stateInstanceChanged':
      console.log(`Instance ${body.instanceData?.idInstance} state: ${body.stateInstance}`);
      // TODO: alert when notAuthorized or blocked
      break;

    case 'statusInstanceChanged':
      console.log(`Instance ${body.instanceData?.idInstance} socket: ${body.statusInstance}`);
      break;

    case 'incomingCall':
      console.log(`Incoming call ${body.idMessage} from ${body.from}`);
      // TODO: missed-call auto-reply
      break;

    default:
      console.log(`Unhandled typeWebhook: ${body.typeWebhook}`);
  }
}
