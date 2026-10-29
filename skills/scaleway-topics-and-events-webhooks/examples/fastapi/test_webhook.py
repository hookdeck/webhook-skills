import base64
import datetime as dt
import json
import logging
import os
import tempfile
from urllib.parse import urlencode

import asyncio

import httpx
import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.x509.oid import NameOID
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------------------------
# Test-only PKI that mirrors Scaleway's layout: a self-signed root and an intermediate CA in the
# trust-chain bundle, and a leaf signing certificate published at SigningCertURL. Nothing here is a
# real Scaleway certificate, and no test touches the network.
# ---------------------------------------------------------------------------------------------
NOW = dt.datetime.now(dt.timezone.utc)


def _key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _cert(cn, key, issuer_cn, issuer_key, ca, not_before=None, not_after=None):
    builder = (
        x509.CertificateBuilder()
        .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, cn)]))
        .issuer_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, issuer_cn)]))
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(not_before or NOW - dt.timedelta(days=1))
        .not_valid_after(not_after or NOW + dt.timedelta(days=365))
        .add_extension(x509.BasicConstraints(ca=ca, path_length=None), critical=True)
    )
    return builder.sign(issuer_key, hashes.SHA256()).public_bytes(serialization.Encoding.PEM)


ROOT_KEY, INTERMEDIATE_KEY, LEAF_KEY, ROGUE_KEY = _key(), _key(), _key(), _key()
ROOT = _cert("Test MnQ Root", ROOT_KEY, "Test MnQ Root", ROOT_KEY, ca=True)
INTERMEDIATE = _cert("Test MnQ", INTERMEDIATE_KEY, "Test MnQ Root", ROOT_KEY, ca=True)
LEAF = _cert("sns.mnq.test", LEAF_KEY, "Test MnQ", INTERMEDIATE_KEY, ca=False)
EXPIRED_LEAF = _cert(
    "sns.mnq.test", LEAF_KEY, "Test MnQ", INTERMEDIATE_KEY, ca=False,
    not_before=NOW - dt.timedelta(days=3), not_after=NOW - dt.timedelta(days=1),
)
# Same names as the real chain, signed by a different key: must not be trusted
ROGUE_LEAF = _cert("sns.mnq.test", ROGUE_KEY, "Test MnQ", ROGUE_KEY, ca=False)
SELF_SIGNED_LEAF = _cert("sns.mnq.test", LEAF_KEY, "sns.mnq.test", LEAF_KEY, ca=False)
# Issued by the leaf, which is not a CA
CHILD_OF_LEAF = _cert("child", ROGUE_KEY, "sns.mnq.test", LEAF_KEY, ca=False)
TRUST_CHAIN = ROOT + INTERMEDIATE

# The module-level app reads the trust chain from this path at import time
_chain_file = tempfile.NamedTemporaryFile(prefix="sns-trust-chain-", suffix=".pem", delete=False)
_chain_file.write(TRUST_CHAIN)
_chain_file.close()
os.environ["SCALEWAY_SNS_TRUST_CHAIN_PATH"] = _chain_file.name

from main import create_app  # noqa: E402
from scaleway_sns import (  # noqa: E402
    CertFetchError,
    allowed_cert_url,
    canonical_string,
    fetch_certificate_pem,
    is_valid_subscribe_url,
)

CERT_HOST = "messaging.s3.fr-par.scw.cloud"
CERT_URL = f"https://{CERT_HOST}/fr-par/sns/sns_certificate_01.crt"
TOPIC_ARN = "arn:scw:sns:fr-par:project-1234:orders"
TOKEN = "subscription-token+/="
SUBSCRIBE_URL = "https://sns.mnq.fr-par.scaleway.com/?" + urlencode(
    {"Action": "ConfirmSubscription", "TopicArn": TOPIC_ARN, "Token": TOKEN}
)

CERTS = {
    CERT_URL: LEAF,
    f"https://{CERT_HOST}/fr-par/sns/expired.crt": EXPIRED_LEAF,
    f"https://{CERT_HOST}/fr-par/sns/rogue.crt": ROGUE_LEAF,
    f"https://{CERT_HOST}/fr-par/sns/self-signed.crt": SELF_SIGNED_LEAF,
    f"https://{CERT_HOST}/fr-par/sns/child.crt": CHILD_OF_LEAF,
    f"https://{CERT_HOST}/fr-par/sns/garbage.crt": b"not a certificate",
    # The host answered 4xx: the default fetcher returns None
    f"https://{CERT_HOST}/fr-par/sns/missing.crt": None,
}

SIGNED_FIELDS = {
    "Notification": ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"],
    "SubscriptionConfirmation": ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
    "UnsubscribeConfirmation": ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
}


def signed(msg, key=LEAF_KEY):
    """Sign an envelope the way SNS SignatureVersion 1 does: RSA-SHA1 over "Key\\nValue\\n" pairs."""
    canonical = "".join(f"{k}\n{msg[k]}\n" for k in SIGNED_FIELDS[msg["Type"]] if msg.get(k) is not None)
    signature = key.sign(canonical.encode("utf-8"), padding.PKCS1v15(), hashes.SHA1())
    return {**msg, "Signature": base64.b64encode(signature).decode()}


def iso_now(delta_seconds=0):
    return (dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=delta_seconds)).strftime("%Y-%m-%dT%H:%M:%S.%fZ")[:-4] + "Z"


def notification(**overrides):
    msg = {
        "Type": "Notification",
        "MessageId": "b3b0c1e2-0000-4000-8000-000000000001",
        "TopicArn": TOPIC_ARN,
        "Subject": "order.created",
        "Message": json.dumps({"order_id": "ord_123", "total": 4200}),
        "Timestamp": iso_now(),
        "SignatureVersion": "1",
        "SigningCertURL": CERT_URL,
        "UnsubscribeURL": f"https://sns.mnq.fr-par.scaleway.com/?Action=Unsubscribe&SubscriptionArn={TOPIC_ARN}:sub",
    }
    msg.update(overrides)
    return {k: v for k, v in msg.items() if v is not None}


def confirmation(**overrides):
    """Shape of Scaleway's documented SubscriptionConfirmation."""
    msg = {
        "Type": "SubscriptionConfirmation",
        "Token": TOKEN,
        "MessageId": "b3b0c1e2-0000-4000-8000-000000000002",
        "TopicArn": TOPIC_ARN,
        "Message": f"You have chosen to subscribe to the topic {TOPIC_ARN}.\n"
        "To confirm the subscription, visit the SubscribeURL included in this message.",
        "Timestamp": iso_now(),
        "SignatureVersion": "1",
        "SigningCertURL": CERT_URL,
        "SubscribeURL": SUBSCRIBE_URL,
    }
    msg.update(overrides)
    return msg


class Fakes:
    def __init__(self):
        self.fetches = []
        self.confirms = []
        self.confirm_result = True
        self.fetch_error = None

    async def fetch_cert(self, url):
        self.fetches.append(url)
        if self.fetch_error:
            raise self.fetch_error
        if url not in CERTS:
            raise AssertionError(f"unexpected fetch {url}")
        return CERTS[url]

    async def confirm(self, url):
        self.confirms.append(url)
        if isinstance(self.confirm_result, Exception):
            raise self.confirm_result
        return self.confirm_result


@pytest.fixture
def fakes():
    return Fakes()


@pytest.fixture
def make_client(fakes, caplog):
    caplog.set_level(logging.INFO, logger="scaleway-topics-and-events-webhooks")

    def build(**kwargs):
        app = create_app(trust_chain_pem=TRUST_CHAIN, fetch_cert=fakes.fetch_cert, confirm=fakes.confirm, **kwargs)
        return TestClient(app)

    return build


def post(client, body, message_type=None):
    headers = {"content-type": "text/plain; charset=UTF-8"}
    if message_type:
        headers["x-amz-sns-message-type"] = message_type
    content = body if isinstance(body, (str, bytes)) else json.dumps(body)
    return client.post("/webhooks/scaleway-topics-and-events", content=content, headers=headers)


class TestCanonicalString:
    def test_notification_fields_in_byte_order_without_subject(self):
        msg = {"Type": "Notification", "Message": "hi", "MessageId": "m", "Timestamp": "t", "TopicArn": "a"}
        assert canonical_string(msg) == "Message\nhi\nMessageId\nm\nTimestamp\nt\nTopicArn\na\nType\nNotification\n"

    def test_confirmation_includes_subscribe_url_and_token(self):
        s = canonical_string(confirmation())
        assert f"SubscribeURL\n{SUBSCRIBE_URL}\n" in s and f"Token\n{TOKEN}\n" in s

    def test_null_subject_is_absent(self):
        with_null = {**notification(), "Subject": None}
        without = {k: v for k, v in notification().items() if k != "Subject"}
        assert canonical_string(with_null) == canonical_string(without)

    @pytest.mark.parametrize("type_", ["constructor", "toString", "__proto__", "__class__", "get"])
    def test_prototype_like_types(self, type_):
        assert canonical_string({**notification(), "Type": type_}) is None

    def test_unknown_type_or_non_string_field(self):
        assert canonical_string({"Type": "Other"}) is None
        assert canonical_string(notification(Message={"a": 1})) is None
        msg = notification()
        del msg["MessageId"]
        assert canonical_string(msg) is None


class TestSubscribeUrl:
    def test_documented_form_fr_par_and_nl_ams(self):
        assert is_valid_subscribe_url(confirmation())
        arn = "arn:scw:sns:nl-ams:project-1234:orders"
        url = "https://sns.mnq.nl-ams.scaleway.com/?" + urlencode(
            {"Action": "ConfirmSubscription", "TopicArn": arn, "Token": TOKEN}
        )
        assert is_valid_subscribe_url(confirmation(TopicArn=arn, SubscribeURL=url))

    @pytest.mark.parametrize(
        "url",
        [
            SUBSCRIBE_URL.replace("sns.mnq.fr-par.scaleway.com", "example.com"),
            SUBSCRIBE_URL.replace("scaleway.com/", "scaleway.com.example.com/"),
            SUBSCRIBE_URL.replace("fr-par.scaleway", "nl-ams.scaleway"),
            SUBSCRIBE_URL.replace("https://", "http://"),
            SUBSCRIBE_URL.replace("https://", "https://user:pass@"),
            SUBSCRIBE_URL.replace("scaleway.com/", "scaleway.com:8443/"),
            SUBSCRIBE_URL.replace(".com/?", ".com/other?"),
            SUBSCRIBE_URL + "#fragment",
            SUBSCRIBE_URL.replace("ConfirmSubscription", "Unsubscribe"),
            SUBSCRIBE_URL + "&Token=other",
            SUBSCRIBE_URL + "&TopicArn=other",
            "https://sns.mnq.fr-par.scaleway.com/?Action=ConfirmSubscription&TopicArn=" + TOPIC_ARN,
            "not a url",
        ],
        ids=[
            "host", "host-suffix", "region", "http", "credentials", "port", "path", "fragment",
            "action", "duplicate-token", "duplicate-topic", "no-token", "garbage",
        ],
    )
    def test_rejects(self, url):
        assert not is_valid_subscribe_url(confirmation(SubscribeURL=url))

    @pytest.mark.parametrize(
        "url",
        [SUBSCRIBE_URL.replace(".com/?", ".com?"), SUBSCRIBE_URL.replace(".com/", ".com:443/")],
        ids=["no-path", "default-port"],
    )
    def test_accepts_what_hookdeck_accepts(self, url):
        assert is_valid_subscribe_url(confirmation(SubscribeURL=url))

    def test_rejects_aws_or_unsupported_region_arn(self):
        assert not is_valid_subscribe_url(confirmation(TopicArn="arn:aws:sns:fr-par:p:t"))
        assert not is_valid_subscribe_url(confirmation(TopicArn="arn:scw:sns:pl-waw:p:t"))


class TestAllowedCertUrl:
    def test_accepts_https_on_allowed_host(self):
        assert allowed_cert_url(CERT_URL, [CERT_HOST])

    @pytest.mark.parametrize(
        "url",
        [
            CERT_URL + "?x=1",
            CERT_URL + "?",
            CERT_URL + "#x",
            CERT_URL + "#",
            f"https://{CERT_HOST}:8443/c.crt",
            CERT_URL.replace("https", "http"),
            "https://example.com/c.crt",
            f"https://u:p@{CERT_HOST}/c.crt",
            "not a url",
        ],
        ids=["query", "empty-query", "fragment", "empty-fragment", "port", "http", "host", "credentials", "garbage"],
    )
    def test_rejects(self, url):
        assert not allowed_cert_url(url, [CERT_HOST])


class TestDefaultFetcher:
    @staticmethod
    def fetch(status=None, exc=None, body=b"pem"):
        seen = []

        def handler(request):
            seen.append(request)
            if exc:
                raise exc
            return httpx.Response(status, content=body)

        result = asyncio.run(fetch_certificate_pem(CERT_URL, transport=httpx.MockTransport(handler)))
        return result, seen

    def test_returns_body_on_200(self):
        assert self.fetch(200, body=LEAF)[0] == LEAF

    @pytest.mark.parametrize("status", [404, 403, 302])
    def test_returns_none_on_non_200_below_500(self, status):
        assert self.fetch(status)[0] is None

    @pytest.mark.parametrize("status", [500, 503])
    def test_raises_on_5xx(self, status):
        with pytest.raises(CertFetchError):
            self.fetch(status)

    def test_raises_on_network_error(self):
        with pytest.raises(CertFetchError):
            self.fetch(exc=httpx.ConnectError("down"))


class TestWebhook:
    def test_warns_without_topic_arns(self, make_client, caplog):
        make_client(topic_arns=[])
        assert "SCALEWAY_SNS_TOPIC_ARNS is not set" in caplog.text

    def test_no_warning_with_topic_arns(self, make_client, caplog):
        make_client(topic_arns=[TOPIC_ARN])
        assert "SCALEWAY_SNS_TOPIC_ARNS is not set" not in caplog.text

    def test_null_subject_is_accepted(self, make_client):
        msg = signed({**notification(), "Subject": None})
        assert msg["Subject"] is None
        assert post(make_client(), msg).status_code == 200

    @pytest.mark.parametrize("type_", ["constructor", "toString", "__proto__", "__class__"])
    def test_prototype_like_type_is_401(self, make_client, fakes, type_):
        assert post(make_client(), {**notification(), "Type": type_, "Signature": "AAAA"}).status_code == 401
        assert fakes.fetches == []

    def test_cert_url_4xx_is_401(self, make_client):
        msg = signed(notification(SigningCertURL=f"https://{CERT_HOST}/fr-par/sns/missing.crt"))
        assert post(make_client(), msg).status_code == 401

    @pytest.mark.parametrize("url", [CERT_URL + "?v=1", CERT_URL + "#x"], ids=["query", "fragment"])
    def test_cert_url_with_query_or_fragment_is_401_without_fetch(self, make_client, fakes, url):
        assert post(make_client(), signed(notification(SigningCertURL=url))).status_code == 401
        assert fakes.fetches == []

    def test_signed_notification(self, make_client, caplog):
        res = post(make_client(), signed(notification()), "Notification")
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "(subject: order.created): JSON object" in caplog.text

    def test_notification_without_subject_and_plain_text(self, make_client, caplog):
        res = post(make_client(), signed(notification(Subject=None, Message="hello")))
        assert res.status_code == 200
        assert ": str" in caplog.text

    def test_non_ascii_message(self, make_client):
        assert post(make_client(), signed(notification(Message="Commande validée ✓"))).status_code == 200

    def test_caches_certificate(self, make_client, fakes):
        client = make_client()
        post(client, signed(notification()))
        post(client, signed(notification(MessageId="another")))
        assert fakes.fetches == [CERT_URL]

    def test_confirms_subscription(self, make_client, fakes):
        res = post(make_client(), signed(confirmation()), "SubscriptionConfirmation")
        assert res.status_code == 200
        assert res.json() == {"confirmed": True}
        assert fakes.confirms == [SUBSCRIBE_URL]

    def test_confirmation_not_200_is_502(self, make_client, fakes):
        fakes.confirm_result = False
        assert post(make_client(), signed(confirmation())).status_code == 502

    def test_confirmation_error_is_502(self, make_client, fakes):
        fakes.confirm_result = RuntimeError("timeout")
        assert post(make_client(), signed(confirmation())).status_code == 502

    def test_does_not_confirm_unexpected_subscribe_url(self, make_client, fakes):
        msg = signed(confirmation(SubscribeURL="https://example.com/?Action=ConfirmSubscription"))
        assert post(make_client(), msg).status_code == 400
        assert fakes.confirms == []

    def test_unsubscribe_confirmation(self, make_client):
        assert post(make_client(), signed(confirmation(Type="UnsubscribeConfirmation"))).status_code == 200

    def test_routes_on_signed_type_not_header(self, make_client, fakes):
        res = post(make_client(), signed(notification()), "SubscriptionConfirmation")
        assert res.json() == {"received": True}
        assert fakes.confirms == []

    @pytest.mark.parametrize(
        "build",
        [
            lambda: {**signed(notification()), "Message": '{"order_id":"ord_999"}'},
            lambda: {**signed(notification()), "Subject": "order.refunded"},
            lambda: {k: v for k, v in signed(notification()).items() if k != "Subject"},
            lambda: {**signed(notification()), "Type": "UnsubscribeConfirmation"},
            lambda: {**signed(confirmation()), "SubscribeURL": SUBSCRIBE_URL + "&x=1"},
            lambda: {**signed(confirmation()), "Token": "other"},
            lambda: signed(notification(), ROGUE_KEY),
            lambda: notification(),
            lambda: {**signed(notification()), "Signature": "!!!"},
            lambda: signed(notification(SignatureVersion="2")),
            lambda: signed(notification(SignatureVersion=1)),
            lambda: signed(notification(SigningCertURL=CERT_URL.replace("https", "http"))),
            lambda: signed(notification(SigningCertURL="https://evil.example/cert.crt")),
            lambda: signed(notification(SigningCertURL=f"https://{CERT_HOST}.evil.example/c.crt")),
            lambda: signed(notification(SigningCertURL=f"https://u:p@{CERT_HOST}/c.crt")),
            lambda: signed(notification(SigningCertURL=f"https://{CERT_HOST}/fr-par/sns/rogue.crt"), ROGUE_KEY),
            lambda: signed(notification(SigningCertURL=f"https://{CERT_HOST}/fr-par/sns/self-signed.crt")),
            lambda: signed(notification(SigningCertURL=f"https://{CERT_HOST}/fr-par/sns/child.crt"), ROGUE_KEY),
            lambda: signed(notification(SigningCertURL=f"https://{CERT_HOST}/fr-par/sns/expired.crt")),
            lambda: signed(notification(SigningCertURL=f"https://{CERT_HOST}/fr-par/sns/garbage.crt")),
            lambda: {**signed(notification()), "Message": {"a": 1}},
            lambda: {**notification(), "Type": "Other", "Signature": "AAAA"},
        ],
        ids=[
            "tampered-message", "tampered-subject", "removed-subject", "tampered-type",
            "tampered-subscribe-url", "tampered-token", "other-key", "missing-signature",
            "non-base64-signature", "signature-version-2", "numeric-signature-version",
            "http-cert-url", "other-cert-host", "cert-host-suffix", "cert-url-credentials",
            "other-ca", "self-signed-cert", "cert-issued-by-non-ca", "expired-cert",
            "unparseable-cert", "non-string-message", "unknown-type",
        ],
    )
    def test_rejects_with_401(self, make_client, build):
        assert post(make_client(), build()).status_code == 401

    def test_unsigned_confirmation_is_never_confirmed(self, make_client, fakes):
        assert post(make_client(), confirmation(), "SubscriptionConfirmation").status_code == 401
        assert fakes.confirms == []

    def test_cert_fetch_failure_is_503(self, make_client, fakes):
        fakes.fetch_error = CertFetchError("network down")
        assert post(make_client(), signed(notification())).status_code == 503

    @pytest.mark.parametrize("body", ["not json", "[]", "null", '"Notification"', "", b"\xff\xfe"])
    def test_non_envelope_is_400(self, make_client, body):
        assert post(make_client(), body).status_code == 400

    def test_unexpected_topic_is_403(self, make_client, fakes):
        client = make_client(topic_arns=["arn:scw:sns:fr-par:project-1234:other"])
        assert post(client, signed(notification())).status_code == 403
        assert post(client, signed(confirmation())).status_code == 403
        assert fakes.confirms == []

    def test_allowed_topic(self, make_client):
        assert post(make_client(topic_arns=[TOPIC_ARN]), signed(notification())).status_code == 200

    def test_no_timestamp_window_by_default(self, make_client):
        assert post(make_client(), signed(notification(Timestamp="2022-06-29T10:03:34Z"))).status_code == 200

    def test_opt_in_timestamp_window(self, make_client):
        client = make_client(max_age_seconds=300)
        assert post(client, signed(notification(Timestamp=iso_now(-3600)))).status_code == 401
        assert post(client, signed(notification())).status_code == 200

    def test_module_level_app_uses_environment(self):
        import main

        assert main.app is not None
        assert any(getattr(r, "path", None) == "/webhooks/scaleway-topics-and-events" for r in main.app.routes)


def teardown_module():
    os.unlink(_chain_file.name)
