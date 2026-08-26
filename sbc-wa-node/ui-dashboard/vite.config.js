import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Proxies /api/* to the Express server in app.js (port 3000) so the
// SvelteKit dev server can call it as same-origin — no CORS needed.
export default defineConfig({
  plugins: [sveltekit()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
