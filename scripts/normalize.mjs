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
 *   1. Broken/invalid SVG files              → report or remove
 *   2. Metadata entries without any SVG      → report or remove
 *   3. SVG files without metadata entry      → report (not removed)
 *   4. Missing license headers in SVG       → inject if missing
 *   5. Tag entries with source ("dashboard" or "lobe")
 */

import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
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
  "hugging-face","kilo-code","fireworks","hyperbolic",
  "ace","adobe","adobe-firefly","agent-voice","agui","ai2","ai21","ai302",
  "ai360","ai-hub-mix","ai-mass","aion-labs","ai-studio","akash-chat",
  "aleph-alpha","alibaba","alibaba-cloud","amp","ant-group","anthropic",
  "antigravity","anyscale","apertis","apple","arcee","ask-verdict",
  "assembly-ai","atlas-cloud","automatic","aws","aya","azure","azure-ai",
  "baai","baichuan","baidu","baidu-cloud","bailian","baseten","bedrock",
  "bfl","bilibili","bilibili-index","bing","bria-ai","burn-cloud",
  "byte-dance","cap-cut","cent-ml","chat-glm","cherry-studio","civitai",
  "claude","claude-code","cline","clipdrop","cloudflare","code-flicker",
  "code-gee-x","codex","cog-video","cog-view","colab","comet-api",
  "comfy-ui","command-a","copilot","copilot-kit","coqui","coze","crew-ai",
  "crusoe","cursor","cyber-cut","dalle","dbrx","deep-ai","deep-cogito",
  "deep-infra","deep-l","deep-mind","deep-seek","dify","doc2x","doc-search",
  "dolphin","doubao","dream-machine","eleven-labs","eleven-x","essential-ai",
  "exa","fal","fast-gpt","featherless","figma","fish-audio","flora",
  "flowith","flux","friendli","gemini-cli","gemma","gitee-ai","github",
  "github-copilot","glama","glif","glmv","google","google-cloud","goose",
  "gradio","greptile","grok","hailuo","haiper","hedra","higress","huawei",
  "huawei-cloud","hunyuan","ibm","ideogram","i-fly-tek-cloud","inception",
  "inference","infermatic","infinigence","inflection","intern-lm","jimeng",
  "jina","junie","kimi","kling","kluster","kolors","krea","kwai-kat",
  "kwaipilot","lambda","lang-chain","langfuse","lang-graph","lang-smith",
  "lepton-ai","lg","lightricks","liquid","live-kit","llama-index","l-la-va",
  "llm-api","lm-studio","lobe-hub","long-cat","lovable","lovart","luma",
  "magic","make","manus","mastra","mcp","mcp-so","menlo","meta","meta-ai",
  "meta-gpt","microsoft","midjourney","minimax","model-scope","monica",
  "moonshot","morph","my-shell","n8n","nano-banana","nebius","new-api",
  "notebook-lm","notion","nous-research","nova","novel-ai","novita",
  "npl-cloud","nvidia","obsidian","ollama","open-ai","open-chat","open-claw",
  "open-code","open-hands","open-router","open-web-ui","pa-lm","parasail",
  "perplexity","phidata","phind","pika","pix-verse","player2","poe",
  "pollinations","ppio","pruna-ai","pydantic-ai","qingyan","qiniu","qoder",
  "qwen","railway","recraft","relace","replicate","replit","reve","roo-code",
  "rss-hub","runway","rwkv","samba-nova","search1api","search-api",
  "sense-nova","silicon-cloud","skywork","smithery","snowflake","soph-net",
  "sora","spark","stability","state-cloud","stepfun","straico","stream-lake",
  "sub-model","suno","sync","targon","tavily","tencent","tencent-cloud",
  "tiangong","tii","topaz-labs","trae","tripo","turi-x","udio","unstructured",
  "upstage","v0","vectorizer-ai","vercel","vertex-ai","vidu","viggle",
  "vllm","volcengine","voyage","wenxin","windsurf","workers-ai","xai",
  "xiaomi-mi-mo","xinference","xpay","xuanyuan","yandex","yi","you-mind",
  "yuanbao","zai","zapier","zeabur","zencoder","zen-mux","zero-one","zhipu",
]);

const KNOWN_VARIANT_SUFFIXES = ["-light", "-dark", "-color", "-text", "-text-cn", "-brand", "-brand-color"];

function stripVariantSuffix(name) {
  let base = name;
  for (const suf of KNOWN_VARIANT_SUFFIXES) {
    if (base.endsWith(suf)) base = base.slice(0, -suf.length);
  }
  return base;
}

function isValidSvg(content) {
  return (
    content.includes("<svg") &&
    content.includes("</svg>") &&
    !content.includes("<script")
  );
}

async function main() {
  info("=== Icon Normalize ===");
  info(`Root: ${ROOT}`);
  info(`Mode: ${DRY ? "DRY RUN (pass --apply to fix)" : "LIVE"}`);
  info("");

  let metadata = {};
  try {
    metadata = JSON.parse(fs.readFileSync(METADATA_FILE, "utf8"));
    info(`metadata.json: ${Object.keys(metadata).length} entries`);
  } catch (e) {
    warn(`Could not load metadata.json: ${e.message}`);
  }

  let svgFiles = [];
  try {
    svgFiles = fs.readdirSync(SVG_DIR).filter((f) => f.endsWith(".svg"));
    info(`svg/: ${svgFiles.length} files`);
  } catch (e) {
    warn(`Could not read svg/: ${e.message}`);
  }

  // ── 1. Broken SVG files ─────────────────────────────────────────────────────
  const brokenSvg = [];
  for (const f of svgFiles) {
    try {
      const content = fs.readFileSync(path.join(SVG_DIR, f), "utf8");
      if (!isValidSvg(content)) brokenSvg.push(f);
    } catch (e) {
      brokenSvg.push(f);
    }
  }
  if (brokenSvg.length > 0) {
    warn(`Broken/invalid SVG files: ${brokenSvg.length}`);
    brokenSvg.forEach((f) => warn(`  broken: ${f}`));
    if (!DRY) {
      for (const f of brokenSvg) {
        fs.unlinkSync(path.join(SVG_DIR, f));
        info(`Removed broken SVG: ${f}`);
      }
    }
  }

  // ── 2. Metadata entries without any SVG variant ──────────────────────────────
  const orphansMeta = [];
  for (const slug of Object.keys(metadata)) {
    const hasSvg = svgFiles.some((f) => {
      const base = f.replace(/\.svg$/, "");
      return base === slug || base.startsWith(slug + "-");
    });
    if (!hasSvg) orphansMeta.push(slug);
  }
  if (orphansMeta.length > 0) {
    info(`Orphan metadata entries (no SVG): ${orphansMeta.length}`);
    if (VERBOSE) orphansMeta.slice(0, 30).forEach((k) => log(`  orphan: ${k}`));
    if (!DRY) {
      for (const k of orphansMeta) {
        const metaFile = path.join(META_DIR, `${k}.json`);
        if (fs.existsSync(metaFile)) {
          fs.unlinkSync(metaFile);
          info(`Removed orphan meta: ${k}.json`);
        }
        delete metadata[k];
      }
    }
  }

  // ── 3. SVG without metadata entry ──────────────────────────────────────────
  const orphansSvg = [];
  for (const f of svgFiles) {
    const base = f.replace(/\.svg$/, "");
    const stripped = stripVariantSuffix(base);
    const hasMeta = fs.existsSync(path.join(META_DIR, `${stripped}.json`)) || !!metadata[stripped];
    if (!hasMeta) orphansSvg.push(f);
  }
  if (orphansSvg.length > 0) {
    info(`SVG without metadata entry: ${orphansSvg.length}`);
    if (VERBOSE) orphansSvg.slice(0, 20).forEach((k) => log(`  no-meta: ${k}`));
  }

  // ── 4. Source tagging ───────────────────────────────────────────────────────
  let tagged = 0;
  for (const [slug, meta] of Object.entries(metadata)) {
    if (!meta.source) {
      meta.source = LOBE_SOURCES.has(slug) ? "lobe" : "dashboard";
      if (VERBOSE) log(`tagged source=${meta.source} for ${slug}`);
      if (!DRY) tagged++;
    }
  }
  if (tagged > 0) {
    info(`Tagged ${tagged} entries with source`);
  }

  // ── 5. Write fixed metadata ─────────────────────────────────────────────────
  if (!DRY) {
    const sorted = Object.keys(metadata).sort()
      .reduce((acc, k) => ({ ...acc, [k]: metadata[k] }), {});
    fs.writeFileSync(METADATA_FILE, JSON.stringify(sorted, null, 4) + "\n");
    info("Wrote metadata.json");
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  info("");
  info("=== Summary ===");
  info(`SVG files:     ${svgFiles.length}`);
  info(`Metadata keys: ${Object.keys(metadata).length}`);
  info(`Orphan meta:   ${orphansMeta.length}`);
  info(`Orphan SVG:    ${orphansSvg.length}`);
  info(`Broken SVG:    ${brokenSvg.length}`);
  info(`Tagged:        ${tagged}`);

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
