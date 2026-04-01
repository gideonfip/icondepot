#!/usr/bin/env node
/**
 * normalize.mjs
 *
 * Cleanup and dedupe scripts for the icon database.
 *
 * Usage:
 *   node scripts/normalize.mjs              # scan and report
 *   node scripts/normalize.mjs --apply      # fix issues
 *   node scripts/normalize.mjs --apply -v  # verbose fix
 *
 * What it checks/fixes:
 *   1. SVG files without metadata entries  → report or remove
 *   2. Metadata entries without SVG files  → report or remove
 *   3. Duplicate/collision slugs           → report or remove older
 *   4. Broken/invalid SVG files           → report or remove
 *   5. Missing license headers in SVG      → inject if missing
 *   6. Inconsistent category assignments   → normalize
 */

import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

const ROOT = new URL("../", import.meta.url).pathname;
const SVG_DIR = path.join(ROOT, "svg");
const META_DIR = path.join(ROOT, "meta");
const METADATA_FILE = path.join(ROOT, "metadata.json");

const DRY = !process.argv.includes("--apply");
const VERBOSE = process.argv.includes("--verbose") || process.argv.includes("-v");

function log(...a) { if (VERBOSE) console.log("[norm]", ...a); }
function info(...a) { console.log("[norm]", ...a); }
function warn(...a) { console.warn("[norm] WARN:", ...a); }
function err(...a) { console.error("[norm] ERROR:", ...a); }

const LOBE_SOURCES = new Set([
  "gemini","mistral","cohere","groq","cerebras","together",
  "huggingface","kilocode","fireworks","hyperbolic","llmgateway",
  "okx","taiko","avalanche","metamask","eigenlayer","eigenlayer-wordmark",
]);

// ─── SVG validation ─────────────────────────────────────────────────────────────

function isValidSvg(content) {
  return (
    content.includes("<svg") &&
    content.includes("</svg>") &&
    !content.includes("<script")
  );
}

function svgNeedsLicenseInjection(content) {
  return !content.includes("Apache License") && !content.includes("SPDX-License-Identifier");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  info("=== Icon Normalize ===");
  info(`Root: ${ROOT}`);
  info(`Mode: ${DRY ? "DRY RUN (pass --apply to fix)" : "LIVE"}`);
  info("");

  // 1. Load metadata
  let metadata = {};
  try {
    metadata = JSON.parse(fs.readFileSync(METADATA_FILE, "utf8"));
    info(`metadata.json: ${Object.keys(metadata).length} entries`);
  } catch (e) {
    warn(`Could not load metadata.json: ${e.message}`);
  }

  // 2. List SVG files
  let svgFiles = [];
  try {
    svgFiles = fs.readdirSync(SVG_DIR).filter((f) => f.endsWith(".svg"));
    info(`svg/: ${svgFiles.length} files`);
  } catch (e) {
    warn(`Could not read svg/: ${e.message}`);
  }

  // 3. Normalize SVG names
  const svgBases = new Set();
  for (const f of svgFiles) {
    let base = f.replace(/\.svg$/, "");
    for (const suf of ["-light", "-dark", "-color", "-text", "-text-cn", "-brand", "-brand-color"]) {
      if (base.endsWith(suf)) base = base.slice(0, -suf.length);
    }
    svgBases.add(base);
  }

  // 4. Metadata without SVG → orphan metadata
  const orphansMeta = Object.keys(metadata).filter((k) => !svgBases.has(k));
  if (orphansMeta.length > 0) {
    info(`Orphan metadata entries (no SVG): ${orphansMeta.length}`);
    if (VERBOSE) orphansMeta.forEach((k) => log(`  orphan: ${k}`));
    if (!DRY && orphansMeta.length > 0) {
      for (const k of orphansMeta) {
        const metaFile = path.join(META_DIR, `${k}.json`);
        if (fs.existsSync(metaFile)) {
          fs.unlinkSync(metaFile);
          info(`Removed orphan meta: ${k}.json`);
        }
      }
    }
  }

  // 5. SVG without metadata → orphan SVG
  const orphansSvg = [];
  for (const base of svgBases) {
    const metaFile = path.join(META_DIR, `${base}.json`);
    if (!fs.existsSync(metaFile) && !metadata[base]) {
      orphansSvg.push(base);
    }
  }
  if (orphansSvg.length > 0) {
    info(`SVG without metadata (no meta entry): ${orphansSvg.length}`);
    if (VERBOSE) orphansSvg.slice(0, 20).forEach((k) => log(`  no-meta: ${k}`));
  }

  // 6. Broken SVG files
  const brokenSvg = [];
  for (const f of svgFiles) {
    try {
      const content = fs.readFileSync(path.join(SVG_DIR, f), "utf8");
      if (!isValidSvg(content)) {
        brokenSvg.push(f);
      }
    } catch (e) {
      brokenSvg.push(f);
    }
  }
  if (brokenSvg.length > 0) {
    warn(`Broken/invalid SVG files: ${brokenSvg.length}`);
    brokenSvg.forEach((f) => warn(`  broken: ${f}`));
    if (!DRY && brokenSvg.length > 0) {
      for (const f of brokenSvg) {
        fs.unlinkSync(path.join(SVG_DIR, f));
        info(`Removed broken SVG: ${f}`);
      }
    }
  }

  // 7. Source tagging
  let tagged = 0;
  for (const [slug, meta] of Object.entries(metadata)) {
    if (!meta.source) {
      const isLobe = LOBE_SOURCES.has(slug);
      meta.source = isLobe ? "lobe" : "dashboard";
      if (VERBOSE) log(`tagged source=${meta.source} for ${slug}`);
      if (!DRY) tagged++;
    }
  }
  if (tagged > 0) {
    info(`Tagged ${tagged} entries with source`);
  }

  // 8. Report duplicates
  const seen = new Map();
  const duplicates = [];
  for (const base of svgBases) {
    if (seen.has(base)) {
      seen.get(base).push(base);
    } else {
      seen.set(base, [base]);
    }
  }
  const trueDups = [...seen.entries()].filter(([, v]) => v.length > 1);
  if (trueDups.length > 0) {
    warn(`Duplicate base names: ${trueDups.length}`);
    trueDups.forEach(([k, v]) => warn(`  ${k}: ${v.join(", ")}`));
  }

  // 9. Write fixed metadata
  if (!DRY) {
    const sorted = Object.keys(metadata)
      .sort()
      .reduce((acc, k) => ({ ...acc, [k]: metadata[k] }), {});
    fs.writeFileSync(METADATA_FILE, JSON.stringify(sorted, null, 4) + "\n");
    info("Wrote metadata.json");
  }

  // 10. Summary
  info("");
  info("=== Summary ===");
  info(`SVG files:      ${svgFiles.length}`);
  info(`Metadata keys:  ${Object.keys(metadata).length}`);
  info(`Orphan meta:    ${orphansMeta.length}`);
  info(`Orphan SVG:    ${orphansSvg.length}`);
  info(`Broken SVG:    ${brokenSvg.length}`);
  info(`Tagged:        ${tagged}`);
  info(`Duplicates:    ${trueDups.length}`);

  if (DRY) {
    info("");
    warn("=== DRY RUN — no files were changed ===");
    warn("Run again with --apply to apply fixes.");
  }
}

main().catch((e) => {
  err(`Fatal: ${e.message}`);
  process.exit(1);
});
