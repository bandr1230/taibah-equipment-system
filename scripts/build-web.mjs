import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "www");

const ignoredDirs = new Set([
  ".git",
  "android",
  "deck_taibah_program",
  "node_modules",
  "output",
  "scratch",
  "scripts",
  "src",
  "supabase",
  "tmp",
  "www"
]);

const allowedRootFiles = new Set([
  "assistant_chat.html",
  "ai-analyzer.js",
  "app.js",
  "data.js",
  "index.html",
  "manifest.webmanifest",
  "need-engine.js",
  "public-asset.html",
  "public-asset.js",
  "service-worker.js",
  "style.css",
  "supabase-adapter.js",
  "supabase-config.js",
  "taibah-logo.png"
]);

const allowedExtensions = new Set([
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp"
]);

function shouldCopyRootFile(name) {
  if (allowedRootFiles.has(name)) return true;
  const lower = name.toLowerCase();
  if (lower.endsWith(".zip")) return false;
  if (lower === "package.json" || lower === "package-lock.json" || lower === "capacitor.config.json") return false;
  return allowedExtensions.has(path.extname(lower));
}

async function copyIfExists(relativePath) {
  const source = path.join(root, relativePath);
  try {
    const info = await stat(source);
    if (!info.isDirectory()) return;
    await cp(source, path.join(outDir, relativePath), {
      recursive: true,
      filter: (current) => {
        const relative = path.relative(source, current);
        const base = path.basename(current);
        if (!relative) return true;
        if (base === ".DS_Store" || base.endsWith(".zip")) return false;
        return !ignoredDirs.has(base);
      }
    });
  } catch {
    // Optional runtime asset folders are copied only when present.
  }
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const entries = await readdir(root, { withFileTypes: true });
for (const entry of entries) {
  if (entry.isFile() && shouldCopyRootFile(entry.name)) {
    await cp(path.join(root, entry.name), path.join(outDir, entry.name));
  }
}

await copyIfExists("icons");
await copyIfExists("assets");
await copyIfExists("images");
await copyIfExists("fonts");

console.log(`Built static web files into ${path.relative(root, outDir)}`);
