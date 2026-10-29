// Test-only PKI that mirrors Scaleway's layout: a self-signed root and an intermediate CA in the
// trust-chain bundle, and a leaf signing certificate published at SigningCertURL. Nothing here is a
// real Scaleway certificate, and no test touches the network.
const crypto = require('crypto');
const forge = require('node-forge');

function keyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    privateKey, // node KeyObject, used to sign messages
    forgePrivate: forge.pki.privateKeyFromPem(privateKey.export({ type: 'pkcs1', format: 'pem' })),
    forgePublic: forge.pki.publicKeyFromPem(publicKey.export({ type: 'spki', format: 'pem' })),
  };
}

let serial = 1;
function makeCert({ cn, keys, issuerCn = cn, issuerKeys = keys, ca, notBefore, notAfter }) {
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.forgePublic;
  cert.serialNumber = (serial++).toString(16).padStart(2, '0');
  cert.validity.notBefore = notBefore ?? new Date(Date.now() - 24 * 3600 * 1000);
  cert.validity.notAfter = notAfter ?? new Date(Date.now() + 365 * 24 * 3600 * 1000);
  cert.setSubject([{ name: 'commonName', value: cn }]);
  cert.setIssuer([{ name: 'commonName', value: issuerCn }]);
  cert.setExtensions([
    { name: 'basicConstraints', cA: ca, critical: true },
    ca
      ? { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true }
      : { name: 'keyUsage', digitalSignature: true, critical: true },
    { name: 'subjectKeyIdentifier' },
  ]);
  cert.sign(issuerKeys.forgePrivate, forge.md.sha256.create());
  return forge.pki.certificateToPem(cert);
}

function createPki() {
  const rootKeys = keyPair();
  const intermediateKeys = keyPair();
  const leafKeys = keyPair();
  const rogueKeys = keyPair();

  const root = makeCert({ cn: 'Test MnQ Root', keys: rootKeys, ca: true });
  const intermediate = makeCert({ cn: 'Test MnQ', keys: intermediateKeys, issuerCn: 'Test MnQ Root', issuerKeys: rootKeys, ca: true });
  const leaf = makeCert({ cn: 'sns.mnq.test', keys: leafKeys, issuerCn: 'Test MnQ', issuerKeys: intermediateKeys, ca: false });
  const expiredLeaf = makeCert({
    cn: 'sns.mnq.test',
    keys: leafKeys,
    issuerCn: 'Test MnQ',
    issuerKeys: intermediateKeys,
    ca: false,
    notBefore: new Date(Date.now() - 3 * 24 * 3600 * 1000),
    notAfter: new Date(Date.now() - 24 * 3600 * 1000),
  });
  // Same names as the real chain, signed by a different key: must not be trusted
  const rogueLeaf = makeCert({ cn: 'sns.mnq.test', keys: rogueKeys, issuerCn: 'Test MnQ', issuerKeys: rogueKeys, ca: false });
  const selfSignedLeaf = makeCert({ cn: 'sns.mnq.test', keys: leafKeys, ca: false });
  // A leaf issued by the "leaf": its issuer is not a CA
  const leafIssuedByLeaf = makeCert({ cn: 'child', keys: rogueKeys, issuerCn: 'sns.mnq.test', issuerKeys: leafKeys, ca: false });

  return {
    trustChainPem: root + intermediate,
    leaf,
    expiredLeaf,
    rogueLeaf,
    selfSignedLeaf,
    leafIssuedByLeaf,
    leafKey: leafKeys.privateKey,
    rogueKey: rogueKeys.privateKey,
  };
}

const SIGNED_FIELDS = {
  Notification: ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'],
  SubscriptionConfirmation: ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'],
  UnsubscribeConfirmation: ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'],
};

/** Signs an envelope the way SNS SignatureVersion 1 does: RSA-SHA1 over "Key\nValue\n" pairs. */
function signEnvelope(msg, privateKey) {
  const canonical = SIGNED_FIELDS[msg.Type]
    .filter((key) => msg[key] !== undefined && msg[key] !== null)
    .map((key) => `${key}\n${msg[key]}\n`)
    .join('');
  return { ...msg, Signature: crypto.sign('RSA-SHA1', Buffer.from(canonical, 'utf8'), privateKey).toString('base64') };
}

module.exports = { createPki, signEnvelope };
