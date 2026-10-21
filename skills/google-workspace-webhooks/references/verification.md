# How to Verify Google Workspace Push Notifications

## How It Works

Google Workspace push notifications are **not signed**. There is no HMAC header,
no timestamp, and no Standard Webhooks headers. Instead:

1. You set a `token` (max 256 characters) in the watch request.
2. Google returns that exact string in the `X-Goog-Channel-Token` header of every
   notification on the channel.
3. Your handler compares it to the stored value in constant time and rejects
   mismatches.

Google's docs describe the token as the way "to verify that each incoming
message is for a channel that your application created — to ensure that the
notification is not being spoofed".

The header is **only present if you set a token**. Always set one, and treat a
missing header as a failed verification.

## Implementation

There is no SDK helper for this check. The Google API client libraries create
channels but do not verify notifications, so every example uses manual
verification.

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

function verifyChannelToken(received, expected) {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false; // timingSafeEqual throws on length mismatch
  return crypto.timingSafeEqual(a, b);
}

const ok = verifyChannelToken(
  req.get('x-goog-channel-token'),
  process.env.GOOGLE_WORKSPACE_CHANNEL_TOKEN
);
```

### Python (FastAPI)

```python
import hmac

def verify_channel_token(received: str | None, expected: str | None) -> bool:
    if not received or not expected:
        return False
    return hmac.compare_digest(received.encode(), expected.encode())
```

### What to check after the token

The token proves the sender knew your secret. Optionally, also check:

- **`X-Goog-Channel-ID`** is a channel you created and haven't stopped. This
  rejects messages for stale channels after you rotate.
- **Required headers** (`X-Goog-Channel-ID`, `X-Goog-Resource-ID`,
  `X-Goog-Resource-State`, `X-Goog-Message-Number`) are present. The examples
  return `400` if any is missing.

## Common Gotchas

- **No signature over the body.** Don't look for `X-Goog-Signature` or try to
  HMAC the body. Drive and Calendar bodies are empty anyway.
- **Token missing entirely.** If you didn't pass `token` in the watch request,
  Google sends no `X-Goog-Channel-Token` header and every notification fails
  verification. Recreate the channel with a token.
- **Token compared to the wrong value.** The header contains the *whole* token
  string. If you used a `key=value&...` format, compare the full string or parse
  it and compare the secret part in constant time.
- **Header case.** Express and Next.js lowercase header names
  (`x-goog-channel-token`). FastAPI's `Header()` maps `x_goog_channel_token`.
- **One token per channel.** Different channels can have different tokens. If
  you rotate, create new channels with the new token, accept both during the
  overlap, then stop the old channels.
- **Sync before watch response.** The `sync` message can arrive before your
  `watch` call returns. Persist the token before calling `watch`.
- **No timestamp.** There is nothing to check for freshness. Use
  `X-Goog-Channel-ID` + `X-Goog-Message-Number` to dedupe.
- **Non-2xx means failure.** Only 200, 201, 202, 204, and 102 count as success.
  Return `200` quickly and process asynchronously.

## Debugging Verification Failures

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `X-Goog-Channel-Token` header absent | Watch request had no `token` | Recreate the channel with `token` set |
| Token present but mismatched | Env var differs from the token used in `watch` (whitespace, quotes, old value) | Log lengths (not values) of both; recreate channel or fix env |
| Works for one API, fails for another | Each channel has its own token | Use the same token for all channels, or look up by `X-Goog-Channel-ID` |
| No notifications at all | Invalid TLS certificate, or channel expired | Use a CA-signed HTTPS URL; check `expiration` and renew |
| Only `sync` received | Nothing changed yet, or watching the wrong resource | Change the watched file/calendar; check `resourceUri` |
