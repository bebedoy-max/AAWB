// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Target Cloudflare Pages (advanced mode) instead of the Workers-oriented
  // cloudflare-module preset; the latter emits a wrangler.json with a reserved
  // ASSETS binding that breaks Pages git deployments.
  nitro: {
    preset: "cloudflare-pages",
    cloudflare: {
      nodeCompat: true,
      // Pages reads the _worker.js directory directly. A nested Wrangler
      // config is unnecessary and its ASSETS binding is reserved by Pages.
      deployConfig: false,
    },
  },
});
