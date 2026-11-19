// Registers this version on the foundryvtt.com package page through the
// Package Release API (https://foundryvtt.com/article/package-release-api/).
//
//   FOUNDRY_RELEASE_TOKEN=fvttp_... node tools/foundry-release.mjs [--dry-run]
//
// Run by the release workflow after the GitHub release exists, because the
// version-specific manifest it sends must already be downloadable. Without a
// token it does nothing, so releases keep working before the package is approved.
import { readFile } from "node:fs/promises";

const ENDPOINT = "https://foundryvtt.com/_api/packages/release_version/";
const dryRun = process.argv.includes("--dry-run");
const token = process.env.FOUNDRY_RELEASE_TOKEN?.trim();

if (!token) {
  console.log("::notice::FOUNDRY_RELEASE_TOKEN is not set; skipping the foundryvtt.com release.");
  process.exit(0);
}

const manifest = JSON.parse(await readFile("module.json", "utf8"));
const tag = process.env.TAG ?? `v${manifest.version}`;
const repo = process.env.REPO ?? new URL(manifest.url).pathname.slice(1);
const compatibility = manifest.compatibility ?? {};

const body = {
  id: manifest.id,
  ...(dryRun ? { "dry-run": true } : {}),
  release: {
    version: manifest.version,
    manifest: `https://github.com/${repo}/releases/download/${tag}/module.json`,
    notes: `https://github.com/${repo}/releases/tag/${tag}`,
    compatibility: {
      minimum: String(compatibility.minimum ?? ""),
      verified: String(compatibility.verified ?? ""),
      maximum: String(compatibility.maximum ?? ""),
    },
  },
};

async function send() {
  return fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify(body),
  });
}

console.log(
  `${dryRun ? "Validating" : "Releasing"} ${body.id} ${body.release.version} on foundryvtt.com`,
);
console.log(`  manifest: ${body.release.manifest}`);

let response = await send();
if (response.status === 429) {
  // One release per package per minute; wait as told and try once more.
  const wait = Number(response.headers.get("Retry-After")) || 60;
  console.log(`Rate limited; retrying in ${wait}s.`);
  await new Promise((resolve) => setTimeout(resolve, wait * 1000));
  response = await send();
}

const result = await response.json().catch(() => ({}));
if (!response.ok || result.status !== "success") {
  console.log(
    `::error::foundryvtt.com answered HTTP ${response.status}: ${JSON.stringify(result.errors ?? result)}`,
  );
  process.exit(1);
}
console.log(result.message ?? `Released: ${result.page}`);
