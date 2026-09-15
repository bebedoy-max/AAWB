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

// When Nitro writes the wrangler.json above, it also drops a small
// "redirect" file at .wrangler/deploy/config.json that tells Wrangler
// "the real config lives over there, at dist/_worker.js/wrangler.json".
// Since we just deleted that target file, this redirect would now point
// at nothing — and `wrangler pages deploy` fails at deploy time with:
//   "the redirected configuration path it points to ... does not exist."
// Remove the stale redirect too, so Wrangler falls back to Cloudflare
// Pages' own default handling (no user/generated config at all), which is
// exactly what a plain `_worker.js` deploy needs.
const deployRedirect = join(".wrangler", "deploy", "config.json");
if (existsSync(deployRedirect)) {
  rmSync(deployRedirect);
  console.log(`[postbuild] removed stale ${deployRedirect} (was pointing at the deleted wrangler.json)`);
}
