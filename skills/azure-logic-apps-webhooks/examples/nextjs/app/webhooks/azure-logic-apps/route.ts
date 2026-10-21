// Generated with: azure-logic-apps-webhooks skill
// https://github.com/hookdeck/webhook-skills
//
// Receiver for outbound calls from an Azure Logic Apps (or Power Automate) HTTP action.
//
// Logic Apps does NOT sign requests. Authenticate the call with a credential the
// workflow sends:
//   Basic authentication : Authorization: Basic base64(username:password)
//   Raw authentication   : Authorization: <whatever you typed in "Value">
//   Custom header        : any header you add under the action's "Headers"
//
// Basic uses AZURE_LOGIC_APPS_USERNAME / _PASSWORD. A shared secret uses
// AZURE_LOGIC_APPS_SHARED_SECRET in the AZURE_LOGIC_APPS_SECRET_HEADER header
// (set it to "Authorization" for Raw auth). Every configured method must pass;
// with nothing configured the route fails closed.

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const DEFAULT_SECRET_HEADER = 'x-logic-apps-secret';

export interface AzureLogicAppsConfig {
  username: string;
  password: string;
  sharedSecret: string;
  secretHeader: string;
}

export function getConfig(): AzureLogicAppsConfig {
  return {
    username: process.env.AZURE_LOGIC_APPS_USERNAME || '',
    password: process.env.AZURE_LOGIC_APPS_PASSWORD || '',
    sharedSecret: process.env.AZURE_LOGIC_APPS_SHARED_SECRET || '',
    secretHeader: (process.env.AZURE_LOGIC_APPS_SECRET_HEADER || DEFAULT_SECRET_HEADER).toLowerCase(),
  };
}

// Constant-time string compare. Hashing first gives equal-length buffers, so
// timingSafeEqual never throws and the secret's length isn't leaked.
export function safeEqual(received: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(received, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

// Verify `Authorization: Basic base64(username:password)`.
export function verifyBasicAuth(
  authorizationHeader: string | null,
  username: string,
  password: string
): boolean {
  if (!authorizationHeader) return false;
  const match = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(authorizationHeader);
  if (!match) return false;

  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const sep = decoded.indexOf(':'); // the username can't contain ':', the password can
  if (sep === -1) return false;

  // Evaluate both compares so a wrong username takes as long as a wrong password.
  const userOk = safeEqual(decoded.slice(0, sep), username);
  const passOk = safeEqual(decoded.slice(sep + 1), password);
  return userOk && passOk;
}

// Verify a shared secret sent in a header (custom header, or Authorization for Raw auth).
export function verifySharedSecret(headerValue: string | null, secret: string): boolean {
  if (!headerValue || !secret) return false;
  return safeEqual(headerValue, secret);
}

export function authenticate(
  headers: Headers,
  config: AzureLogicAppsConfig = getConfig()
): { status: number; error: string; basic?: boolean } | null {
  const basicConfigured = Boolean(config.username && config.password);
  const secretConfigured = Boolean(config.sharedSecret);

  if (!basicConfigured && !secretConfigured) {
    return { status: 500, error: 'No Azure Logic Apps credentials configured' };
  }
  if (basicConfigured && !verifyBasicAuth(headers.get('authorization'), config.username, config.password)) {
    return { status: 401, error: 'Invalid Basic authentication', basic: true };
  }
  if (secretConfigured && !verifySharedSecret(headers.get(config.secretHeader), config.sharedSecret)) {
    return { status: 401, error: 'Invalid shared secret' };
  }
  return null;
}

export async function POST(request: NextRequest) {
  const failure = authenticate(request.headers);
  if (failure) {
    const headers: Record<string, string> = failure.basic
      ? { 'WWW-Authenticate': 'Basic realm="azure-logic-apps"' }
      : {};
    return NextResponse.json({ error: failure.error }, { status: failure.status, headers });
  }

  // Logic Apps sends whatever the action's Body is: JSON by default, but it can be
  // text, form-urlencoded or multipart. Read the raw text and parse after auth.
  const rawBody = await request.text();
  const contentType = request.headers.get('content-type') || '';

  let payload: unknown = rawBody;
  if (contentType.includes('json') && rawBody.length > 0) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
  }

  // No event type or delivery id comes from Logic Apps. If you need either, have the
  // workflow put them in the Body or Headers (e.g. "@{workflow()['run']['name']}").
  console.log('Received Azure Logic Apps workflow call', { contentType, payload });

  // Return 200, not 202: a 202 makes a stateful workflow's HTTP action follow the
  // async polling pattern and poll the Location header.
  return NextResponse.json({ received: true }, { status: 200 });
}
