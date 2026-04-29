/**
 * After `cargo build --release -p proxy-app`, copy the binary to the path Tauri expects
 * for `externalBin: ["binaries/proxy-app"]` (see Tauri sidecar docs).
 */
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const triple = execSync("rustc --print host-tuple", { encoding: "utf8" }).trim();
const ext = process.platform === "win32" ? ".exe" : "";
const src = path.join(root, "target", "release", `proxy-app${ext}`);
const destDir = path.join(root, "desktop", "src", "binaries");
const dest = path.join(destDir, `proxy-app-${triple}${ext}`);

if (!fs.existsSync(src)) {
  console.error(`Missing ${src}; run: cargo build --release -p proxy-app`);
  process.exit(1);
}
fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
if (process.platform !== "win32") {
  fs.chmodSync(dest, 0o755);
}
console.log("copied sidecar to", dest);
