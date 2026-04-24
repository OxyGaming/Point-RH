#!/usr/bin/env node
// Génère les icônes PWA placeholder à partir d'un SVG inline.
// Usage : node scripts/generate-pwa-icons.mjs
// Remplacer publicdir/icons/*.png par les vrais assets une fois disponibles.

import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "icons");

const NAVY = "#1a3070";
const ACCENT = "#ffffff";

// SVG "plein bord" pour maskable (safe zone 80%)
function maskableSvg(size) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.30;
  const fontSize = Math.round(size * 0.26);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${NAVY}"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ACCENT}" stroke-width="${Math.round(size * 0.025)}" opacity="0.25"/>
  <text x="${cx}" y="${cy + fontSize * 0.35}" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="${fontSize}" font-weight="800" fill="${ACCENT}" text-anchor="middle" letter-spacing="${Math.round(size * 0.005)}">PRH</text>
</svg>`;
}

// SVG "any" — marges visibles
function anySvg(size) {
  const cx = size / 2;
  const cy = size / 2;
  const pad = size * 0.14;
  const inner = size - pad * 2;
  const radius = inner * 0.22;
  const fontSize = Math.round(size * 0.24);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="transparent"/>
  <rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" rx="${radius}" ry="${radius}" fill="${NAVY}"/>
  <text x="${cx}" y="${cy + fontSize * 0.35}" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="${fontSize}" font-weight="800" fill="${ACCENT}" text-anchor="middle" letter-spacing="${Math.round(size * 0.005)}">PRH</text>
</svg>`;
}

async function render(svg, outPath) {
  await sharp(Buffer.from(svg)).png({ quality: 95 }).toFile(outPath);
  console.log("  ✓", outPath.replace(__dirname + "/..", ""));
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log("Icons → public/icons/");

  await render(anySvg(192), join(OUT_DIR, "icon-192.png"));
  await render(anySvg(512), join(OUT_DIR, "icon-512.png"));
  await render(maskableSvg(512), join(OUT_DIR, "icon-maskable-512.png"));
  await render(anySvg(180), join(OUT_DIR, "apple-touch-icon.png"));
  await render(anySvg(32), join(OUT_DIR, "favicon-32.png"));
  await render(anySvg(16), join(OUT_DIR, "favicon-16.png"));

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
