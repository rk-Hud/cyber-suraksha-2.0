import { createServer } from 'node:http';
import api from './index.js';
const port = Number(process.env.PORT || 8080);
createServer(async (request, response) => {
  const url = new URL(request.url, 'http://' + request.headers.host);
  const init = { method: request.method, headers: request.headers };
  if (!['GET', 'HEAD'].includes(request.method)) { init.body = request; init.duplex = 'half'; }
  const result = await api.fetch(new Request(url, init));
  response.writeHead(result.status, Object.fromEntries(result.headers));
  response.end(Buffer.from(await result.arrayBuffer()));
}).listen(port, '0.0.0.0', () => console.log('Account API listening on port ' + port));
