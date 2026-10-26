import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/webhooks/harbor/route';
import { normalize, verifyHarborRequest } from '../lib/verify-harbor';

const AUTH = 'Bearer 5f1c0f3e8b7a4d2c9e6a1b3d';

let log: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  process.env.HARBOR_AUTHORIZATION = AUTH;
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
});

// Shapes taken from Harbor's documented sample payloads (trimmed)
const repository = {
  name: 'alpine',
  namespace: 'harbor',
  repo_full_name: 'harbor/alpine',
  repo_type: 'private',
};
const pushArtifact = {
  type: 'PUSH_ARTIFACT',
  occur_at: 1680501893,
  operator: 'harbor-jobservice',
  event_data: {
    resources: [
      {
        digest: 'sha256:954b378c375d852eb3c63ab88978f640b4348b01c1b3456a024a81536dafbbf4',
        tag: 'sha256:954b378c375d852eb3c63ab88978f640b4348b01c1b3456a024a81536dafbbf4',
        resource_url: 'localhost/harbor/alpine@sha256:954b378c375d852eb3c63ab88978f640b4348b01c1b3456a024a81536dafbbf4',
      },
    ],
    repository,
  },
};
const scanningCompleted = {
  type: 'SCANNING_COMPLETED',
  occur_at: 1680502375,
  operator: 'auto',
  event_data: { resources: [{ digest: 'sha256:954b378c' }], repository },
};
const quotaExceed = {
  type: 'QUOTA_EXCEED',
  occur_at: 1680505484,
  operator: '',
  event_data: {
    resources: [{ digest: 'sha256:402d21757a03a114' }],
    repository,
    custom_attributes: { Details: 'will exceed the configured upper limit of 10.0 MiB.' },
  },
};
const cloudEventsPush = {
  specversion: '1.0',
  id: '66e18103-09c1-41f6-982f-37df223f3eeb',
  source: '/projects/2/webhook/policies/15',
  type: 'harbor.artifact.pushed',
  datacontenttype: 'application/json',
  time: '2023-04-03T06:04:46Z',
  data: pushArtifact.event_data,
  operator: 'harbor-jobservice',
};

function makeRequest(
  headers: Record<string, string> = {},
  body: string = JSON.stringify(pushArtifact),
  contentType = 'application/json'
): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/harbor', {
    method: 'POST',
    headers: { 'Content-Type': contentType, ...headers },
    body,
  });
}

describe('Harbor webhook route', () => {
  it('accepts the full Authorization header value', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    expect((await POST(makeRequest())).status).toBe(401);
  });

  it('rejects a wrong credential', async () => {
    expect((await POST(makeRequest({ Authorization: 'Bearer wrong' }))).status).toBe(401);
  });

  it('rejects the token without the "Bearer " prefix', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH.replace('Bearer ', '') }));
    expect(res.status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(pushArtifact), 'text/plain'));
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, 'not json'))).status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, '[1,2]'))).status).toBe(400);
  });

  it('handles Default format events', async () => {
    expect((await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(scanningCompleted)))).status).toBe(200);
    expect((await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(quotaExceed)))).status).toBe(200);
    expect(log).toHaveBeenCalledWith('Scan completed for harbor/alpine');
    expect(log).toHaveBeenCalledWith('Project quota exceeded at harbor/alpine');
  });

  it('handles CloudEvents format events by dispatching on type', async () => {
    const res = await POST(makeRequest({ Authorization: AUTH }, JSON.stringify(cloudEventsPush)));
    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledWith('Artifact pushed to harbor/alpine');
  });
});

describe('helpers', () => {
  it('normalizes both formats to the same event name', () => {
    expect(normalize(pushArtifact).type).toBe('PUSH_ARTIFACT');
    expect(normalize(cloudEventsPush).type).toBe('PUSH_ARTIFACT');
    expect(normalize({ foo: 1 }).type).toBeNull();
  });

  it('never accepts when HARBOR_AUTHORIZATION is unset', () => {
    expect(verifyHarborRequest(new Headers({ Authorization: 'Bearer x' }), {})).toBe(false);
    expect(verifyHarborRequest(new Headers({ Authorization: '' }), { HARBOR_AUTHORIZATION: '' })).toBe(false);
  });
});
