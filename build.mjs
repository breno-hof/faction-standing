// Builds the installable module into dist/, laid out exactly as Foundry expects:
//   dist/module.json, scripts/, styles/, lang/, templates/, README.md (and LICENSE when present)
//
//   node build.mjs            production build (minified)
//   node build.mjs --dev      source maps, no minification
//   node build.mjs --watch    --dev and rebuild on change
//
// The script and stylesheet carry the version in their file name, so browsers
// and proxies never pair a cached old script with a new module.json.
// The built module.json downloads the zip of its own tag, so a version installed
// from its version-specific manifest gets that version, not the latest one.
// Symlink dist/ to <Foundry data>/modules/faction-standing to test (npm run link).
import { cp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { context } from "esbuild";

const watch = process.argv.includes("--watch");
const dev = watch || process.argv.includes("--dev");
const STATIC = [
  ["src/lang", "lang"],
  ["src/templates", "templates"],
  ["src/styles", "styles"],
  ["README.md", "README.md"],
  ["LICENSE", "LICENSE"],
];

const manifest = JSON.parse(await readFile("module.json", "utf8"));
const { id, version } = manifest;
const script = `scripts/main-${version}.js`;
const style = `styles/${id}-${version}.css`;
const repo = new URL(manifest.url).pathname.slice(1);

async function writeStatic() {
  await Promise.all(
    STATIC.filter(([from]) => existsSync(from)).map(([from, to]) =>
      cp(from, `dist/${to}`, { recursive: true }),
    ),
  );
  await rename(`dist/styles/${id}.css`, `dist/${style}`);
  await writeFile(
    "dist/module.json",
    `${JSON.stringify(
      {
        ...manifest,
        esmodules: [script],
        styles: [style],
        download: `https://github.com/${repo}/releases/download/v${version}/${id}.zip`,
      },
      null,
      2,
    )}\n`,
  );
}

await rm("dist", { recursive: true, force: true });
const ctx = await context({
  entryPoints: ["src/main.ts"],
  outfile: `dist/${script}`,
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: !dev,
  sourcemap: dev,
  logLevel: "info",
  plugins: [{ name: "foundry-static", setup: (build) => build.onEnd(writeStatic) }],
});

if (watch) {
  // Templates, styles and lang are copied on every rebuild; touch a .ts file to refresh them.
  await ctx.watch();
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
