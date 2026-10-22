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
// Rewrite targets are extensionless: Workers' html_handling answers
// "/x.html" with a 307 to "/x", which would drop the showcase id from the URL.
fs.writeFileSync(path.join(root, "_redirects"),
  "/s/* /public-showcase-shell 200\n/showcase/* /showcase-shell 200\n");
fs.writeFileSync(path.join(root, "_headers"),
  "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n/s/*\n  Cache-Control: no-store\n/showcase/*\n  Cache-Control: no-store\n" +
  // iOS fetches this extensionless file and requires a JSON content type.
  "/.well-known/apple-app-site-association\n  Content-Type: application/json\n");

// Verification files that let https://<site>/s/<id> open the installed app
// (iOS universal links, Android app links). Values live in app-links.json.
const appConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "app.json"), "utf8")).expo;
const links = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "app-links.json"), "utf8"));
const wellKnown = path.join(root, ".well-known");
fs.mkdirSync(wellKnown, { recursive: true });
if (links.appleTeamId && appConfig.ios?.bundleIdentifier) {
  const appID = `${links.appleTeamId}.${appConfig.ios.bundleIdentifier}`;
  fs.writeFileSync(path.join(wellKnown, "apple-app-site-association"), JSON.stringify({
    applinks: { apps: [], details: [{ appIDs: [appID], appID, paths: ["/s/*"], components: [{ "/": "/s/*" }] }] },
  }));
} else {
  console.warn("app-links.json has no appleTeamId: iOS universal links are not served.");
}
if (links.androidSha256Fingerprints?.length && appConfig.android?.package) {
  fs.writeFileSync(path.join(wellKnown, "assetlinks.json"), JSON.stringify([{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: appConfig.android.package, sha256_cert_fingerprints: links.androidSha256Fingerprints },
  }]));
} else {
  console.warn("app-links.json has no androidSha256Fingerprints: Android app links are not served.");
}
console.log("Cloudflare Pages shells, dynamic route rewrites, headers and app-link files prepared in dist.");
