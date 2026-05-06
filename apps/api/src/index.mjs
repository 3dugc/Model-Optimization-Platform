import http from 'node:http';

const port = Number(process.env.API_PORT || process.env.PORT || 8080);

function json(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function route(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    json(res, 200, {
      status: 'ok',
      service: 'model-optimization-api',
      optimizerUrl: process.env.OPTIMIZER_URL || 'http://optimizer:3000'
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/jobs') {
    json(res, 501, {
      error: 'not_implemented',
      message: 'Job creation will issue a COS upload URL, persist job state, and enqueue work.'
    });
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/v1/jobs/')) {
    json(res, 501, {
      error: 'not_implemented',
      message: 'Job status lookup will read persisted job state and return result metadata.'
    });
    return;
  }

  json(res, 404, {
    error: 'not_found',
    message: 'Route not found.'
  });
}

const server = http.createServer(route);

server.listen(port, () => {
  console.log(JSON.stringify({
    level: 'info',
    service: 'model-optimization-api',
    message: 'API scaffold listening',
    port
  }));
});
