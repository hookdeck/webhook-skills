const { createHash, createPublicKey, verify } = require('node:crypto');

// Load the public key from trusted configuration once per environment.
function rebillyPublicKey(whpk) {
  const match = typeof whpk === 'string' && /^whpk_([A-Za-z0-9+/]{43}=)$/.exec(whpk);
  if (!match) throw new Error('Expected a Rebilly whpk_ Ed25519 public key');
  const rawKey = Buffer.from(match[1], 'base64');
  return createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: rawKey.toString('base64url') },
    format: 'jwk',
  });
}

function verifyV2a(headers, rawBody, publicKey, organizationId) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatures = headers['webhook-signature'];
  if (
    typeof organizationId !== 'string' || !organizationId ||
    typeof id !== 'string' || !id.startsWith(organizationId + ':') ||
    typeof timestamp !== 'string' || !timestamp || typeof signatures !== 'string' ||
    !(rawBody instanceof Uint8Array)
  ) return false;

  const endpointId = organizationId.replaceAll('%', '%25').replaceAll('.', '%2E');
  const digest = createHash('sha256')
    .update(`${endpointId}.${id}.${timestamp}.`)
    .update(rawBody)
    .digest();
  return signatures.split(' ').some(entry => {
    const match = /^v2a,([A-Za-z0-9+/]{86}==)$/.exec(entry); // Base64-encoded 64-byte signature
    return match !== null && verify(null, digest, publicKey, Buffer.from(match[1], 'base64'));
  });
}

module.exports = { rebillyPublicKey, verifyV2a };
