import { isVoyageRules, type VoyageRules } from '../../src/core/simulation/VoyageRules';

export class RequestError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

export type ApiHandler = (context: { request: Request; env: { DATABASE_URL?: string } }) => Promise<Response>;

export const json = (body: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
});

export async function readJson(request: Request, maxBytes = 2_000_000): Promise<unknown> {
  if (Number(request.headers.get('Content-Length')) > maxBytes) throw new RequestError('Payload too large', 413);
  if (!request.body) throw new RequestError('Missing JSON payload');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new RequestError('Payload too large', 413); }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new RequestError('Invalid JSON payload'); }
}

function integerParam(params: URLSearchParams, name: string, min: number, max: number, fallback?: number): number | undefined {
  const raw = params.get(name);
  if (raw === null) return fallback;
  if (!/^[1-9]\d*$/.test(raw)) throw new RequestError(`Invalid ${name}`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RequestError(`Invalid ${name}`);
  return value;
}

export function queryParams(url: URL) {
  const params = url.searchParams;
  let voyage: VoyageRules | undefined;
  if(params.has('difficulty')||params.has('map')) {
    const selection={difficulty:params.get('difficulty'),map:params.get('map')};
    if(!isVoyageRules(selection))throw new RequestError('Invalid voyage selection');
    voyage=selection;
  }
  return {
    ...(voyage ? {voyage} : {}),
    page: integerParam(params, 'page', 1, 1_000_000, 1)!,
    pageSize: integerParam(params, 'pageSize', 1, 50, 10)!,
    sessionDuration: integerParam(params, 'sessionDuration', 60, 180),
    spawnInterval: integerParam(params, 'spawnInterval', 1, 15),
  };
}
