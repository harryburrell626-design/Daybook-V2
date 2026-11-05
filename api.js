export async function api(method, path, body, { raw = false, keepalive = false } = {}) {
  const headers = { 'X-Daybook': '1' };
  let payload;
  if (raw) { payload = body; headers['Content-Type'] = body.type || 'application/octet-stream'; }
  else if (body !== undefined) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
  let res;
  try { res = await fetch('/api' + path, { method, headers, body: payload, credentials: 'same-origin', keepalive }); }
  catch { throw Object.assign(new Error('You appear to be offline. Check your connection and try again.'), { offline: true }); }
  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new CustomEvent('daybook:unauth'));
    throw Object.assign(new Error(data?.error || 'Something went wrong. Please try again.'), { status: res.status });
  }
  return data;
}
