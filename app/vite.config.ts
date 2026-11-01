import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Serves api/*.ts (Web-standard `POST(request)` handlers, as deployed on Vercel) during `npm run dev`,
 * so the AI coach works locally with ANTHROPIC_API_KEY set in your shell.
 */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const m = url.pathname.match(/\/api\/([a-z-]+)$/);
        if (!m || req.method !== 'POST') return next();
        try {
          const mod = (await server.ssrLoadModule(`/api/${m[1]}.ts`)) as { POST?: (r: Request) => Promise<Response> };
          if (!mod.POST) return next();
          let body = '';
          for await (const c of req) body += String(c);
          const response = await mod.POST(new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }));
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          server.config.logger.error(String(e));
          res.statusCode = 500;
          res.end('{"error":"dev_api_failed"}');
        }
      });
    },
  };
}

export default defineConfig({
  // Relative base so the build works from any static host path (GitHub Pages included).
  base: './',
  plugins: [
    react(),
    devApi(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Chess Boxing Tracker',
        short_name: 'CB Tracker',
        description: 'Track your Lichess rating and your weight cut side by side.',
        theme_color: '#0E0E10',
        background_color: '#0E0E10',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
});
