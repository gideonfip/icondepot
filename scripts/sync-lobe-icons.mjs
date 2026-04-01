#!/usr/bin/env node
/**
 * sync-lobe-icons.mjs
 *
 * Syncs AI/LLM provider icons from lobehub/lobe-icons into this repo.
 * Uses local clone at /tmp/lobe-icons instead of fetching from GitHub CDN.
 *
 * Usage:
 *   node scripts/sync-lobe-icons.mjs              # dry run
 *   node scripts/sync-lobe-icons.mjs --apply     # actually sync
 *   node scripts/sync-lobe-icons.mjs --apply --overwrite  # overwrite existing
 *
 * What it does:
 *   1. Reads lobe-icons toc.ts from local clone
 *   2. Reads SVG files from local /tmp/lobe-icons/packages/static-svg/icons/
 *   3. Normalizes names to kebab-case
 *   4. Writes meta/*.json entries with source: "lobe"
 *   5. Updates metadata.json
 *   6. Applies normalize rules (dedupe, collisions)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SVG_DIR = path.join(ROOT, "svg");
const META_DIR = path.join(ROOT, "meta");
const METADATA_FILE = path.join(ROOT, "metadata.json");
const LOBE_CLONE = "/tmp/lobe-icons";
const LOBE_SVG_DIR = path.join(LOBE_CLONE, "packages/static-svg/icons");
const LOBE_TOC_FILE = path.join(LOBE_CLONE, "src/toc.ts");

const DRY = !process.argv.includes("--apply");
const OVERWRITE = process.argv.includes("--overwrite");
const VERBOSE = process.argv.includes("--verbose") || process.argv.includes("-v");

function log(...args) {
  if (VERBOSE) console.log("[sync-lobe]", ...args);
}

function info(...args) { console.log("[sync-lobe]", ...args); }
function warn(...args) { console.warn("[sync-lobe] WARN:", ...args); }
function err(...args) { console.error("[sync-lobe] ERROR:", ...args); }

// ─── Local file read ───────────────────────────────────────────────────────────

function readLocalFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (e) {
    return null;
  }
}

function readLocalBuffer(filePath) {
  try {
    return fs.readFileSync(filePath);
  } catch (e) {
    return null;
  }
}

// ─── TOC parsing ─────────────────────────────────────────────────────────────────

function parseLobeToc(tsContent) {
  const tocStart = tsContent.indexOf("const toc");
  if (tocStart === -1) return [];
  const tocBody = tsContent.slice(tocStart);
  const arrStart = tocBody.indexOf("[");
  if (arrStart === -1) return [];
  const arrBody = tocBody.slice(arrStart + 1);

  let depth = 0;
  let blockStart = -1;
  const entries = [];

  for (let i = 0; i < arrBody.length; i++) {
    const ch = arrBody[i];
    if (ch === "{") {
      if (depth === 0) blockStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && blockStart !== -1) {
        const block = arrBody.slice(blockStart, i + 1);
        const idMatch = block.match(/id:\s*['"]([^'"]+)['"]/);
        const titleMatch = block.match(/title:\s*['"]([^'"]+)['"]/);
        const groupMatch = block.match(/group:\s*['"]([^'"]+)['"]/);
        const colorMatch = block.match(/color:\s*['"]([^'"]+)['"]/);
        if (idMatch && titleMatch && groupMatch && colorMatch) {
          entries.push({
            id: idMatch[1],
            title: titleMatch[1],
            group: groupMatch[1],
            color: colorMatch[1],
          });
        }
        blockStart = -1;
      }
    }
  }
  return entries;
}

// ─── Naming ────────────────────────────────────────────────────────────────────

function toKebab(str) {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

// ─── Icon classification ───────────────────────────────────────────────────────

function getVariantSuffixes(entry) {
  const { hasColor, hasText, hasTextCn, hasBrand, hasBrandColor, hasCombine, hasAvatar } = entry.param || {};
  const suffixes = [];
  if (hasColor) suffixes.push("-color");
  if (hasText) suffixes.push("-text");
  if (hasTextCn) suffixes.push("-text-cn");
  if (hasBrand) suffixes.push("-brand");
  if (hasBrandColor) suffixes.push("-brand-color");
  return suffixes;
}

// ─── Metadata generation ────────────────────────────────────────────────────────

function lobeEntryToMeta(entry, slug) {
  const now = new Date().toISOString();
  const aliases = [];

  const kebabTitle = toKebab(entry.id);
  if (kebabTitle !== slug) aliases.push(kebabTitle);

  const categoryMap = {
    model: "AI-&-LLM-Platforms",
    provider: "AI-&-LLM-Platforms",
    application: "AI-&-LLM-Platforms",
  };
  const categories = [categoryMap[entry.group] || "AI-&-LLM-Platforms"];

  const hasVariants = (entry.param?.hasColor || entry.param?.hasText || false);
  const meta = {
    base: "svg",
    aliases,
    categories,
    source: "lobe",
    update: {
      timestamp: now,
      author: { id: "lobehub", name: "LobeHub" },
    },
  };

  if (hasVariants) {
    meta.colors = {};
    if (entry.param?.hasColor) meta.colors.dark = `${slug}-color`;
    if (entry.param?.hasText) meta.colors.light = `${slug}-text`;
  }

  return meta;
}

// ─── Main sync ─────────────────────────────────────────────────────────────────

async function main() {
  info("=== Lobe Icons Sync ===");
  info(`Root: ${ROOT}`);
  info(`Lobe clone: ${LOBE_CLONE}`);
  info(`Mode: ${DRY ? "DRY RUN (pass --apply to sync)" : "LIVE"}`);
  if (OVERWRITE) info("Overwrite: ON");
  info("");

  // Verify local clone exists
  if (!fs.existsSync(LOBE_CLONE)) {
    err(`Lobe clone not found at ${LOBE_CLONE}`);
    err("Please run: git clone --depth 1 https://github.com/lobehub/lobe-icons.git /tmp/lobe-icons");
    process.exit(1);
  }
  if (!fs.existsSync(LOBE_TOC_FILE)) {
    err(`Lobe toc.ts not found at ${LOBE_TOC_FILE}`);
    process.exit(1);
  }

  // 1. Load existing metadata
  let existingMeta = {};
  try {
    existingMeta = JSON.parse(fs.readFileSync(METADATA_FILE, "utf8"));
    info(`Loaded existing metadata.json: ${Object.keys(existingMeta).length} entries`);
  } catch (e) {
    warn(`Could not load metadata.json: ${e.message}`);
  }

  // 2. Load lobe toc from local file
  info(`Reading lobe-icons toc from local clone...`);
  let tocText;
  try {
    tocText = readLocalFile(LOBE_TOC_FILE);
    if (!tocText) throw new Error("Failed to read toc.ts");
  } catch (e) {
    err(`Failed to read lobe toc: ${e.message}`);
    process.exit(1);
  }
  const lobeEntries = parseLobeToc(tocText);
  info(`Parsed ${lobeEntries.length} lobe-icon entries`);

  // Filter: only process AI/provider/application group icons
  const toProcess = lobeEntries.filter(
    (e) => e.group === "model" || e.group === "provider" || e.group === "application"
  );
  info(`Filtered to ${toProcess.length} model/provider/application entries`);

  // 3. Build list of files to sync
  const pending = [];
  const skipCollisions = [];

  for (const entry of toProcess) {
    const slug = toKebab(entry.id);
    const baseFile = path.join(SVG_DIR, `${slug}.svg`);

    const exists = fs.existsSync(baseFile);
    if (exists && !OVERWRITE) {
      skipCollisions.push({ entry, slug, reason: "exists", file: baseFile });
      continue;
    }

    pending.push({ entry, slug });
  }

  info(`Pending sync: ${pending.length}`);
  info(`Skipped (existing, no overwrite): ${skipCollisions.length}`);

  // 4. Sync pending files (local reads with concurrency control)
  let synced = 0;
  let failed = 0;
  const updatedMeta = { ...existingMeta };
  const newMetaFiles = [];
  const CONCURRENCY = 10;
  const BATCH_LOG = 50;

  async function syncOne(entry, slug) {
    const monoSrc = path.join(LOBE_SVG_DIR, `${entry.id}.svg`);
    const colorSrc = path.join(LOBE_SVG_DIR, `${entry.id}-color.svg`);
    const monoDst = path.join(SVG_DIR, `${slug}.svg`);
    const colorDst = path.join(SVG_DIR, `${slug}-color.svg`);
    const metaDst = path.join(META_DIR, `${slug}.json`);

    // Read mono SVG from local
    let monoContent = readLocalBuffer(monoSrc);
    if (!monoContent) {
      warn(`Missing local SVG: ${monoSrc}`);
      return false;
    }

    if (DRY) {
      log(`[DRY] would sync: ${monoDst}`);
    } else {
      fs.mkdirSync(SVG_DIR, { recursive: true });
      fs.writeFileSync(monoDst, monoContent);
      log(`Saved: ${monoDst}`);
    }

    // Read color variant if available
    let colorContent = readLocalBuffer(colorSrc);
    if (colorContent) {
      if (!DRY) {
        fs.writeFileSync(colorDst, colorContent);
        log(`Saved color: ${colorDst}`);
      }
    }

    // Write meta file ONLY after successful read
    const meta = lobeEntryToMeta(entry, slug);
    if (!DRY && fs.existsSync(monoDst)) {
      fs.mkdirSync(META_DIR, { recursive: true });
      fs.writeFileSync(metaDst, JSON.stringify(meta, null, 2) + "\n");
      newMetaFiles.push(slug);
    }

    updatedMeta[slug] = meta;
    return true;
  }

  // Process in batches
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(({ entry, slug }) => syncOne(entry, slug)));
    const ok = results.filter(Boolean).length;
    synced += ok;
    if (!DRY && (i + CONCURRENCY) % BATCH_LOG === 0) {
      info(`Progress: ${Math.min(i + CONCURRENCY, pending.length)}/${pending.length} (${synced} ok)`);
    }
  }

  // 5. Write updated metadata.json
  if (!DRY && synced > 0) {
    const sorted = Object.keys(updatedMeta)
      .sort()
      .reduce((acc, k) => ({ ...acc, [k]: updatedMeta[k] }), {});
    fs.writeFileSync(METADATA_FILE, JSON.stringify(sorted, null, 4) + "\n");
    info(`Updated metadata.json with ${synced} new entries`);
  }

  // 6. Summary
  info("");
  info("=== Summary ===");
  info(`Mode:  ${DRY ? "DRY RUN" : "LIVE"}`);
  info(`Lobe entries found:  ${lobeEntries.length}`);
  info(`Entries to process:   ${pending.length}`);
  info(`Synced:              ${synced}`);
  info(`Failed:              ${failed}`);
  info(`Skipped (exists):    ${skipCollisions.length}`);
  info(`New meta files:     ${newMetaFiles.length}`);
  if (newMetaFiles.length > 0) {
    info(`New icons: ${newMetaFiles.join(", ")}`);
  }

  if (DRY) {
    info("");
    warn("=== DRY RUN — no files were written ===");
    warn("Run again with --apply to sync files.");
  }
}

main().catch((e) => {
  err(`Fatal: ${e.message}`);
  process.exit(1);
});
