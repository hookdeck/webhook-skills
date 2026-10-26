import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// BVNK's published test vector (docs: "Validate webhooks"). The secret looks like base64 but is used
// as its UTF-8 string bytes.
const SECRET = "JUL5QkQrpZYwW+Kf03QSrb70CG+ea/j8E/JfslENaXhd0AGBDbAtYYP2MdjkYDqiwjBtrtQXsUIbtAf7IGEGfg==";
const VECTOR_BODY = "{\"event\":\"bvnk:ledger:report:ready\",\"eventId\":\"0198a8bb-7d56-79ef-92b2-2aed247c21b4\",\"timestamp\":\"2025-08-14T13:18:36.374620938Z\",\"data\":{\"id\":\"8d942264-e27e-44d9-a048-5ed66ac5129f\",\"url\":\"https://bvnk-staging-reports.s3.eu-west-1.amazonaws.com/transaction/8d942264-e27e-44d9-a048-5ed66ac5129f_7b2f87b9-1335-4b1e-bbeb-6a59ba1dc6df.csv?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20250814T131836Z&X-Amz-SignedHeaders=host&X-Amz-Credential=AKIAZP6R7NJUFAGFGMNA%2F20250814%2Feu-west-1%2Fs3%2Faws4_request&X-Amz-Expires=604800&X-Amz-Signature=5c861e552b3e253be28f8e02c818b3c5e00269b9b50b6d4957d5281825d31a67\",\"type\":\"TRANSACTION\",\"status\":\"READY\"}}";
const VECTOR_SIGNATURE = 'VWEtiJu/7dLrq0ZtXS0HbGDPy6Re86oZeTnEEc9mlxg=';

let POST: (request: NextRequest) => Promise<Response>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  process.env.BVNK_WEBHOOK_SECRET = SECRET;
  ({ POST } = await import('../app/webhooks/bvnk/route'));
});

beforeEach(() => {
  process.env.BVNK_WEBHOOK_SECRET = SECRET;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const sign = (body: string, secret = SECRET) =>
  crypto.createHmac('sha256', secret).update(body).digest('base64');

function event(name = 'payment:v2:payin:status-change'): string {
  return JSON.stringify({
    event: name,
    eventId: '0198a8bb-7d56-79ef-92b2-2aed247c21b4',
    timestamp: '2025-08-14T13:18:36.374620938Z',
    data: { id: '8d942264-e27e-44d9-a048-5ed66ac5129f', status: 'COMPLETE' },
  });
}

function makeRequest(body: string, signature?: string, contentType = 'application/json'): NextRequest {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['x-signature'] = signature;
  return new NextRequest('http://localhost:3000/webhooks/bvnk', { method: 'POST', headers, body });
}

describe('POST /webhooks/bvnk', () => {
  it('accepts the published test vector', async () => {
    expect(sign(VECTOR_BODY)).toBe(VECTOR_SIGNATURE);
    const res = await POST(makeRequest(VECTOR_BODY, VECTOR_SIGNATURE));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Ledger report 8d942264-e27e-44d9-a048-5ed66ac5129f'));
  });

  it('accepts a freshly signed payload of any content type', async () => {
    const body = event();
    expect((await POST(makeRequest(body, sign(body), 'text/plain'))).status).toBe(200);
  });

  it('rejects a missing signature', async () => {
    expect((await POST(makeRequest(event()))).status).toBe(401);
  });

  it.each([
    ['malformed', 'not-a-signature'],
    ['empty', ''],
    ['unpadded', VECTOR_SIGNATURE.slice(0, 43)],
    ['url-safe alphabet', VECTOR_SIGNATURE.replace('/', '_')],
    ['prefixed', 'sha256=' + VECTOR_SIGNATURE],
    // "h" decodes to the same bytes as "g" but is not the canonical spelling Hookdeck accepts
    ['non-canonical base64', VECTOR_SIGNATURE.replace('g=', 'h=')],
  ])('rejects a %s signature', async (_name, value) => {
    expect((await POST(makeRequest(VECTOR_BODY, value))).status).toBe(401);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const body = event();
    expect((await POST(makeRequest(body, sign(body, 'another-secret')))).status).toBe(401);
  });

  it('rejects a tampered body', async () => {
    expect((await POST(makeRequest(VECTOR_BODY.replace('READY', 'FAILED'), VECTOR_SIGNATURE))).status).toBe(401);
  });

  it('rejects a re-serialized (pretty-printed) body', async () => {
    const pretty = JSON.stringify(JSON.parse(VECTOR_BODY), null, 2);
    expect((await POST(makeRequest(pretty, VECTOR_SIGNATURE))).status).toBe(401);
  });

  it('does not base64-decode the secret', async () => {
    const decodedKeySig = crypto
      .createHmac('sha256', Buffer.from(SECRET, 'base64'))
      .update(VECTOR_BODY)
      .digest('base64');
    expect(decodedKeySig).not.toBe(VECTOR_SIGNATURE);
    expect((await POST(makeRequest(VECTOR_BODY, decodedKeySig))).status).toBe(401);
  });

  it('returns 500 when the secret is not configured', async () => {
    delete process.env.BVNK_WEBHOOK_SECRET;
    expect((await POST(makeRequest(VECTOR_BODY, VECTOR_SIGNATURE))).status).toBe(500);
  });

  it('returns 400 for a validly signed non-JSON body', async () => {
    const body = 'not json';
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(400);
  });

  it.each([
    'payment:v2:payin:status-change',
    'bvnk:payment:channel:created',
    'bvnk:payment:channel:transaction-confirmed',
    'bvnk:payment:channel:transaction-on-hold',
    'bvnk:payment:crypto:transaction-on-hold',
    'platform:accounts:customer:created',
    'platform:accounts:customer:status-change',
    'bvnk:customers:status-change',
  ])('handles %s', async (name) => {
    const body = event(name);
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(200);
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unhandled event'));
  });

  it('logs unhandled events and still returns 200', async () => {
    const body = event('bvnk:something:else');
    expect((await POST(makeRequest(body, sign(body)))).status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith('Unhandled event: bvnk:something:else');
  });
});
