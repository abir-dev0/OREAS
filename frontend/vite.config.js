import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true, // Fail if port 5173 is already in use instead of switching to 5174

    // Allow any hostname — required so Cloudflare / Shopify iframe tunnel domains are never blocked.
    allowedHosts: true,


    // Proxy /api/* requests to the local Django backend.
    // This means only ONE public tunnel URL is needed for Shopify —
    // the frontend tunnel forwards API traffic to Django internally.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
        secure: false,
      },
    },

    // HTTP headers sent with every response from the Vite dev server.
    // Shopify Admin embeds the app in an iframe; these headers allow that.
    headers: {
      // Allow Shopify Admin to embed this app in an iframe.
      // 'ALLOWALL' is needed in dev; tighten to 'ALLOW-FROM' in production.
      'X-Frame-Options': 'ALLOWALL',

      // Content-Security-Policy: permit framing from Shopify Admin domains.
      'Content-Security-Policy':
        "frame-ancestors https://*.myshopify.com https://admin.shopify.com;",
    },
  },
})

