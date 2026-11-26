# Microsoft Teams Outgoing Webhook Verification

## How It Works

1. Read the `Authorization` header. It looks like `HMAC 03TCao0i55H1eVKUusZOTZRjtvYTs+mO41mPL+R1e1U=`.
2. Base64-**decode** the security token Teams gave you when you created the webhook. Those bytes are the key.
3. Compute HMAC-SHA256 over the **raw request body** as UTF-8 bytes.
4. Base64-encode the digest and compare it with the value after `HMAC `, in constant time.

Microsoft's page lists the steps as "Generate the HMAC token from the request body", "Compute the hash from the byte array of the security token", then compare. Its C# sample makes the decoding explicit:

```csharp
byte[] serializedPayloadBytes = Encoding.UTF8.GetBytes(messageContent);
byte[] keyBytes = Convert.FromBase64String(signingKey);
using (HMACSHA256 hmacSHA256 = new HMACSHA256(keyBytes))
{
    byte[] hashBytes = hmacSHA256.ComputeHash(serializedPayloadBytes);
    calculatedHmacValue = Convert.ToBase64String(hashBytes);
}
```

and its Node.js sample does the same with `Buffer.from(sharedSecret, "base64")` and compares against `"HMAC " + digest`.

There's no timestamp, nonce or delivery ID in the signature, so it proves the body came from Teams and wasn't changed, but doesn't stop a replay of a captured request. Use HTTPS (Teams requires it).

## Node.js

```javascript
const crypto = require('crypto');

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function verifyTeamsRequest(rawBody, authorization, securityToken) {
  if (!authorization || !securityToken) return false;
  const match = /^HMAC (\S+)$/i.exec(authorization.trim());
  if (!match) return false;

  // Node's base64 decoder skips invalid characters, so reject a malformed token
  // instead of keying with the wrong bytes.
  const token = securityToken.trim();
  if (!BASE64.test(token)) return false;
  const key = Buffer.from(token, 'base64');
  if (key.length === 0) return false;

  const expected = crypto.createHmac('sha256', key).update(rawBody).digest();
  const given = Buffer.from(match[1], 'base64');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}
```

`rawBody` must be the exact bytes Teams sent: `express.raw({ type: '*/*' })`, `await request.arrayBuffer()` in Next.js. Microsoft's sample collects the stream into a string first, which also works because it never re-serialises.

## Python

```python
import base64, binascii, hashlib, hmac, re
from typing import Optional

def verify_teams_request(raw_body: bytes, authorization: Optional[str], security_token: Optional[str]) -> bool:
    if not authorization or not security_token:
        return False
    match = re.fullmatch(r"HMAC (\S+)", authorization.strip(), flags=re.IGNORECASE)
    if not match:
        return False
    try:
        key = base64.b64decode(security_token.strip(), validate=True)
        given = base64.b64decode(match.group(1), validate=True)
    except (binascii.Error, ValueError):
        return False
    if not key:
        return False
    expected = hmac.new(key, raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(given, expected)
```

## Test Vector

Microsoft's page mentions a key (`vqF0En+Z0ucuRTM/01o2GuhMH3hKKk/N2bOmlM31zaA=`) and a header value, but not the request body they belong to, so it can't be checked. The examples use this made-up vector:

```
security token = zN0uIOo7AK9myNAQMhZ8PZNO2UZb9PXmx0V7r26UcOc=
body           = {"type":"message","id":"1731924900123","text":"<at>Helper</at> status","from":{"name":"Megan Bowen"}}
Authorization  = HMAC cOMdJKZIsWtg30Ac0WEteH+Xq4T2PR1Id7/qsO430kg=
```

## Hookdeck

The Microsoft Teams source type (`MICROSOFT_TEAMS`) runs the same check: paste the security token as Teams shows it (it's decoded for you, and surrounding whitespace is trimmed). Verification is optional on the source, and Hookdeck applies no timestamp window. Hookdeck replies to Teams before your destination runs, so set a custom JSON response on the source; see [setup.md](setup.md).

## Gotchas

| Symptom | Cause |
|---------|-------|
| HMAC never matches | The token string was used as the key. Base64-decode it first. |
| HMAC never matches | The body was parsed and re-serialised. Verify the raw bytes. |
| HMAC never matches | The `HMAC ` prefix was left on the value being compared. |
| HMAC never matches | The token has a trailing newline from copy-paste. Trim it. |
| Comparison throws in Node | `crypto.timingSafeEqual` needs equal-length buffers; check lengths first. |
| Nothing arrives | The message didn't @mention the webhook, or it was in a private channel, chat or personal scope. |
| Teams shows an error after a while | Your service took longer than about 5 seconds, or returned something other than a JSON message. |
| Behind Hookdeck, Teams never shows your reply | Expected: Hookdeck answers Teams. Set a custom response on the source. |

## Debugging

1. Run your verifier against the test vector above. If it fails, the code is wrong; if it passes, the token or raw body is wrong.
2. Log the raw body length and compare it with `Content-Length`.
3. Log whether `Authorization` starts with `HMAC ` (not the value itself).
