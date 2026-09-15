// Cloudflare Pages reserves the binding name "ASSETS" for its own automatic
// static-asset handling. Nitro's `cloudflare-pages` preset unconditionally
// writes a wrangler.json into dist/_worker.js/ that declares an "ASSETS"
// binding of its own, which collides with the reserved name and makes the
// Pages build fail with:
//   "The name 'ASSETS' is reserved in Pages projects."
//
// Cloudflare Pages doesn't need this file for a plain `_worker.js` deploy —
// it wires up `env.ASSETS` automatically, which is exactly what Nitro's
// Cloudflare Pages runtime code already expects. So we just remove the
// generated config after the build instead of trying to rename the binding.
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const candidates = [
  join("dist", "_worker.js", "wrangler.json"),
  join("dist", "_worker.js", "wrangler.jsonc"),
  join("dist", "_worker.js", "wrangler.toml"),
];

for (const path of candidates) {
  if (existsSync(path)) {
    rmSync(path);
    console.log(`[postbuild] removed ${path} (avoids Cloudflare Pages reserved ASSETS binding conflict)`);
  }
}
