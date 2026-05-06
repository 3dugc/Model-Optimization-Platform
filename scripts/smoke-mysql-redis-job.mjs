import { request } from 'node:http';

const port = Number(process.env.SMOKE_API_PORT || process.env.API_HOST_PORT || process.env.API_PORT || 8080);

function postJson(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = request({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

function getJson(path) {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'GET'
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.end();
  });
}

const created = await postJson('/v1/jobs', {
  pipelineType: 'model-optimization',
  filename: 'source.glb',
  options: { preset: 'balanced' }
});

if (created.statusCode !== 201) {
  throw new Error(`Expected create status 201, received ${created.statusCode}`);
}

await postJson(`/v1/jobs/${created.body.jobId}/complete-upload`, {});

const status = await getJson(`/v1/jobs/${created.body.jobId}`);
if (!['queued', 'processing', 'completed'].includes(status.body.status)) {
  throw new Error(`Unexpected status ${status.body.status}`);
}

console.log(JSON.stringify({
  ok: true,
  jobId: created.body.jobId,
  status: status.body.status
}));
