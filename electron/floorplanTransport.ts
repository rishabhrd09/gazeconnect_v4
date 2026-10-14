import * as http from 'http';

const ROUTES = new Set([
  '/api/health',
  '/api/floorplan/generate',
  '/api/floorplan/generate-advanced',
  '/api/floorplan/generate-all',
  '/api/floorplan/preview',
  '/api/floorplan/compass/options',
  '/api/floorplan/compass/render',
  '/api/floorplan/compass/v2/model',
  '/api/floorplan/compass/v2/render',
  '/api/floorplan/candidates',
  '/api/floorplan/candidates/adjust',
]);
/** Compass drawing jobs: bounded by the service watchdog, and the only routes a save may use. */
const JOB_ROUTES = new Set([
  '/api/floorplan/compass/options',
  '/api/floorplan/compass/render',
  '/api/floorplan/compass/v2/model',
  '/api/floorplan/compass/v2/render',
]);
export interface FloorplanRequest { endpoint: string; body?: string; }
export interface FloorplanReply { status: number; contentType: string; bytes: Uint8Array; }

export function isFloorplanJobRoute(endpoint: unknown): boolean {
  return typeof endpoint === 'string' && JOB_ROUTES.has(endpoint);
}

/** App-owned loopback requests only; never a renderer-selected host or arbitrary URL. */
export function requestFloorplan(input: FloorplanRequest, port = 5050, limitMs?: number): Promise<FloorplanReply> {
  if (!input || !ROUTES.has(input.endpoint) || (input.body !== undefined && typeof input.body !== 'string')) {
    return Promise.reject(new Error('Invalid floor-plan request.'));
  }
  const isHealth = input.endpoint === '/api/health';
  if ((isHealth && input.body !== undefined) || (!isHealth && !input.body)) {
    return Promise.reject(new Error('Invalid floor-plan request method.'));
  }
  if (Buffer.byteLength(input.body || '') > 2 * 1024 * 1024) {
    return Promise.reject(new Error('Floor-plan request is too large.'));
  }
  // Compass jobs end within the service's own deadlines (and its 35 s watchdog); the legacy
  // renderer keeps its longer allowance.
  const timeout = limitMs ?? (isHealth ? 3000 : JOB_ROUTES.has(input.endpoint) ? 40000 : 120000);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: input.endpoint,
      method: isHealth ? 'GET' : 'POST', headers: input.body ? {
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(input.body),
      } : {},
    }, res => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 64 * 1024 * 1024) req.destroy(new Error('Floor-plan response is too large.'));
        else chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => {
        clearTimeout(deadline);
        resolve({ status: res.statusCode || 502, contentType: res.headers['content-type'] || 'application/octet-stream', bytes: new Uint8Array(Buffer.concat(chunks)) });
      });
    });
    const deadline = setTimeout(() => req.destroy(new Error('Floor-plan request timed out.')), timeout);
    req.on('error', error => { clearTimeout(deadline); reject(error); });
    req.end(input.body);
  });
}
