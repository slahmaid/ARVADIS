const fs = require("fs");
const path = require("path");

const root = __dirname;
const htmlFiles = fs
  .readdirSync(root)
  .filter((name) => name.endsWith(".html"))
  .map((name) => path.join(root, name));

const localAssetRegex = /\b(?:src|href)=["']([^"']+)["']/g;
const ignoredPrefixes = ["http://", "https://", "mailto:", "tel:", "#", "data:"];

const missing = [];

function isIgnored(link) {
  return ignoredPrefixes.some((prefix) => link.startsWith(prefix));
}

for (const file of htmlFiles) {
  const content = fs.readFileSync(file, "utf8");
  let match;
  while ((match = localAssetRegex.exec(content)) !== null) {
    const ref = match[1];
    if (isIgnored(ref)) continue;
    const normalized = ref.split("?")[0].split("#")[0];
    const absolute = path.resolve(path.dirname(file), normalized);
    if (!fs.existsSync(absolute)) {
      missing.push({
        file: path.basename(file),
        ref: normalized,
      });
    }
  }
}

if (missing.length) {
  console.error("Missing local assets:");
  missing.forEach((item) => {
    console.error(`- ${item.file}: ${item.ref}`);
  });
  process.exit(1);
}

console.log("Asset validation passed: no missing local files.");
