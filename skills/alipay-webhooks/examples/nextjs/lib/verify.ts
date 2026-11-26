// Generated with: alipay-webhooks skill
// https://github.com/hookdeck/webhook-skills
//
// Alipay (Antom / Alipay+) RSA256 (SHA256withRSA) notification verification.

import { createVerify } from 'crypto';

// The acknowledgement body Antom expects, with fixed values. No signature is required.
export const ACK_BODY = JSON.stringify({
  result: { resultCode: 'SUCCESS', resultStatus: 'S', resultMessage: 'success' },
});

// PEM values are commonly stored on one line with literal "\n"; restore newlines.
export function normalizePem(pem: string): string {
  return (pem || '').replace(/\\n/g, '\n');
}

// Parse "algorithm=RSA256,keyVersion=1,signature=<value>" into an object.
export function parseSignatureHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of String(header || '').split(',')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

// Two-line signed content: "<METHOD> <URI>\n<Client-Id>.<Time>.<Body>"
function buildSignedContent(method: string, uri: string, clientId: string, time: string, body: string): string {
  return `${method} ${uri}\n${clientId}.${time}.${body}`;
}

export interface VerifyParams {
  method: string;
  uri: string;
  clientId: string | null;
  requestTime: string | null;
  rawBody: string;
  signatureHeader: string | null;
  publicKey: string;
}

// Verify an inbound notification signature with Antom's PUBLIC key.
export function verifyAlipaySignature(params: VerifyParams): boolean {
  const { method, uri, clientId, requestTime, rawBody, signatureHeader, publicKey } = params;
  const { signature } = parseSignatureHeader(signatureHeader || '');
  if (!signature || !clientId || !requestTime) return false;

  const content = buildSignedContent(method, uri, clientId, requestTime, rawBody);

  // Antom base64-encodes, then URL-encodes: percent-decode, accept URL-safe base64, decode.
  let sigBytes: Buffer;
  try {
    sigBytes = Buffer.from(
      decodeURIComponent(signature).replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    );
  } catch {
    return false;
  }

  const verifier = createVerify('RSA-SHA256');
  verifier.update(content, 'utf8');
  verifier.end();
  try {
    return verifier.verify(normalizePem(publicKey), sigBytes);
  } catch {
    return false;
  }
}
