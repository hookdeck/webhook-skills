const { createHash, generateKeyPairSync, sign } = require('node:crypto');
const { rebillyPublicKey, verifyV2a } = require('../src/verify-v2a');

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const rawKey = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
const key = rebillyPublicKey('whpk_' + rawKey.toString('base64'));
const organization = 'example%.store';
const body = Buffer.from([0x7b, 0xff, 0x7d, 0x0a]);

function delivery(payload) {
  const id = 'example%.store:event-42';
  const timestamp = '1577934245';
  const legacyContent = Buffer.concat([Buffer.from(id + '.' + timestamp + '.'), payload]);
  const digest = createHash('sha256').update('example%25%2Estore.').update(legacyContent).digest();
  const v2a = 'v2a,' + sign(null, digest, privateKey).toString('base64');
  const legacy = 'v1a,' + sign(null, legacyContent, privateKey).toString('base64');
  const oldKey = generateKeyPairSync('ed25519').privateKey;
  const rotated = 'v2a,' + sign(null, digest, oldKey).toString('base64');
  return {
    headers: { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': [legacy, rotated, v2a].join(' ') },
    legacy,
    v2a,
  };
}

test.each([body, Buffer.alloc(0)])('verifies the original bytes during rotation', (payload) => {
  expect(verifyV2a(delivery(payload).headers, payload, key, organization)).toBe(true);
});

test('binds the organization, ID, timestamp and raw body', () => {
  const { headers } = delivery(body);
  expect(verifyV2a(headers, body, key, 'different')).toBe(false);
  const otherKey = generateKeyPairSync('ed25519').publicKey;
  expect(verifyV2a(headers, body, otherKey, organization)).toBe(false);
  expect(verifyV2a({ ...headers, 'webhook-timestamp': undefined }, body, key, organization)).toBe(false);
  expect(verifyV2a(headers, body.subarray(0, -1), key, organization)).toBe(false);
  expect(verifyV2a({ ...headers, 'webhook-id': organization + ':other' }, body, key, organization)).toBe(false);
  expect(verifyV2a({ ...headers, 'webhook-timestamp': '1577934246' }, body, key, organization)).toBe(false);
});

test('requires a valid v2a entry', () => {
  const { headers, legacy, v2a } = delivery(body);
  for (const value of [undefined, legacy, legacy.replace('v1a,', 'v2a,'), v2a + '!']) {
    expect(verifyV2a({ ...headers, 'webhook-signature': value }, body, key, organization)).toBe(false);
  }
});

test('rejects a misconfigured public key at startup', () => {
  expect(() => rebillyPublicKey('oops_' + rawKey.toString('base64'))).toThrow();
});
