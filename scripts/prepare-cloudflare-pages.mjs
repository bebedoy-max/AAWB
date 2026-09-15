import { rm } from "node:fs/promises";

const generatedConfigs = [
  "dist/_worker.js/wrangler.json",
  "dist/server/wrangler.json",
];

await Promise.all(
  generatedConfigs.map((path) => rm(path, { force: true })),
);

console.log("Cloudflare Pages output prepared.");