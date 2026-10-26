const request = require('supertest');

const AUTH = 'Bearer 5f1c0f3e8b7a4d2c9e6a1b3d';
process.env.HARBOR_AUTHORIZATION = AUTH;

const app = require('../src/index');
const { verifyHarborRequest, normalize } = require('../src/index');

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

function post(body, headers = {}, contentType = 'application/json') {
  return request(app)
    .post('/webhooks/harbor')
    .set('Content-Type', contentType)
    .set(headers)
    .send(typeof body === 'string' ? body : JSON.stringify(body));
}

describe('Harbor webhook', () => {
  let log;
  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepts the full Authorization header value', async () => {
    const res = await post(pushArtifact, { Authorization: AUTH });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a missing Authorization header', async () => {
    const res = await post(pushArtifact);
    expect(res.status).toBe(401);
  });

  it('rejects a wrong credential', async () => {
    const res = await post(pushArtifact, { Authorization: 'Bearer wrong' });
    expect(res.status).toBe(401);
  });

  it('rejects the token without the "Bearer " prefix', async () => {
    const res = await post(pushArtifact, { Authorization: AUTH.replace('Bearer ', '') });
    expect(res.status).toBe(401);
  });

  it('authenticates regardless of content type', async () => {
    const res = await post(JSON.stringify(pushArtifact), { Authorization: AUTH }, 'text/plain');
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await post('not json', { Authorization: AUTH });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a JSON array', async () => {
    const res = await post('[1,2]', { Authorization: AUTH });
    expect(res.status).toBe(400);
  });

  it('handles Default format events', async () => {
    expect((await post(scanningCompleted, { Authorization: AUTH })).status).toBe(200);
    expect((await post(quotaExceed, { Authorization: AUTH })).status).toBe(200);
    expect(log).toHaveBeenCalledWith('Scan completed for harbor/alpine');
    expect(log).toHaveBeenCalledWith('Project quota exceeded at harbor/alpine');
  });

  it('handles CloudEvents format events by dispatching on type', async () => {
    const res = await post(cloudEventsPush, { Authorization: AUTH });
    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledWith('Artifact pushed to harbor/alpine');
  });

  it('normalizes both formats to the same event name', () => {
    expect(normalize(pushArtifact).type).toBe('PUSH_ARTIFACT');
    expect(normalize(cloudEventsPush).type).toBe('PUSH_ARTIFACT');
    expect(normalize({ foo: 1 }).type).toBeNull();
  });

  it('never accepts when HARBOR_AUTHORIZATION is unset', () => {
    expect(verifyHarborRequest({ authorization: 'Bearer x' }, {})).toBe(false);
    expect(verifyHarborRequest({ authorization: '' }, { HARBOR_AUTHORIZATION: '' })).toBe(false);
  });
});
