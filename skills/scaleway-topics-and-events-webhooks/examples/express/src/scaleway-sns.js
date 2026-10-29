// Generated with: scaleway-topics-and-events-webhooks skill
// https://github.com/hookdeck/webhook-skills
//
// Verification for Scaleway Topics and Events (an SNS-compatible service) HTTP/S deliveries.
//
// Scaleway signs every message with SignatureVersion "1" (RSA, SHA1) over the AWS SNS canonical
// string, and publishes the signing certificate at SigningCertURL. Do NOT trust that certificate
// directly: check that it chains to Scaleway's CA trust chain (sns-trust-chain.pem), then verify.
// https://www.scaleway.com/en/docs/topics-and-events/reference-content/verifying-webhooks/

const crypto = require('crypto');

// Fields covered by the signature, in the (byte-sorted) order they are signed. Only Subject is
// optional: it is skipped when absent or null.
const SIGNED_FIELDS = {
  Notification: ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'],
  SubscriptionConfirmation: ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'],
  UnsubscribeConfirmation: ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'],
};
const OPTIONAL_FIELDS = new Set(['Subject']);

// Host of the SigningCertURL in Scaleway's docs (and of the trust-chain files)
const DEFAULT_CERT_HOSTS = ['messaging.s3.fr-par.scw.cloud'];
// Regions with a published trust chain (and the ones Hookdeck accepts)
const TOPIC_ARN = /^arn:scw:sns:(fr-par|nl-ams):[^:]+:[^:]+$/;

class CertFetchError extends Error {}

const isObject = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);

/** "Key\nValue\n" for each signed field that is present; null if a field is missing or not a string. */
function canonicalString(msg) {
  // Object.hasOwn: a Type of "constructor" or "__proto__" must not reach Object.prototype
  if (typeof msg.Type !== 'string' || !Object.hasOwn(SIGNED_FIELDS, msg.Type)) return null;
  const fields = SIGNED_FIELDS[msg.Type];
  let out = '';
  for (const key of fields) {
    const value = msg[key];
    if ((value === undefined || value === null) && OPTIONAL_FIELDS.has(key)) continue;
    if (typeof value !== 'string') return null;
    out += `${key}\n${value}\n`;
  }
  return out;
}

/** Parse every certificate in a PEM bundle (Scaleway's holds the root and an intermediate). */
function loadTrustChain(pem) {
  const blocks = String(pem).match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];
  return blocks.map((block) => new crypto.X509Certificate(block));
}

function withinValidity(cert, now) {
  return Date.parse(cert.validFrom) <= now && now <= Date.parse(cert.validTo);
}

function issuedBy(cert, issuer) {
  try {
    return issuer.ca && cert.checkIssued(issuer) && cert.verify(issuer.publicKey);
  } catch {
    return false;
  }
}

/** Walk leaf -> issuer(s) in the bundle until a self-signed root that is itself in the bundle. */
function chainsToTrustedRoot(leaf, trustChain, now = Date.now()) {
  let cert = leaf;
  for (let depth = 0; depth < 5; depth++) {
    if (!withinValidity(cert, now)) return false;
    const inBundle = trustChain.some((t) => t.fingerprint256 === cert.fingerprint256);
    if (inBundle && issuedBy(cert, cert)) return true; // trusted, self-signed root
    const issuer = trustChain.find((t) => t.fingerprint256 !== cert.fingerprint256 && issuedBy(cert, t));
    if (!issuer) return false;
    cert = issuer;
  }
  return false;
}

// No query string or fragment: the cache is keyed by URL, and "?x=1", "?x=2", ... would each fetch
// and cache the same certificate.
function allowedCertUrl(url, allowedHosts) {
  if (url.includes('?') || url.includes('#')) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && allowedHosts.includes(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Default certificate fetcher: HTTPS only, no redirects, 5 s timeout, small responses only.
 * Returns the PEM, or null when the host answers anything but 200 below 500 (e.g. 404: there is no
 * such certificate, so the message is rejected with 401). Throws CertFetchError for network errors
 * and 5xx, which are worth retrying (503).
 */
async function fetchCertificatePem(url) {
  let res;
  try {
    res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
  } catch (err) {
    throw new CertFetchError(`Could not fetch ${url}: ${err.message}`);
  }
  if (res.status >= 500) throw new CertFetchError(`Fetching ${url} returned HTTP ${res.status}`);
  if (res.status !== 200) return null;
  const text = await res.text();
  if (text.length > 64 * 1024) throw new CertFetchError(`Certificate at ${url} is too large`);
  return text;
}

/**
 * Creates a verifier bound to a trust chain. Validated certificates are cached by URL (Scaleway
 * recommends caching and using the URL's unique ID as the key); certificates are rotated at least
 * once a year, and during a rotation both the old and new certificate can sign messages.
 */
function createVerifier({
  trustChainPem,
  allowedCertHosts = DEFAULT_CERT_HOSTS,
  fetchCert = fetchCertificatePem,
  now = () => Date.now(),
}) {
  const trustChain = loadTrustChain(trustChainPem);
  if (trustChain.length === 0) throw new Error('The trust chain PEM holds no certificates');
  // Only certificates that chain to the trust chain are cached, so this holds Scaleway's real
  // signing certificates; the cap is a backstop.
  const cache = new Map();
  const MAX_CACHED_CERTS = 50;

  async function signingCert(url) {
    const cached = cache.get(url);
    if (cached && chainsToTrustedRoot(cached, trustChain, now())) return cached;
    const pem = await fetchCert(url);
    if (typeof pem !== 'string') return null;
    let cert;
    try {
      cert = new crypto.X509Certificate(pem);
    } catch {
      return null;
    }
    if (cert.publicKey.asymmetricKeyType !== 'rsa' || !chainsToTrustedRoot(cert, trustChain, now())) return null;
    if (cache.size >= MAX_CACHED_CERTS) cache.delete(cache.keys().next().value);
    cache.set(url, cert);
    return cert;
  }

  /**
   * Returns { ok: true } or { ok: false, reason }. Throws CertFetchError when the certificate
   * can't be downloaded because of a network error or a 5xx (transient: answer 503, not 401).
   */
  return async function verifyMessage(msg) {
    if (!isObject(msg)) return { ok: false, reason: 'not an object' };
    if (msg.SignatureVersion !== '1') return { ok: false, reason: 'unsupported SignatureVersion' };
    const canonical = canonicalString(msg);
    if (canonical === null) return { ok: false, reason: 'missing or non-string signed field' };
    if (typeof msg.Signature !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(msg.Signature)) {
      return { ok: false, reason: 'malformed Signature' };
    }
    if (typeof msg.SigningCertURL !== 'string' || !allowedCertUrl(msg.SigningCertURL, allowedCertHosts)) {
      return { ok: false, reason: 'SigningCertURL is not an allowed https URL' };
    }
    const cert = await signingCert(msg.SigningCertURL);
    if (!cert) return { ok: false, reason: 'signing certificate is unavailable or does not chain to the trust chain' };
    const ok = crypto.verify('RSA-SHA1', Buffer.from(canonical, 'utf8'), cert.publicKey, Buffer.from(msg.Signature, 'base64'));
    return ok ? { ok: true } : { ok: false, reason: 'signature mismatch' };
  };
}

/**
 * The checks Hookdeck applies before it GETs a SubscribeURL: https, host sns.mnq.<region>.scaleway.com
 * for the TopicArn's region, path "/", no credentials, port or fragment, and exactly one Action
 * (ConfirmSubscription), TopicArn and Token, matching the message.
 */
function isValidSubscribeUrl(msg) {
  if (typeof msg.SubscribeURL !== 'string' || typeof msg.Token !== 'string' || !msg.Token) return false;
  if (typeof msg.TopicArn !== 'string') return false;
  const region = TOPIC_ARN.exec(msg.TopicArn)?.[1];
  if (!region) return false;
  let u;
  try {
    u = new URL(msg.SubscribeURL);
  } catch {
    return false;
  }
  const one = (name, expected) => u.searchParams.getAll(name).length === 1 && u.searchParams.get(name) === expected;
  return (
    u.protocol === 'https:' &&
    u.hostname === `sns.mnq.${region}.scaleway.com` &&
    !u.username && !u.password && !u.port && !u.hash &&
    u.pathname === '/' &&
    one('Action', 'ConfirmSubscription') &&
    one('TopicArn', msg.TopicArn) &&
    one('Token', msg.Token)
  );
}

/** GET the SubscribeURL unchanged; success is HTTP 200. Redirects are not followed. */
async function confirmSubscription(subscribeUrl) {
  const res = await fetch(subscribeUrl, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(5000) });
  return res.status === 200;
}

module.exports = {
  CertFetchError,
  DEFAULT_CERT_HOSTS,
  allowedCertUrl,
  canonicalString,
  chainsToTrustedRoot,
  confirmSubscription,
  createVerifier,
  fetchCertificatePem,
  isValidSubscribeUrl,
  loadTrustChain,
};
