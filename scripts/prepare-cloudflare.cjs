/* global __dirname */
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..", "dist");
// Stable file names avoid treating arbitrary showcase IDs as exported files.
for (const [source, destination] of [
  ["s/[id].html", "public-showcase-shell.html"],
  ["showcase/[id].html", "showcase-shell.html"],
]) {
  fs.copyFileSync(path.join(root, source), path.join(root, destination));
}
fs.writeFileSync(path.join(root, "_redirects"),
  "/s/* /public-showcase-shell.html 200\n/showcase/* /showcase-shell.html 200\n");
fs.writeFileSync(path.join(root, "_headers"),
  "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n/s/*\n  Cache-Control: no-store\n/showcase/*\n  Cache-Control: no-store\n");
console.log("Cloudflare Pages shells, dynamic route rewrites and headers prepared in dist.");

