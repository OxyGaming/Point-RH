#!/usr/bin/env node
// Génère les icônes PWA Point RH à partir d'un SVG inline.
// Design : grille planning 3×3, fond navy, 3 cases rouge SNCF sur blanc.
// Usage : node scripts/generate-pwa-icons.mjs

import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "icons");

const NAVY = "#1a3070";
const RED = "#E2001A";
const WHITE = "#ffffff";

// Motif des cellules rouges (sinon blanches). Reste équilibré visuellement
// et reconnaissable même à 16-32px grâce au contraste rouge/blanc.
const PATTERN = [
  [false, true, false],
  [true, false, false],
  [false, false, true],
];

function gridCells(x, y, cell, gap) {
  let out = "";
  const r = cell * 0.14;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cx = x + col * (cell + gap);
      const cy = y + row * (cell + gap);
      const color = PATTERN[row][col] ? RED : WHITE;
      out += `<rect x="${cx.toFixed(2)}" y="${cy.toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" rx="${r.toFixed(2)}" fill="${color}"/>`;
    }
  }
  return out;
}

// SVG "any" — padding visible (icône arrondie classique)
function anySvg(size) {
  const pad = size * 0.10;
  const inner = size - pad * 2;
  const radius = inner * 0.22;
  const gridPad = inner * 0.14;
  const gridSize = inner - gridPad * 2;
  const gap = gridSize * 0.06;
  const cell = (gridSize - gap * 2) / 3;
  const gx = pad + gridPad;
  const gy = pad + gridPad;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" rx="${radius}" fill="${NAVY}"/>
  ${gridCells(gx, gy, cell, gap)}
</svg>`;
}

// SVG "maskable" — plein bord, motif dans la safe zone 80%
function maskableSvg(size) {
  const safePad = size * 0.12;
  const safeSize = size - safePad * 2;
  const gridPad = safeSize * 0.10;
  const gridSize = safeSize - gridPad * 2;
  const gap = gridSize * 0.06;
  const cell = (gridSize - gap * 2) / 3;
  const gx = safePad + gridPad;
  const gy = safePad + gridPad;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${NAVY}"/>
  ${gridCells(gx, gy, cell, gap)}
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
