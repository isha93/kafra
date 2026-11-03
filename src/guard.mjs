/**
 * Who may talk to the Kafra server.
 *
 * Binding to 127.0.0.1 keeps other machines out, but not other websites: any
 * page open in your browser can make requests to 127.0.0.1, and with DNS
 * rebinding (evil.example resolving to 127.0.0.1) it can even read the
 * answers. The API hands out prompts and file paths, so every request must
 * prove it comes from Kafra's own page, addressed to Kafra's own host.
 */

/** Hosts the page is served from. Anything else in a Host header is a rebinding attempt. */
export function allowedHost(host, port) {
  if (!host) return false;
  return host === `127.0.0.1:${port}` || host === `localhost:${port}` || host === `[::1]:${port}`;
}

/**
 * Browsers mark where a request comes from. A request from another site is
 * refused even if its Host looks right; requests without these headers
 * (curl, the user's own tools) are allowed, since they can't come from a page.
 */
export function allowedOrigin({ origin, fetchSite }, port) {
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;
  if (origin && !allowedHost(origin.replace(/^https?:\/\//, ''), port)) return false;
  return true;
}

/**
 * Sent with every response. The page only ever loads its own files, so the
 * content security policy can be strict: no third-party scripts, no framing,
 * no sending data anywhere but back to this server.
 */
export const SECURITY_HEADERS = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    // Inline style attributes carry per-agent colours and portraits.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-origin',
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), usb=()',
  'cache-control': 'no-store',
};
