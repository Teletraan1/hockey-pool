import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "public");
const output = resolve(root, "dist");
const version = String(process.env.GITHUB_SHA ?? "local")
  .slice(0, 12)
  .replace(/[^a-zA-Z0-9_-]/g, "");

if (!output.startsWith(`${root}${sep}`)) {
  throw new Error("Refusing to build outside the repository.");
}

await rm(output, { recursive: true, force: true });
await cp(source, output, { recursive: true });

for (const relativePath of ["index.html", "app.js"]) {
  const path = resolve(output, relativePath);
  const contents = await readFile(path, "utf8");
  if (!contents.includes("__ASSET_VERSION__")) {
    throw new Error(`${relativePath} is missing its asset-version placeholder.`);
  }
  await writeFile(
    path,
    contents.replaceAll("__ASSET_VERSION__", version),
    "utf8"
  );
}

console.log(`Built versioned site assets in dist/ (${version}).`);
