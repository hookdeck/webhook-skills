// Generated with: ebay-webhooks skill
// https://github.com/hookdeck/webhook-skills

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

// Public key cache — keyed by `kid` from the x-ebay-signature header. eBay
// recommends caching ~1 hour. Exported so tests can preload it and skip the
// live OAuth + getPublicKey call.
const ONE_HOUR_MS = 60 * 60 * 1000;
export const keyCache = new Map<string, { pem: string; expires: number }>();

interface EbayConfig {
  clientId?: string;
  clientSecret?: string;
  verificationToken?: string;
  endpoint?: string;
  apiHost: string;
}

function loadConfig(): EbayConfig {
  const env = (process.env.EBAY_ENV || 'production').toLowerCase();
  return {
    clientId: process.env.EBAY_CLIENT_ID,
    clientSecret: process.env.EBAY_CLIENT_SECRET,
    verificationToken: process.env.EBAY_VERIFICATION_TOKEN,
    endpoint: process.env.EBAY_ENDPOINT,
    apiHost: env === 'sandbox' ? 'api.sandbox.ebay.com' : 'api.ebay.com',
  };
}

function toPem(key: string): string {
  if (key.includes('BEGIN PUBLIC KEY')) {
    return key
      .replace('-----BEGIN PUBLIC KEY-----', '-----BEGIN PUBLIC KEY-----\n')
      .replace('-----END PUBLIC KEY-----', '\n-----END PUBLIC KEY-----');
  }
  return `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
}

async function getAppToken(config: EbayConfig): Promise<string> {
  const creds = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const res = await fetch(`https://${config.apiHost}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body:
      'grant_type=client_credentials&scope=' +
      encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
  });
  if (!res.ok) throw new Error(`OAuth token request failed: ${res.status}`);
  return (await res.json()).access_token;
}

export async function getPublicKey(kid: string, config: EbayConfig): Promise<string> {
  const cached = keyCache.get(kid);
  if (cached && cached.expires > Date.now()) return cached.pem;

  const token = await getAppToken(config);
  const res = await fetch(
    `https://${config.apiHost}/commerce/notification/v1/public_key/${kid}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`getPublicKey failed: ${res.status}`);
  const body = await res.json();
  const pem = toPem(body.key);
  keyCache.set(kid, { pem, expires: Date.now() + ONE_HOUR_MS });
  return pem;
}

export async function verifyEbaySignature(
  rawBody: Buffer,
  signatureHeader: string | null,
  config: EbayConfig
): Promise<boolean> {
  if (!signatureHeader) return false;

  let sig: { kid?: string; signature?: string };
  try {
    sig = JSON.parse(Buffer.from(signatureHeader, 'base64').toString('utf8'));
  } catch {
    return false;
  }
  if (!sig.kid || !sig.signature) return false;

  let pem: string;
  try {
    pem = await getPublicKey(sig.kid, config);
  } catch {
    return false;
  }

  const verifier = crypto.createVerify('sha1'); // eBay signs ECDSA with SHA-1
  verifier.update(rawBody); // body exactly as received
  verifier.end();
  try {
    return verifier.verify(pem, sig.signature, 'base64');
  } catch {
    return false;
  }
}

// GET — endpoint challenge validation. Respond 200 with
// { challengeResponse: SHA-256(challengeCode + verificationToken + endpoint) }.
export async function GET(request: NextRequest) {
  const challengeCode = request.nextUrl.searchParams.get('challenge_code');
  if (!challengeCode) {
    return new NextResponse('Missing challenge_code', { status: 400 });
  }
  const config = loadConfig();
  if (!config.verificationToken || !config.endpoint) {
    console.error('EBAY_VERIFICATION_TOKEN or EBAY_ENDPOINT is not set');
    return new NextResponse('Server misconfigured', { status: 500 });
  }
  // ORDER IS MANDATORY: challengeCode + verificationToken + endpoint
  const hash = crypto.createHash('sha256');
  hash.update(challengeCode);
  hash.update(config.verificationToken);
  hash.update(config.endpoint);
  return NextResponse.json({ challengeResponse: hash.digest('hex') }, { status: 200 });
}

// POST — incoming notification. Read raw bytes for signature verification.
export async function POST(request: NextRequest) {
  const config = loadConfig();
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signatureHeader = request.headers.get('x-ebay-signature');

  const valid = await verifyEbaySignature(rawBody, signatureHeader, config);
  if (!valid) {
    // 412 Precondition Failed matches eBay's SDK behaviour for a bad signature.
    return new NextResponse('Invalid signature', { status: 412 });
  }

  let event: {
    metadata?: { topic?: string };
    notification?: { notificationId?: string; data?: Record<string, unknown> };
  };
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  const topic = event.metadata?.topic;
  const data = event.notification?.data ?? {};

  switch (topic) {
    case 'MARKETPLACE_ACCOUNT_DELETION':
      console.log('Account deletion for user:', data.userId, data.username);
      // Your code: delete or anonymize this user's data
      break;
    case 'AUTHORIZATION_REVOCATION':
      console.log('Authorization revoked for user:', data.userId, data.username);
      // Your code: stop API calls for this user and purge stored OAuth tokens
      break;
    case 'ITEM_AVAILABILITY':
      console.log('Item availability changed:', data.itemId);
      break;
    case 'ITEM_PRICE_REVISION':
      console.log('Item price revised:', data.itemId);
      break;
    case 'PRIORITY_LISTING_REVISION':
      console.log('Priority listing revised:', data.listingId);
      break;
    default:
      console.log('Unhandled topic:', topic);
  }

  // 204 No Content acknowledges the notification (eBay wants a 2xx).
  return new NextResponse(null, { status: 204 });
}
