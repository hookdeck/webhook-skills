# Generated with: scaleway-topics-and-events-webhooks skill
# https://github.com/hookdeck/webhook-skills
#
# Verification for Scaleway Topics and Events (an SNS-compatible service) HTTP/S deliveries.
#
# Scaleway signs every message with SignatureVersion "1" (RSA, SHA1) over the AWS SNS canonical
# string, and publishes the signing certificate at SigningCertURL. Do NOT trust that certificate
# directly: check that it chains to Scaleway's CA trust chain (sns-trust-chain.pem), then verify.
# https://www.scaleway.com/en/docs/topics-and-events/reference-content/verifying-webhooks/

import base64
import binascii
import re
import time
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple
from urllib.parse import parse_qs, urlsplit

import httpx
from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa

# Fields covered by the signature, in the (byte-sorted) order they are signed. Only Subject is
# optional: it is skipped when absent or null.
SIGNED_FIELDS = {
    "Notification": ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"],
    "SubscriptionConfirmation": ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
    "UnsubscribeConfirmation": ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
}
OPTIONAL_FIELDS = {"Subject"}

# Host of the SigningCertURL in Scaleway's docs (and of the trust-chain files)
DEFAULT_CERT_HOSTS = ["messaging.s3.fr-par.scw.cloud"]
# Regions with a published trust chain (and the ones Hookdeck accepts)
TOPIC_ARN = re.compile(r"arn:scw:sns:(fr-par|nl-ams):[^:]+:[^:]+")
BASE64 = re.compile(r"[A-Za-z0-9+/]+={0,2}")
MAX_CACHED_CERTS = 50


class CertFetchError(Exception):
    """The signing certificate could not be downloaded (transient: answer 5xx, not 401)."""


def canonical_string(msg: Dict[str, Any]) -> Optional[str]:
    """'Key\\nValue\\n' for each signed field that is present; None if one is missing or not a str."""
    fields = SIGNED_FIELDS.get(msg.get("Type")) if isinstance(msg.get("Type"), str) else None
    if not fields:
        return None
    out = []
    for key in fields:
        if key in OPTIONAL_FIELDS and msg.get(key) is None:
            continue
        value = msg.get(key)
        if not isinstance(value, str):
            return None
        out.append(f"{key}\n{value}\n")
    return "".join(out)


def load_trust_chain(pem: bytes) -> List[x509.Certificate]:
    """Parse every certificate in a PEM bundle (Scaleway's holds the root and an intermediate)."""
    return x509.load_pem_x509_certificates(pem)


def _within_validity(cert: x509.Certificate, now: float) -> bool:
    return cert.not_valid_before_utc.timestamp() <= now <= cert.not_valid_after_utc.timestamp()


def _is_ca(cert: x509.Certificate) -> bool:
    try:
        return cert.extensions.get_extension_for_class(x509.BasicConstraints).value.ca
    except x509.ExtensionNotFound:
        return False


def _issued_by(cert: x509.Certificate, issuer: x509.Certificate) -> bool:
    if not _is_ca(issuer):
        return False
    try:
        cert.verify_directly_issued_by(issuer)  # issuer name and signature
        return True
    except (ValueError, TypeError, InvalidSignature):
        return False


def chains_to_trusted_root(leaf: x509.Certificate, trust_chain: List[x509.Certificate], now: float) -> bool:
    """Walk leaf -> issuer(s) in the bundle until a self-signed root that is itself in the bundle."""
    cert = leaf
    for _ in range(5):
        if not _within_validity(cert, now):
            return False
        if cert in trust_chain and _issued_by(cert, cert):
            return True  # trusted, self-signed root
        issuer = next((t for t in trust_chain if t != cert and _issued_by(cert, t)), None)
        if issuer is None:
            return False
        cert = issuer
    return False


def allowed_cert_url(url: str, allowed_hosts: List[str]) -> bool:
    # No query string or fragment: the cache is keyed by URL, and "?x=1", "?x=2", ... would each
    # fetch and cache the same certificate.
    if "?" in url or "#" in url:
        return False
    try:
        u = urlsplit(url)
        return (
            u.scheme == "https"
            and u.hostname in allowed_hosts
            and u.port in (None, 443)
            and "@" not in u.netloc
        )
    except ValueError:
        return False


async def fetch_certificate_pem(url: str, transport: Optional[httpx.AsyncBaseTransport] = None) -> Optional[bytes]:
    """
    Default fetcher: HTTPS only, no redirects, 5 s timeout, small responses only.
    Returns the PEM, or None when the host answers anything but 200 below 500 (e.g. 404: there is no
    such certificate, so the message is rejected with 401). Raises CertFetchError for network errors
    and 5xx, which are worth retrying (503).
    """
    try:
        async with httpx.AsyncClient(follow_redirects=False, timeout=5.0, transport=transport) as client:
            res = await client.get(url)
    except httpx.HTTPError as exc:
        raise CertFetchError(f"Could not fetch {url}: {exc}") from exc
    if res.status_code >= 500:
        raise CertFetchError(f"Fetching {url} returned HTTP {res.status_code}")
    if res.status_code != 200:
        return None
    if len(res.content) > 64 * 1024:
        raise CertFetchError(f"Certificate at {url} is too large")
    return res.content


class Verifier:
    """
    Verifies envelopes against a trust chain. Validated certificates are cached by URL (Scaleway
    recommends caching and using the URL's unique ID as the key); certificates are rotated at least
    once a year, and during a rotation both the old and new certificate can sign messages.
    """

    def __init__(
        self,
        trust_chain_pem: bytes,
        allowed_cert_hosts: Optional[List[str]] = None,
        fetch_cert: Callable[[str], Awaitable[Optional[bytes]]] = fetch_certificate_pem,
        now: Callable[[], float] = time.time,
    ):
        self.trust_chain = load_trust_chain(trust_chain_pem)
        self.allowed_cert_hosts = allowed_cert_hosts or DEFAULT_CERT_HOSTS
        self.fetch_cert = fetch_cert
        self.now = now
        # Only certificates that chain to the trust chain are cached, so this holds Scaleway's real
        # signing certificates; the cap is a backstop.
        self._cache: Dict[str, x509.Certificate] = {}

    async def _signing_cert(self, url: str) -> Optional[x509.Certificate]:
        cached = self._cache.get(url)
        if cached is not None and chains_to_trusted_root(cached, self.trust_chain, self.now()):
            return cached
        pem = await self.fetch_cert(url)
        if pem is None:
            return None
        try:
            cert = x509.load_pem_x509_certificate(pem if isinstance(pem, bytes) else pem.encode())
        except ValueError:
            return None
        if not isinstance(cert.public_key(), rsa.RSAPublicKey):
            return None
        if not chains_to_trusted_root(cert, self.trust_chain, self.now()):
            return None
        if len(self._cache) >= MAX_CACHED_CERTS:
            self._cache.pop(next(iter(self._cache)))
        self._cache[url] = cert
        return cert

    async def verify(self, msg: Any) -> Tuple[bool, str]:
        """(True, "") or (False, reason). Raises CertFetchError on a network error or 5xx (answer 503)."""
        if not isinstance(msg, dict):
            return False, "not an object"
        if msg.get("SignatureVersion") != "1":
            return False, "unsupported SignatureVersion"
        canonical = canonical_string(msg)
        if canonical is None:
            return False, "missing or non-string signed field"
        signature = msg.get("Signature")
        if not isinstance(signature, str) or not BASE64.fullmatch(signature):
            return False, "malformed Signature"
        cert_url = msg.get("SigningCertURL")
        if not isinstance(cert_url, str) or not allowed_cert_url(cert_url, self.allowed_cert_hosts):
            return False, "SigningCertURL is not an allowed https URL"
        cert = await self._signing_cert(cert_url)
        if cert is None:
            return False, "signing certificate is unavailable or does not chain to the trust chain"
        try:
            raw_signature = base64.b64decode(signature, validate=True)
            cert.public_key().verify(raw_signature, canonical.encode("utf-8"), padding.PKCS1v15(), hashes.SHA1())
        except (InvalidSignature, binascii.Error, ValueError):
            return False, "signature mismatch"
        return True, ""


def is_valid_subscribe_url(msg: Dict[str, Any]) -> bool:
    """
    The checks Hookdeck applies before it GETs a SubscribeURL: https, host sns.mnq.<region>.scaleway.com
    for the TopicArn's region, path "/" (or empty, which URL parsers normalise to "/"), no
    credentials, no port other than the default 443, no fragment, and exactly one Action
    (ConfirmSubscription), TopicArn and Token, matching the message.
    """
    url, token, topic_arn = msg.get("SubscribeURL"), msg.get("Token"), msg.get("TopicArn")
    if not isinstance(url, str) or not isinstance(token, str) or not token or not isinstance(topic_arn, str):
        return False
    match = TOPIC_ARN.fullmatch(topic_arn)
    if not match:
        return False
    try:
        u = urlsplit(url)
        port = u.port
    except ValueError:
        return False
    query = parse_qs(u.query, keep_blank_values=True)

    def one(name: str, expected: str) -> bool:
        return query.get(name) == [expected]

    return (
        u.scheme == "https"
        and u.hostname == f"sns.mnq.{match.group(1)}.scaleway.com"
        and "@" not in u.netloc  # no credentials
        and port in (None, 443)
        and not u.fragment
        and u.path in ("", "/")
        and one("Action", "ConfirmSubscription")
        and one("TopicArn", topic_arn)
        and one("Token", token)
    )


async def confirm_subscription(subscribe_url: str) -> bool:
    """GET the SubscribeURL unchanged; success is HTTP 200. Redirects are not followed."""
    async with httpx.AsyncClient(follow_redirects=False, timeout=5.0) as client:
        res = await client.get(subscribe_url)
    return res.status_code == 200
