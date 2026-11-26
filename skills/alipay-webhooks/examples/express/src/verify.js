// Generated with: alipay-webhooks skill
// https://github.com/hookdeck/webhook-skills
//
// Alipay (Antom / Alipay+) RSA256 (SHA256withRSA) notification verification.
// Shared by the Express handler and the tests.

const { createVerify } = require('crypto');

// The acknowledgement body Antom expects, with fixed values. Antom resends the
// notification until it receives this body. No signature is required on it.
const ACK_BODY = JSON.stringify({
  result: { resultCode: 'SUCCESS', resultStatus: 'S', resultMessage: 'success' },
});

// PEM values are commonly stored on one line with literal "\n"; restore newlines.
function normalizePem(pem) {
  return (pem || '').replace(/\\n/g, '\n');
}

// Parse "algorithm=RSA256,keyVersion=1,signature=<value>" into an object.
// Only splits on the FIRST "=" per part so base64 "=" padding survives.
function parseSignatureHeader(header) {
  return Object.fromEntries(
    String(header || '')
      .split(',')
      .map((part) => {
        const i = part.indexOf('=');
        if (i === -1) return [part.trim(), ''];
        return [part.slice(0, i).trim(), part.slice(i + 1).trim()];
      })
  );
}

// Two-line signed content: "<METHOD> <URI>\n<Client-Id>.<Time>.<Body>"
function buildSignedContent({ method, uri, clientId, time, body }) {
  return `${method} ${uri}\n${clientId}.${time}.${body}`;
}

// Verify an inbound notification signature with Antom's PUBLIC key.
function verifyAlipaySignature({ method, uri, clientId, requestTime, rawBody, signatureHeader, publicKey }) {
  const { signature } = parseSignatureHeader(signatureHeader);
  if (!signature || !clientId || !requestTime) return false;

  const content = buildSignedContent({ method, uri, clientId, time: requestTime, body: rawBody });

  // Antom base64-encodes the signature and then URL-encodes it:
  // percent-decode, accept a URL-safe alphabet too, then base64-decode.
  let sigBytes;
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
    // Malformed key or signature buffer — fail closed.
    return false;
  }
}

module.exports = {
  ACK_BODY,
  normalizePem,
  parseSignatureHeader,
  buildSignedContent,
  verifyAlipaySignature,
};
