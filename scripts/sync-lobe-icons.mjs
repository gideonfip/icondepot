#!/usr/bin/env node
/**
 * sync-lobe-icons.mjs
 *
 * Syncs AI/LLM provider icons from lobehub/lobe-icons into this repo.
 *
 * Usage:
 *   node scripts/sync-lobe-icons.mjs              # dry run
 *   node scripts/sync-lobe-icons.mjs --apply     # actually download
 *   node scripts/sync-lobe-icons.mjs --apply --overwrite  # overwrite existing
 *
 * What it does:
 *   1. Reads lobe-icons toc.ts to get icon list
 *   2. Downloads SVG files from lobe-icons static CDN
 *   3. Normalizes names to kebab-case
 *   4. Writes meta/*.json entries with source: "lobe"
 *   5. Updates metadata.json
 *   6. Applies normalize rules (dedupe, collisions)
 */

import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import https from "node:https";
import http from "node:http";

const ROOT = new URL("../", import.meta.url).pathname;
const SVG_DIR = path.join(ROOT, "svg");
const META_DIR = path.join(ROOT, "meta");
const METADATA_FILE = path.join(ROOT, "metadata.json");
const LOBE_RAW = "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons";
const LOBE_TOC_URL = "https://raw.githubusercontent.com/lobehub/lobe-icons/master/src/toc.ts";

const DRY = !process.argv.includes("--apply");
const OVERWRITE = process.argv.includes("--overwrite");
const VERBOSE = process.argv.includes("--verbose") || process.argv.includes("-v");

function log(...args) {
  if (VERBOSE) console.log("[sync-lobe]", ...args);
}

function info(...args) { console.log("[sync-lobe]", ...args); }
function warn(...args) { console.warn("[sync-lobe] WARN:", ...args); }
function err(...args) { console.error("[sync-lobe] ERROR:", ...args); }

// ─── HTTP fetch ─────────────────────────────────────────────────────────────────

async function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "sync-lobe-icons/1.0" } }, (res) => {
      if (res.statusCode === 404) return reject(new Error(`Not found: ${url}`));
      if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve(body));
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "sync-lobe-icons/1.0" } }, (res) => {
      if (res.statusCode === 404) return reject(new Error(`Not found: ${url}`));
      if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

// ─── TOC parsing ─────────────────────────────────────────────────────────────────

function parseLobeToc(tsContent) {
  // Find 'const toc' and start parsing from there
  const tocStart = tsContent.indexOf("const toc");
  if (tocStart === -1) return [];
  const tocBody = tsContent.slice(tocStart);

  // Find array start '[' and skip past it
  const arrStart = tocBody.indexOf("[");
  if (arrStart === -1) return [];
  const arrBody = tocBody.slice(arrStart + 1);

  // Character-by-character depth tracking for { }
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
  // 'OpenAI' -> 'openai', 'GoogleAI' -> 'google-ai', 'Claude2' -> 'claude-2'
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

  // Add title variations as aliases
  const kebabTitle = toKebab(entry.id);
  if (kebabTitle !== slug) aliases.push(kebabTitle);

  // Categorize by group
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

  // Color variants
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
  info(`Mode: ${DRY ? "DRY RUN (pass --apply to download)" : "LIVE"}`);
  if (OVERWRITE) info("Overwrite: ON");
  info("");

  // 1. Load existing metadata
  let existingMeta = {};
  try {
    existingMeta = JSON.parse(fs.readFileSync(METADATA_FILE, "utf8"));
    info(`Loaded existing metadata.json: ${Object.keys(existingMeta).length} entries`);
  } catch (e) {
    warn(`Could not load metadata.json: ${e.message}`);
  }

  // 2. Load lobe toc
  info(`Fetching lobe-icons toc from GitHub...`);
  let tocText;
  try {
    tocText = await fetchText(LOBE_TOC_URL);
  } catch (e) {
    err(`Failed to fetch lobe toc: ${e.message}`);
    process.exit(1);
  }
  const lobeEntries = parseLobeToc(tocText);
  info(`Parsed ${lobeEntries.length} lobe-icon entries`);

  // Filter: only process AI/provider/application group icons
  const toProcess = lobeEntries.filter(
    (e) => e.group === "model" || e.group === "provider" || e.group === "application"
  );
  info(`Filtered to ${toProcess.length} model/provider/application entries`);

  // 3. Build list of files to download
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

  info(`Pending download: ${pending.length}`);
  info(`Skipped (existing, no overwrite): ${skipCollisions.length}`);

  // 4. Download pending files (with concurrency control)
  let downloaded = 0;
  let failed = 0;
  const updatedMeta = { ...existingMeta };
  const newMetaFiles = [];
  const CONCURRENCY = 5;
  const BATCH_LOG = 20;

  async function downloadOne(entry, slug) {
    const monoUrl = `${LOBE_RAW}/${entry.id}.svg`;
    const colorUrl = `${LOBE_RAW}/${entry.id}-color.svg`;
    const colorDst = path.join(SVG_DIR, `${slug}-color.svg`);
    const monoDst = path.join(SVG_DIR, `${slug}.svg`);
    const metaDst = path.join(META_DIR, `${slug}.json`);

    // Download mono SVG
    try {
      if (DRY) {
        log(`[DRY] would download: ${monoUrl}`);
      } else {
        const buf = await fetchBuffer(monoUrl);
        fs.mkdirSync(SVG_DIR, { recursive: true });
        fs.writeFileSync(monoDst, buf);
        log(`Saved: ${monoDst}`);
      }
    } catch (e) {
      warn(`Failed mono ${entry.id}: ${e.message}`);
      return false;
    }

    // Download color variant if available
    try {
      if (!DRY) {
        const buf = await fetchBuffer(colorUrl);
        fs.writeFileSync(colorDst, buf);
        log(`Saved color: ${colorDst}`);
      }
    } catch (e) {
      // Color variant may not exist — that's ok
    }

    // Write meta file ONLY after successful download
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
    const results = await Promise.all(batch.map(({ entry, slug }) => downloadOne(entry, slug)));
    const ok = results.filter(Boolean).length;
    downloaded += ok;
    if (!DRY && (i + CONCURRENCY) % BATCH_LOG === 0) {
      info(`Progress: ${Math.min(i + CONCURRENCY, pending.length)}/${pending.length} (${downloaded} ok)`);
    }
  }

  // 5. Write updated metadata.json
  if (!DRY && downloaded > 0) {
    const sorted = Object.keys(updatedMeta)
      .sort()
      .reduce((acc, k) => ({ ...acc, [k]: updatedMeta[k] }), {});
    fs.writeFileSync(METADATA_FILE, JSON.stringify(sorted, null, 4) + "\n");
    info(`Updated metadata.json with ${downloaded} new entries`);
  }

  // 6. Summary
  info("");
  info("=== Summary ===");
  info(`Mode:  ${DRY ? "DRY RUN" : "LIVE"}`);
  info(`Lobe entries found:  ${lobeEntries.length}`);
  info(`Entries to process:   ${pending.length}`);
  info(`Downloaded:           ${downloaded}`);
  info(`Failed:               ${failed}`);
  info(`Skipped (exists):     ${skipCollisions.length}`);
  info(`New meta files:      ${newMetaFiles.length}`);
  if (newMetaFiles.length > 0) {
    info(`New icons: ${newMetaFiles.join(", ")}`);
  }

  if (DRY) {
    info("");
    warn("=== DRY RUN — no files were written ===");
    warn("Run again with --apply to download and write files.");
  }
}

main().catch((e) => {
  err(`Fatal: ${e.message}`);
  process.exit(1);
});
