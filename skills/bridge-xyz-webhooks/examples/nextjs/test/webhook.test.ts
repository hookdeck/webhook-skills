import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { POST, verifyBridgeSignature } from '../app/webhooks/bridge-xyz/route';

// Throwaway RSA keypair. Bridge signs with its private key; we verify with the
// matching public key set on the env var.
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

beforeAll(() => {
  process.env.BRIDGE_WEBHOOK_PUBLIC_KEY = publicKey;
});

/**
 * Sign a payload the way Bridge does:
 *   digest = SHA256("<timestamp>.<body>")
 *   signature = RSA-SHA256(digest)  <-- the digest is hashed again inside sign()
 */
function signBridge(payload: string, privateKeyPem: string, timestamp: number = Date.now()): string {
  const digest = crypto.createHash('sha256').update(`${timestamp}.${payload}`).digest();
  const signer = crypto.createSign('sha256');
  signer.update(digest);
  signer.end();
  const signature = signer.sign(privateKeyPem, 'base64');
  return `t=${timestamp},v0=${signature}`;
}

function makeRequest(body: string, signature?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signature) headers['X-Webhook-Signature'] = signature;
  return new NextRequest('http://localhost/webhooks/bridge-xyz', {
    method: 'POST',
    headers,
    body,
  });
}

describe('Bridge Webhook Route', () => {
  it('should return 400 for missing signature', async () => {
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(400);
  });

  it('should return 400 for invalid signature', async () => {
    const payload = JSON.stringify({ event_type: 'customer.updated.status_transitioned', event_object_id: 'cust_123' });
    const res = await POST(makeRequest(payload, `t=${Date.now()},v0=bm90LXJlYWw=`));
    expect(res.status).toBe(400);
  });

  it('should return 400 for a tampered payload', async () => {
    const original = JSON.stringify({ event_type: 'transfer.updated.status_transitioned', event_object_id: 'transfer_123' });
    const signature = signBridge(original, privateKey);
    const tampered = JSON.stringify({ event_type: 'transfer.updated.status_transitioned', event_object_id: 'transfer_x' });
    const res = await POST(makeRequest(tampered, signature));
    expect(res.status).toBe(400);
  });

  it('should return 400 for a stale timestamp (replay protection)', async () => {
    const payload = JSON.stringify({ event_type: 'customer.updated.status_transitioned', event_object_id: 'cust_123' });
    const signature = signBridge(payload, privateKey, Date.now() - 11 * 60 * 1000);
    const res = await POST(makeRequest(payload, signature));
    expect(res.status).toBe(400);
  });

  it('should return 200 for a valid signature', async () => {
    const payload = JSON.stringify({ event_type: 'customer.updated.status_transitioned', event_object_id: 'cust_valid' });
    const signature = signBridge(payload, privateKey);
    const res = await POST(makeRequest(payload, signature));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('should handle all documented event types', async () => {
    const eventTypes = [
      'customer.created',
      'customer.updated.status_transitioned',
      'kyc_link.updated.status_transitioned',
      'transfer.created',
      'transfer.updated.status_transitioned',
      'virtual_account.activity.created',
      'unknown.event',
    ];

    for (const eventType of eventTypes) {
      const payload = JSON.stringify({ event_type: eventType, event_object_id: 'obj_123' });
      const signature = signBridge(payload, privateKey);
      const res = await POST(makeRequest(payload, signature));
      expect(res.status).toBe(200);
    }
  });
});

describe('verifyBridgeSignature', () => {
  it('validates a correctly signed payload', () => {
    const payload = '{"event_type":"customer.updated.status_transitioned"}';
    const signature = signBridge(payload, privateKey);
    expect(verifyBridgeSignature(payload, signature, publicKey)).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const signature = signBridge('{"a":1}', privateKey);
    expect(verifyBridgeSignature('{"a":2}', signature, publicKey)).toBe(false);
  });

  it('rejects a malformed header', () => {
    expect(verifyBridgeSignature('{}', 'not-a-valid-header', publicKey)).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifyBridgeSignature('{}', null, publicKey)).toBe(false);
  });
});
