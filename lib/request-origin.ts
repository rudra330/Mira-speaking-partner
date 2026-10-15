// Next's local server may use localhost internally even when opened at 127.0.0.1.
// Host is the browser's destination; never trust arbitrary forwarded-host headers.
export function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (!host) return url.origin;
  try {
    const destination = new URL(`${url.protocol}//${host}`);
    if (destination.host === host.toLowerCase() && !destination.username && !destination.password) return destination.origin;
  } catch { /* Use the runtime URL if Host is malformed. */ }
  return url.origin;
}
