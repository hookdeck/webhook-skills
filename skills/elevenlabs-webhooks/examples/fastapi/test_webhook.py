import os
import json
import hmac
import hashlib
import time
import pytest

# Set test environment variables BEFORE importing the app
os.environ['ELEVENLABS_WEBHOOK_SECRET'] = 'test_webhook_secret'

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def generate_test_signature(payload: str, secret: str, timestamp: int = None) -> dict:
    """Generate a test signature matching ElevenLabs format"""
    ts = timestamp or int(time.time())
    signed_payload = f"{ts}.{payload}"
    signature = hmac.new(
        secret.encode(),
        signed_payload.encode(),
        hashlib.sha256
    ).hexdigest()
    return {
        'header': f"t={ts},v0={signature}",
        'timestamp': ts
    }


class TestElevenLabsWebhookHandler:
    def test_health_check(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_valid_webhook_signature(self):
        payload = json.dumps({
            "type": "post_call_transcription",
            "data": {
                "call_id": "test_call_123",
                "transcript": {
                    "text": "Test transcription",
                    "segments": []
                }
            },
            "event_timestamp": "2024-01-20T10:30:00Z"
        })

        sig_data = generate_test_signature(payload, os.environ['ELEVENLABS_WEBHOOK_SECRET'])

        response = client.post(
            "/webhooks/elevenlabs",
            content=payload,
            headers={
                "ElevenLabs-Signature": sig_data['header'],
                "Content-Type": "application/json"
            }
        )

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_invalid_webhook_signature(self):
        payload = json.dumps({
            "type": "post_call_transcription",
            "data": {"call_id": "test_call_123"},
            "event_timestamp": "2024-01-20T10:30:00Z"
        })

        response = client.post(
            "/webhooks/elevenlabs",
            content=payload,
            headers={
                "ElevenLabs-Signature": "t=123456,v0=invalid_signature",
                "Content-Type": "application/json"
            }
        )

        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_missing_signature_header(self):
        payload = json.dumps({
            "type": "post_call_transcription",
            "data": {"call_id": "test_call_123"},
            "event_timestamp": "2024-01-20T10:30:00Z"
        })

        response = client.post(
            "/webhooks/elevenlabs",
            content=payload,
            headers={"Content-Type": "application/json"}
        )

        assert response.status_code == 400
        assert "Missing signature header" in response.json()["detail"]

    def test_expired_timestamp(self):
        payload = json.dumps({
            "type": "post_call_transcription",
            "data": {"call_id": "test_call_123"},
            "event_timestamp": "2024-01-20T10:30:00Z"
        })

        # Create signature with timestamp 40 minutes ago
        old_timestamp = int(time.time()) - 2400
        sig_data = generate_test_signature(
            payload,
            os.environ['ELEVENLABS_WEBHOOK_SECRET'],
            old_timestamp
        )

        response = client.post(
            "/webhooks/elevenlabs",
            content=payload,
            headers={
                "ElevenLabs-Signature": sig_data['header'],
                "Content-Type": "application/json"
            }
        )

        assert response.status_code == 400
        assert "Invalid signature" in response.json()["detail"]

    def test_lowercase_signature_header(self):
        payload = json.dumps({
            "type": "voice_removed",
            "data": {"voice_id": "test_voice_456"},
            "event_timestamp": "2024-01-20T10:30:00Z"
        })

        sig_data = generate_test_signature(payload, os.environ['ELEVENLABS_WEBHOOK_SECRET'])

        response = client.post(
            "/webhooks/elevenlabs",
            content=payload,
            headers={
                "elevenlabs-signature": sig_data['header'],  # lowercase header
                "Content-Type": "application/json"
            }
        )

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_multiple_signatures_in_header(self):
        payload = json.dumps({
            "type": "voice_removal_notice",
            "data": {"voice_id": "test_voice_789"},
            "event_timestamp": "2024-01-20T10:30:00Z"
        })

        sig_data = generate_test_signature(payload, os.environ['ELEVENLABS_WEBHOOK_SECRET'])
        # Add an invalid signature to the header
        multi_sig_header = f"{sig_data['header']},v0=invalid_signature_here"

        response = client.post(
            "/webhooks/elevenlabs",
            content=payload,
            headers={
                "ElevenLabs-Signature": multi_sig_header,
                "Content-Type": "application/json"
            }
        )

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_all_event_types(self):
        event_types = [
            "post_call_transcription",
            "voice_removal_notice",
            "voice_removal_notice_withdrawn",
            "voice_removed"
        ]

        for event_type in event_types:
            payload = json.dumps({
                "type": event_type,
                "data": {"test_id": f"test_{event_type}"},
                "event_timestamp": "2024-01-20T10:30:00Z"
            })

            sig_data = generate_test_signature(payload, os.environ['ELEVENLABS_WEBHOOK_SECRET'])

            response = client.post(
                "/webhooks/elevenlabs",
                content=payload,
                headers={
                    "ElevenLabs-Signature": sig_data['header'],
                    "Content-Type": "application/json"
                }
            )

            assert response.status_code == 200
            assert response.json() == {"status": "ok"}