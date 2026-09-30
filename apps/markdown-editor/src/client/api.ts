export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function api<T>(url: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(`/api/${url}`, body === undefined ? undefined : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new ApiError(response.status, data.error || 'Request failed.');
  return data as T;
}
export function localPath(source: string, documentPath: string): string | null {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(source)) return null;
  const segments = source.startsWith('/') ? [] : documentPath.split('/').slice(0, -1);
  let decoded: string;
  try { decoded = decodeURIComponent(source.split(/[?#]/)[0]); } catch { return null; }
  for (const piece of decoded.split('/')) {
    if (piece === '..') { if (!segments.length) return null; segments.pop(); }
    else if (piece && piece !== '.') segments.push(piece);
  }
  return segments.join('/');
}
