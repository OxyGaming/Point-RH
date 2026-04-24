// Génère 5 aperçus d'icônes PWA candidates en PNG 256x256.
// Usage : node scripts/generate-icon-previews.mjs
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT = path.join(process.cwd(), "public", "icon-previews");
const NAVY = "#1a3070";
const RED = "#E2001A";
const WHITE = "#ffffff";
const SIZE = 256;

const CONCEPTS = {
  "A-badge-rh-rail": `
<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <rect width="256" height="256" rx="48" fill="${NAVY}"/>
  <text x="128" y="150" font-family="sans-serif" font-weight="800" font-size="110"
        fill="${WHITE}" text-anchor="middle">RH</text>
  <rect x="60" y="186" width="136" height="6" rx="2" fill="${WHITE}"/>
  <rect x="60" y="200" width="136" height="6" rx="2" fill="${WHITE}"/>
</svg>`,

  "B-agent-silhouette": `
<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <rect width="256" height="256" rx="48" fill="${NAVY}"/>
  <!-- Casquette -->
  <path d="M 90 92 Q 90 56 128 56 Q 166 56 166 92 Z" fill="${WHITE}"/>
  <rect x="78" y="88" width="100" height="10" rx="3" fill="${WHITE}"/>
  <!-- Tête -->
  <circle cx="128" cy="122" r="28" fill="${WHITE}"/>
  <!-- Épaules -->
  <path d="M 56 226 Q 56 166 128 166 Q 200 166 200 226 L 200 240 L 56 240 Z" fill="${WHITE}"/>
</svg>`,

  "C-pin-point": `
<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <rect width="256" height="256" rx="48" fill="${WHITE}"/>
  <path d="M 128 36 C 78 36 44 74 44 120 C 44 180 128 228 128 228
           C 128 228 212 180 212 120 C 212 74 178 36 128 36 Z" fill="${NAVY}"/>
  <circle cx="128" cy="112" r="38" fill="${WHITE}"/>
  <text x="128" y="126" font-family="sans-serif" font-weight="800" font-size="38"
        fill="${NAVY}" text-anchor="middle">RH</text>
</svg>`,

  "D-rails-convergents": `
<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <rect width="256" height="256" rx="48" fill="${NAVY}"/>
  <path d="M 56 224 L 120 80" stroke="${WHITE}" stroke-width="8" stroke-linecap="round"/>
  <path d="M 200 224 L 136 80" stroke="${WHITE}" stroke-width="8" stroke-linecap="round"/>
  <line x1="82" y1="196" x2="174" y2="196" stroke="${WHITE}" stroke-width="5" opacity="0.6"/>
  <line x1="94" y1="164" x2="162" y2="164" stroke="${WHITE}" stroke-width="5" opacity="0.6"/>
  <line x1="106" y1="132" x2="150" y2="132" stroke="${WHITE}" stroke-width="5" opacity="0.6"/>
  <circle cx="128" cy="76" r="26" fill="${RED}" opacity="0.25"/>
  <circle cx="128" cy="76" r="16" fill="${RED}"/>
</svg>`,

  "E-grille-planning": `
<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <rect width="256" height="256" rx="48" fill="${NAVY}"/>
  <g transform="translate(40, 40)">
    <rect x="0"   y="0"   width="56" height="56" rx="8" fill="${WHITE}"/>
    <rect x="60"  y="0"   width="56" height="56" rx="8" fill="${RED}"/>
    <rect x="120" y="0"   width="56" height="56" rx="8" fill="${WHITE}"/>
    <rect x="0"   y="60"  width="56" height="56" rx="8" fill="${RED}"/>
    <rect x="60"  y="60"  width="56" height="56" rx="8" fill="${WHITE}"/>
    <rect x="120" y="60"  width="56" height="56" rx="8" fill="${WHITE}"/>
    <rect x="0"   y="120" width="56" height="56" rx="8" fill="${WHITE}"/>
    <rect x="60"  y="120" width="56" height="56" rx="8" fill="${WHITE}"/>
    <rect x="120" y="120" width="56" height="56" rx="8" fill="${RED}"/>
  </g>
</svg>`,
};

await fs.mkdir(OUT, { recursive: true });

for (const [name, svg] of Object.entries(CONCEPTS)) {
  const out = path.join(OUT, `${name}.png`);
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log("✓", name, "→", out);
}

// Index HTML pour visualiser côte à côte.
const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Icônes Point RH — aperçus</title>
<style>
  body{font-family:system-ui;background:#f5f7fb;padding:32px;margin:0;color:#0f1b4c}
  h1{margin:0 0 8px 0;font-size:24px}
  p{color:#64748b;margin:0 0 24px 0}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px}
  .card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:20px;text-align:center}
  .card img{width:192px;height:192px;border-radius:32px;box-shadow:0 4px 16px rgba(0,0,0,0.08)}
  .card h3{margin:16px 0 4px 0;font-size:16px}
  .card small{color:#64748b;font-size:12px}
</style></head><body>
<h1>Aperçus icônes PWA — Point RH</h1>
<p>Cliquez sur celui que vous préférez, je générerai tous les formats (192/512/maskable/apple/favicons).</p>
<div class="grid">
  ${Object.keys(CONCEPTS).map((n) => {
    const label = n.split("-").slice(1).join(" ");
    return `<div class="card"><img src="${n}.png" alt="${n}"><h3>${n.split("-")[0]}</h3><small>${label}</small></div>`;
  }).join("\n  ")}
</div>
</body></html>`;

await fs.writeFile(path.join(OUT, "index.html"), html);
console.log("\n→ Ouvre : public/icon-previews/index.html");
