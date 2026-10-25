# Absorb LMS Webhooks - FastAPI Example

Minimal example of receiving Absorb LMS webhooks with FastAPI and verifying the
`absorb-signature` header (HMAC-SHA256 of the raw body, lowercase hex).

## Prerequisites

- Python 3.9+
- An Absorb LMS portal where you are a System Administrator, with a saved webhook (its Secret
  Key is generated after saving; see [../../references/setup.md](../../references/setup.md))

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `ABSORB_WEBHOOK_SECRET` to the Secret Key shown on the saved webhook.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/absorb-lms`.

## Test

```bash
pytest test_webhook.py
```

The tests sign payloads with the same algorithm Absorb uses and cover valid, tampered,
wrong-secret, random (Test Webhook style), malformed, non-ASCII and missing signatures, any
content type, and the handled events. No Absorb account is needed.

**Absorb's Test Webhook button cannot be verified.** It sends a random signature instead of one
made with your Secret Key, so this handler answers it with `401`. Trigger a real event in a
sandbox portal (for example create a user) to test end to end.

## Receive Absorb LMS Webhooks Locally

```bash
npx hookdeck-cli listen 8000 absorb-lms --path /webhooks/absorb-lms
```

Put the printed URL in the webhook's **URL** field in **Account > Client Settings**.

## How It Works

- `main.py`: `verify_absorb_signature()` plus the `POST /webhooks/absorb-lms` route

1. The route reads the exact bytes with `await request.body()`, so the signature covers them
   whatever the content type.
2. It computes the HMAC-SHA256 of the body with the Secret Key and compares the hex digests
   with `hmac.compare_digest` on **bytes**, so a non-ASCII header gives `401`, not `500`.
3. The body must be a JSON object (`400` otherwise).
4. The handler dispatches on `eventName` (`UserCreated`, `OnlineCourseActivated`,
   `EnrollmentCompletedbyAdmin`, `EnrollmentCompletedbyLearner`, `CertificateAwarded`,
   `CompetencyAwarded`, `CourseCreditsAwarded`, `UserEnrolledinCoursebyAdmin`,
   `UserEnrolledinCoursebyLearner`) and returns `200 {"received": true}`.
