/** Share only identical, signal-free GET/HEAD requests while they are in flight. */
const inflight = new Map<string, Promise<Response>>();

export function dedupedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // Request objects can carry bodies, credentials and signals. Let fetch own
  // their semantics rather than treating them as the string [object Request].
  if (typeof Request !== 'undefined' && input instanceof Request) return fetch(input, init);
  const method = (init?.method || 'GET').toUpperCase();
  if (init?.signal || !['GET', 'HEAD'].includes(method)) return fetch(input, init);
  const headers = Array.from(new Headers(init?.headers).entries()).sort(([a], [b]) => a.localeCompare(b));
  const key = JSON.stringify([String(input), method, headers, init?.credentials, init?.mode,
    init?.cache, init?.redirect, init?.referrer, init?.referrerPolicy, init?.integrity]);
  let request = inflight.get(key);
  if (!request) {
    request = fetch(input, init).finally(() => { if (inflight.get(key) === request) inflight.delete(key); });
    inflight.set(key, request);
  }
  return request.then(response => response.clone());
}
