/**
 * Image helper for OREAS — preserves exact DB/Instagram Graph API URLs.
 *
 * Strategy:
 *  1. The <img> renders the raw DB URL with referrerPolicy="no-referrer" (this alone fixes
 *     ~80% of 403s since Meta blocks requests carrying a localhost Referer header).
 *  2. If the browser still gets a 403 (expired signature), onError fires and we re-route
 *     the same URL through our Django proxy (/api/instagram/media-proxy/) which fetches
 *     it server-side with a proper browser UA — no expiry issue from the server side.
 *  3. If the proxy also fails (completely expired / deleted), a minimal SVG placeholder is shown.
 *
 * No stock photos or external images are used — only the real Instagram media from the DB.
 */

/**
 * Route an Instagram CDN URL through the Django backend proxy.
 * Works for both scontent.cdninstagram.com and fbcdn.net signed URLs.
 */
export function getProxiedUrl(url) {
  if (!url) return ''
  return `/api/instagram/media-proxy/?url=${encodeURIComponent(url)}`
}

/**
 * onError handler — attach this to every <img> that shows Instagram/DB media.
 * @param {Event} e       - The error event
 * @param {string} originalUrl - The original URL from the database
 */
export function handleImageError(e, originalUrl) {
  const target = e.target
  if (!target) return

  const currentSrc = target.src || ''

  // Step 1: First failure on the raw CDN URL — try the Django proxy
  if (originalUrl && !currentSrc.includes('/api/instagram/media-proxy/')) {
    target.src = getProxiedUrl(originalUrl)
    return
  }

  // Step 2: Proxy also failed (e.g. completely expired or deleted) — show SVG placeholder
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">',
    '<rect width="300" height="300" fill="%231e293b"/>',
    '<path d="M150 90c-15 0-30 15-30 30s15 30 30 30 30-15 30-30-15-30-30-30z',
    'M150 138c-10 0-18-8-18-18s8-18 18-18 18 8 18 18-8 18-18 18z',
    'M150 180c-25 0-75 12-75 37v13h150v-13c0-25-50-37-75-37z',
    'M89 230c6-6 25-13 61-13s55 7 61 13H89z" fill="%2364748b"/>',
    '<text x="50%" y="85%" dominant-baseline="middle" text-anchor="middle"',
    ' fill="%2394a3b8" font-family="sans-serif" font-size="12" font-weight="600">',
    'Instagram Media</text>',
    '</svg>'
  ].join('')
  target.src = `data:image/svg+xml;utf8,${svg}`
}
