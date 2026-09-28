# Generated with: docker-hub-webhooks skill
# https://github.com/hookdeck/webhook-skills
import copy
from typing import Any, Dict

import httpx
import pytest
from fastapi.testclient import TestClient

from main import app, parse_push, summarize_dhi_metadata, verify_url_token

# Docker Hub webhooks are UNSIGNED, so there are no signatures to generate here
# — the only credential is the token we put in the URL ourselves.
TOKEN = "a3f1c9d47e2b8065f1a94c3e7d20b85fa61c94d8e0372b5c18af6d29e4b703c15"
WRONG_TOKEN = "b3f1c9d47e2b8065f1a94c3e7d20b85fa61c94d8e0372b5c18af6d29e4b703c15"
PATH = f"/webhooks/docker-hub/{TOKEN}"

client = TestClient(app)

# The documented example payload, verbatim from
# https://docs.docker.com/docker-hub/repos/manage/webhooks/
# (including the legacy `callback_url` field, which handlers must tolerate).
DOCUMENTED_PAYLOAD: Dict[str, Any] = {
    "callback_url": (
        "https://registry.hub.docker.com/u/svendowideit/testhook/hook/"
        "2141b5bi5i5b02bec211i4eeih0242eg11000a/"
    ),
    "push_data": {
        "pushed_at": 1417566161,
        "pusher": "trustedbuilder",
        "tag": "latest",
    },
    "repository": {
        "comment_count": 0,
        "date_created": 1417494799,
        "description": "",
        "dockerfile": "#\n# BUILD ...",
        "full_description": "Docker Hub based automated build from a GitHub repo",
        "is_official": False,
        "is_private": True,
        "is_trusted": True,
        "name": "testhook",
        "namespace": "svendowideit",
        "owner": "svendowideit",
        "repo_name": "svendowideit/testhook",
        "repo_url": "https://registry.hub.docker.com/u/svendowideit/testhook/",
        "star_count": 0,
        "status": "Active",
    },
}

# A mirrored Docker Hardened Image push: the standard payload plus a top-level
# `dhi_metadata` MAP KEYED BY ARCHITECTURE-SPECIFIC MANIFEST DIGEST. Two entries
# here, because a multi-platform push has one per platform.
DHI_DIGEST_A = "sha256:04639747b6d72bcf1d0322f2a5b122ee76d963e31bb4a070891b25f15a5001c5"
DHI_DIGEST_B = "sha256:2982980b6bb3cdedafa9377bcc37405c20ed48702deef11faf13ec99d596057d"


def documented_payload() -> Dict[str, Any]:
    return copy.deepcopy(DOCUMENTED_PAYLOAD)


def dhi_payload() -> Dict[str, Any]:
    payload = documented_payload()
    payload["repository"]["namespace"] = "my-org"
    payload["repository"]["name"] = "dhi-python"
    payload["repository"]["repo_name"] = "my-org/dhi-python"
    payload["push_data"]["tag"] = "3-fips-dev"
    payload["dhi_metadata"] = {
        DHI_DIGEST_A: {
            "schema_version": 1,
            "change_categories": ["vulnerability_fix", "version_upgrade"],
            "previous_version": {
                "tag": "2-compat-fips-dev",
                "digest": (
                    "sha256:1738aa35838f520431c898b85d7cd60da71d8f997965287db4f3be27c1df32a1"
                ),
            },
            "changes": {
                "vulnerabilities_fixed": [
                    {
                        "cve_id": "CVE-2019-9192",
                        "severity": "low",
                        "package": "glibc",
                        "fixed_in_version": "2.41-12+deb13u4+dhi0",
                    },
                    {
                        "cve_id": "CVE-2018-20796",
                        "severity": "low",
                        "package": "glibc",
                        "fixed_in_version": "2.41-12+deb13u4+dhi0",
                    },
                ],
                "packages_updated": [
                    {
                        "name": "glibc",
                        "type": "deb",
                        "old_version": "2.41-12+deb13u4",
                        "new_version": "2.41-12+deb13u4+dhi0",
                    }
                ],
                "packages_added": [],
                "packages_removed": [],
                "environment_variables_changed": [],
                "labels_changed": [
                    {
                        "change": "changed",
                        "key": "com.docker.dhi.chain-id",
                        "from_value": (
                            "sha256:4567092c648d813b8c4c60c7d100fc34df817dd5cb4c7968e9a5c43bafb9e7a5"
                        ),
                        "to_value": (
                            "sha256:62d4e2090951e812a87fb599db362677f72dee095f85889ea56df63c0999b02a"
                        ),
                    }
                ],
                "configuration_changed": [],
            },
        },
        DHI_DIGEST_B: {
            "schema_version": 1,
            "change_categories": ["version_upgrade"],
            "previous_version": {
                "tag": "5-fips-dev",
                "digest": (
                    "sha256:81355a1301ecc5f78dd87b68a284642d7b6bfbd86f3a37f3932fad7ecf1141e6"
                ),
            },
            "changes": {
                "vulnerabilities_fixed": [],
                "packages_updated": [
                    {
                        "name": "sqlite3",
                        "type": "deb",
                        "old_version": "3.46.1-7+deb13u2+dhi0",
                        "new_version": "3.46.1-7+deb13u2+dhi1",
                    }
                ],
                "packages_added": [],
                "packages_removed": [],
                "environment_variables_changed": [],
                "labels_changed": [],
                "configuration_changed": [],
            },
        },
    }
    return payload


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("DOCKER_HUB_WEBHOOK_TOKEN", TOKEN)
    monkeypatch.delenv("DOCKER_HUB_ALLOWED_REPOS", raising=False)
    monkeypatch.delenv("DOCKER_HUB_API_TOKEN", raising=False)
    return monkeypatch


@pytest.fixture(autouse=True)
def no_outbound_requests(monkeypatch):
    """
    Any outbound HTTP at all is a failure: not to the legacy callback_url, and
    not to the Hub API (DOCKER_HUB_API_TOKEN is unset in these tests).
    """
    calls = []

    async def fail(*args, **kwargs):
        calls.append((args, kwargs))
        raise AssertionError("handler must not make outbound requests in these tests")

    monkeypatch.setattr(httpx.AsyncClient, "request", fail)
    monkeypatch.setattr(httpx.AsyncClient, "get", fail)
    return calls


# --- URL token (there is no signature to verify) ----------------------------


def test_accepts_documented_payload_with_correct_token(capsys):
    response = client.post(PATH, json=documented_payload())

    assert response.status_code == 200
    assert response.json() == {"received": True}
    assert "Docker Hub push: svendowideit/testhook:latest by trustedbuilder" in capsys.readouterr().out


def test_rejects_wrong_token_with_401():
    response = client.post(f"/webhooks/docker-hub/{WRONG_TOKEN}", json=documented_payload())

    assert response.status_code == 401
    assert response.json() == {"error": "Invalid token"}


def test_rejects_token_of_different_length_with_401():
    # compare_digest handles the length mismatch without raising.
    response = client.post("/webhooks/docker-hub/short", json=documented_payload())

    assert response.status_code == 401


def test_fails_closed_with_500_when_token_env_var_unset(env, capsys):
    env.delenv("DOCKER_HUB_WEBHOOK_TOKEN", raising=False)

    response = client.post(PATH, json=documented_payload())

    assert response.status_code == 500
    assert response.json() == {"error": "Webhook token not configured"}
    # Never silently accepted, and never processed.
    assert "Docker Hub push:" not in capsys.readouterr().out


def test_verify_url_token_returns_none_when_unconfigured():
    assert verify_url_token(TOKEN, "") is None
    assert verify_url_token(TOKEN, None) is None
    assert verify_url_token(TOKEN, TOKEN) is True
    assert verify_url_token(WRONG_TOKEN, TOKEN) is False
    assert verify_url_token(None, TOKEN) is False


# --- payload validation ------------------------------------------------------


def test_rejects_invalid_json_with_400():
    response = client.post(
        PATH,
        content=b'{"push_data": ',
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 400
    assert response.json() == {"error": "Invalid JSON"}


def test_rejects_missing_push_data_tag_with_400():
    payload = documented_payload()
    del payload["push_data"]["tag"]

    response = client.post(PATH, json=payload)

    assert response.status_code == 400
    assert response.json() == {"error": "missing or invalid push_data.tag"}


def test_rejects_missing_repo_name_with_400():
    payload = documented_payload()
    del payload["repository"]["repo_name"]

    response = client.post(PATH, json=payload)

    assert response.status_code == 400
    assert response.json() == {"error": "missing or invalid repository.repo_name"}


def test_rejects_payload_with_no_push_data_with_400():
    response = client.post(PATH, json={"repository": {"repo_name": "a/b"}})

    assert response.status_code == 400
    assert response.json() == {"error": "missing push_data"}


def test_accepts_payload_omitting_every_optional_field(capsys):
    response = client.post(
        PATH,
        json={"push_data": {"tag": "v1"}, "repository": {"repo_name": "myorg/myapp"}},
    )

    assert response.status_code == 200
    assert "Docker Hub push: myorg/myapp:v1 by unknown" in capsys.readouterr().out


def test_parse_push_reads_pushed_at_as_unix_seconds_and_ignores_unknown_fields():
    payload = documented_payload()
    payload["some_future_field"] = {"nested": True}

    parsed, error = parse_push(payload)

    assert error is None
    assert parsed == {
        "tag": "latest",
        "repo_name": "svendowideit/testhook",
        "pusher": "trustedbuilder",
        "pushed_at": 1417566161,
    }


# --- repository allowlist ----------------------------------------------------


def test_rejects_repo_outside_allowlist_with_403(env):
    env.setenv("DOCKER_HUB_ALLOWED_REPOS", "myorg/myapp, myorg/dhi-python")

    response = client.post(PATH, json=documented_payload())

    assert response.status_code == 403
    assert response.json() == {"error": "Repository not allowed"}


def test_accepts_repo_in_allowlist(env):
    env.setenv("DOCKER_HUB_ALLOWED_REPOS", "myorg/myapp, svendowideit/testhook")

    response = client.post(PATH, json=documented_payload())

    assert response.status_code == 200


# --- dhi_metadata (mirrored Docker Hardened Image repositories) --------------


def test_summarizes_every_architecture_entry_of_two_arch_payload(capsys):
    response = client.post(PATH, json=dhi_payload())

    assert response.status_code == 200
    out = capsys.readouterr().out
    assert "Docker Hub push: my-org/dhi-python:3-fips-dev by trustedbuilder" in out

    # One log line per digest key — NOT a single entry.
    assert (
        f"  DHI {DHI_DIGEST_A}: [vulnerability_fix, version_upgrade] "
        "2 CVE(s) fixed, 1 package(s) updated, previous tag 2-compat-fips-dev"
    ) in out
    assert (
        f"  DHI {DHI_DIGEST_B}: [version_upgrade] "
        "0 CVE(s) fixed, 1 package(s) updated, previous tag 5-fips-dev"
    ) in out


def test_summarize_dhi_metadata_returns_one_entry_per_digest_key():
    summary = summarize_dhi_metadata(dhi_payload()["dhi_metadata"])

    assert len(summary) == 2
    assert summary[0] == {
        "digest": DHI_DIGEST_A,
        "schema_version": 1,
        "categories": ["vulnerability_fix", "version_upgrade"],
        "previous_tag": "2-compat-fips-dev",
        "vulnerabilities_fixed": 2,
        "packages_updated": 1,
    }
    assert summary[1]["vulnerabilities_fixed"] == 0


def test_handles_empty_change_categories():
    summary = summarize_dhi_metadata(
        {
            "sha256:abc": {
                "schema_version": 1,
                "change_categories": [],
                "previous_version": {"tag": "v1", "digest": "sha256:def"},
                "changes": {
                    "vulnerabilities_fixed": [],
                    "packages_updated": [],
                    "packages_added": [],
                    "packages_removed": [],
                    "environment_variables_changed": [],
                    "labels_changed": [],
                    "configuration_changed": [],
                },
            }
        }
    )

    assert summary == [
        {
            "digest": "sha256:abc",
            "schema_version": 1,
            "categories": [],
            "previous_tag": "v1",
            "vulnerabilities_fixed": 0,
            "packages_updated": 0,
        }
    ]


def test_standard_payload_has_no_dhi_entries(capsys):
    response = client.post(PATH, json=documented_payload())

    assert response.status_code == 200
    assert summarize_dhi_metadata(None) == []
    assert "DHI sha256:" not in capsys.readouterr().out


# --- legacy callback_url -----------------------------------------------------


def test_never_calls_callback_url(no_outbound_requests):
    """The callback_url field is legacy and no longer supported — never POST to it."""
    response = client.post(PATH, json=documented_payload())

    assert response.status_code == 200
    # No outbound request of any kind: not to callback_url, and not to the Hub
    # API (DOCKER_HUB_API_TOKEN is unset).
    assert no_outbound_requests == []


# --- health ------------------------------------------------------------------


def test_health():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
