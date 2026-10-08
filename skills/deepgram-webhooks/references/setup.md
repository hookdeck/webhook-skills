# Setting Up Deepgram Webhooks

## Prerequisites

- Deepgram account with API access
- Your application's webhook endpoint URL (must use port 80, 443, 8080, or 8443)
- Deepgram API key from your console

## Get Your API Credentials

1. Log into [Deepgram Console](https://console.deepgram.com/)
2. Navigate to API Keys section
3. Create or select an API key
4. Note both:
   - **API Key**: Used for authentication when making requests
   - **API Key ID**: Shown in console, optionally used to check the `dg-token` header when it is present

## Configure Your Webhook Endpoint

### 1. Create Your Endpoint

Your webhook endpoint should:
- Accept POST requests
- Use one of the allowed ports (80, 443, 8080, 8443)
- Return 200-299 status for successful processing
- Handle JSON payloads with transcription results

### 2. Add Callback to Your Requests

Include the `callback` parameter when making transcription requests:

```bash
# Basic callback
curl -X POST \
  --header "Authorization: Token YOUR_API_KEY" \
  --header "Content-Type: audio/wav" \
  --data-binary @audio.wav \
  "https://api.deepgram.com/v1/listen?callback=https://your-domain.com/webhooks/deepgram"

# With additional features
curl -X POST \
  --header "Authorization: Token YOUR_API_KEY" \
  --header "Content-Type: audio/wav" \
  --data-binary @audio.wav \
  "https://api.deepgram.com/v1/listen?callback=https://your-domain.com/webhooks/deepgram&punctuate=true&diarize=true"
```

### 3. Using Basic Auth (Recommended)

Embed credentials in your callback URL. Deepgram sends them as an `Authorization: Basic` header, and this is the check your handler should rely on (the `dg-token` header is not sent on every callback). Percent-encode any special characters in the username or password:

```bash
# Format: https://username:password@domain/path
curl -X POST \
  --header "Authorization: Token YOUR_API_KEY" \
  --header "Content-Type: audio/wav" \
  --data-binary @audio.wav \
  "https://api.deepgram.com/v1/listen?callback=https://myuser:mypass@your-domain.com/webhooks/deepgram"
```

## Testing Your Setup

### 1. Local Development with Hookdeck

```bash
# Create local tunnel
npx hookdeck-cli listen 3000 deepgram --path /webhooks/deepgram

# Use the provided URL in your Deepgram requests
```

### 2. Send a Test Request

```bash
# Download a sample audio file
curl -O https://www.deepgram.com/examples/nasa-apollo-11.wav

# Send transcription request with callback
curl -X POST \
  --header "Authorization: Token YOUR_API_KEY" \
  --header "Content-Type: audio/wav" \
  --data-binary @nasa-apollo-11.wav \
  "https://api.deepgram.com/v1/listen?callback=YOUR_WEBHOOK_URL"
```

### 3. Verify the Response

You should receive:
1. Immediate response with `request_id`
2. Webhook POST to your endpoint within seconds/minutes (depending on file size)
3. Complete transcription results in the webhook payload

## Adding Metadata

Attach your own key-value pairs with the `extra` query parameter (repeat it for multiple pairs; 2048 characters per pair). They are returned in `metadata.extra` of the callback body:

```bash
curl -X POST \
  --header "Authorization: Token YOUR_API_KEY" \
  --header "Content-Type: audio/wav" \
  --data-binary @audio.wav \
  "https://api.deepgram.com/v1/listen?callback=https://your-domain.com/webhooks/deepgram&extra=user_id:123&extra=session_id:abc-def"
```

The callback then contains `"metadata": { "extra": { "user_id": "123", "session_id": "abc-def" }, ... }`.

## Webhook Method Configuration

By default, callbacks use POST. To use PUT instead:

```bash
curl -X POST \
  --header "Authorization: Token YOUR_API_KEY" \
  --header "Content-Type: audio/wav" \
  --data-binary @audio.wav \
  "https://api.deepgram.com/v1/listen?callback=https://your-domain.com/webhooks/deepgram&callback_method=put"
```

If you do this, register a `PUT` route for your webhook path; the examples in this skill only handle `POST`.

## Monitoring and Debugging

### Look Up a Request

There is no `GET /v1/listen/{request_id}` endpoint. To inspect a past request (including its `callback` URL and response code), use the Management API's [Get a Project Request](https://developers.deepgram.com/reference/manage/requests/get) endpoint:

```bash
curl -X GET \
  --header "Authorization: Token YOUR_API_KEY" \
  "https://api.deepgram.com/v1/projects/YOUR_PROJECT_ID/requests/YOUR_REQUEST_ID"
```

### Common Issues

1. **Webhook not received**: Check port restrictions (must be 80, 443, 8080, or 8443)
2. **Authentication failures**: Verify the Basic Auth credentials in your callback URL match your handler's configuration (percent-encode special characters). Don't require `dg-token`: it is not sent on every callback
3. **Repeated webhooks**: Ensure you return 200-299 status; Deepgram retries on errors
4. **Timeout errors**: Deepgram waits for response; process asynchronously if needed