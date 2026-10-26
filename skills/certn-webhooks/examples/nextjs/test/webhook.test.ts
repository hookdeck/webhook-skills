import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Certn's signing secret is used as-is, as UTF-8; this one is only for tests
const SECRET = 'test_certn_signing_secret_3b7d';

let POST: (request: NextRequest) => Promise<Response>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  process.env.CERTN_WEBHOOK_SECRET = SECRET;
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  ({ POST } = await import('../app/webhooks/certn/route'));
});

afterEach(() => {
  delete process.env.CERTN_TIMESTAMP_TOLERANCE_SECONDS;
  logSpy.mockClear();
});

function v1For(body: string, timestamp: number, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

// Certn puts a space after each comma: t=<ts>, v1=<hex>
function sign(body: string, timestamp = Math.floor(Date.now() / 1000), secret = SECRET): string {
  return `t=${timestamp}, v1=${v1For(body, timestamp, secret)}`;
}

// Content-Type is deliberately varied: verification must not depend on it
function post(body: string, signature?: string, contentType = 'application/json') {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (signature !== undefined) headers['certn-signature'] = signature;
  return POST(new NextRequest('http://localhost:3000/webhooks/certn', { method: 'POST', headers, body }));
}

const now = () => Math.floor(Date.now() / 1000);

const complete = JSON.stringify({
  id: '1ba124f1-d473-44c0-a066-d623b2cb6253',
  applicant_type: 'Standard',
  report_status: 'COMPLETE',
  result: 'CLEARED',
  result_label: 'Cleared',
  check_executions: [{ id: 'check_exec_SYS5AS3GLcZZpo0i1GfNXQ', check_name: 'criminal_record_check', status: 'COMPLETE' }],
});
const inProgress = JSON.stringify({ id: 'a1', report_status: 'IN_PROGRESS', result: 'NONE' });

describe('Certn webhook signature verification', () => {
  it('accepts a valid Certn-Signature', async () => {
    const res = await post(complete, sign(complete));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('accepts the header without a space after the comma', async () => {
    const t = now();
    expect((await post(complete, `t=${t},v1=${v1For(complete, t)}`)).status).toBe(200);
  });

  it('verifies regardless of Content-Type', async () => {
    expect((await post(complete, sign(complete), 'text/plain')).status).toBe(200);
  });

  it('accepts when any v1 matches (secret roll)', async () => {
    const t = now();
    const header = `t=${t}, v1=${v1For(complete, t, 'old_secret')}, v1=${v1For(complete, t)}`;
    expect((await post(complete, header)).status).toBe(200);
  });

  it('ignores schemes other than v1', async () => {
    const t = now();
    expect((await post(complete, `t=${t}, v0=${v1For(complete, t)}`)).status).toBe(400);
  });

  it('rejects a missing signature header', async () => {
    expect((await post(complete)).status).toBe(400);
  });

  it('rejects a header with no t or no v1', async () => {
    const t = now();
    expect((await post(complete, `v1=${v1For(complete, t)}`)).status).toBe(400);
    expect((await post(complete, `t=${t}`)).status).toBe(400);
  });

  it('rejects a signature made with another secret', async () => {
    expect((await post(complete, sign(complete, undefined, 'wrong_secret'))).status).toBe(400);
  });

  it('rejects a tampered body', async () => {
    expect((await post(complete.replace('CLEARED', 'NONE'), sign(complete))).status).toBe(400);
  });

  it('rejects non-hex or wrong-length v1 values without throwing', async () => {
    const t = now();
    expect((await post(complete, `t=${t}, v1=${'zz'.repeat(32)}`)).status).toBe(400);
    expect((await post(complete, `t=${t}, v1=abcd`)).status).toBe(400);
    expect((await post(complete, `t=${t}, v1=${v1For(complete, t)}00`)).status).toBe(400);
  });

  it('accepts an uppercase hex v1', async () => {
    const t = now();
    expect((await post(complete, `t=${t}, v1=${v1For(complete, t).toUpperCase()}`)).status).toBe(200);
  });

  it('accepts an old timestamp by default (retries and replays keep it)', async () => {
    expect((await post(complete, sign(complete, now() - 86400))).status).toBe(200);
  });

  it('rejects an old timestamp when the window is opted in', async () => {
    process.env.CERTN_TIMESTAMP_TOLERANCE_SECONDS = '300';
    expect((await post(complete, sign(complete, now() - 3600))).status).toBe(400);
    expect((await post(complete, sign(complete))).status).toBe(200);
  });

  it('treats an invalid tolerance value as off', async () => {
    process.env.CERTN_TIMESTAMP_TOLERANCE_SECONDS = 'five minutes';
    expect((await post(complete, sign(complete, now() - 3600))).status).toBe(200);
  });

  it('returns 400 for invalid JSON with a valid signature', async () => {
    const body = 'not json';
    expect((await post(body, sign(body))).status).toBe(400);
  });
});

describe('Certn dispatch on report_status', () => {
  it('handles COMPLETE', async () => {
    await post(complete, sign(complete));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('report complete: result CLEARED'));
  });

  it('handles IN_PROGRESS', async () => {
    await post(inProgress, sign(inProgress));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('report in progress'));
  });

  it('logs unknown statuses and still acknowledges', async () => {
    const body = JSON.stringify({ id: 'x', report_status: 'SOMETHING_NEW' });
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Unhandled report_status: SOMETHING_NEW'));
  });
});
