/**
 * Script de capture d'écran automatisé pour le mode opératoire.
 * Utilise puppeteer-core + Microsoft Edge (pré-installé sur Windows).
 *
 * Masquage des données personnelles :
 *   - Nom / Prénom → remplacés par des données fictives cohérentes
 *   - Matricule    → remplacé par des matricules fictifs
 *
 * Usage: node scripts/take-screenshots.mjs
 */

import puppeteer from "puppeteer-core";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL   = "http://localhost:3001";
const ASSETS_DIR = path.join(__dirname, "../public/mode-operatoire-assets");
const EDGE_PATH  = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const VIEWPORT   = { width: 1440, height: 900 };

const CREDENTIALS = { email: "admin@point-rh.local", password: "Admin1234!" };

// ── Données fictives pour le masquage ────────────────────────────────────────

const FAKE_NAMES = [
  "Jean DUPONT",    "Marie MARTIN",   "Pierre BERNARD", "Sophie DUBOIS",
  "Louis THOMAS",   "Claire ROBERT",  "Paul PETIT",     "Anne LEROY",
  "Marc MOREAU",    "Julie FOURNIER", "Eric LAMBERT",   "Nathalie SIMON",
  "Bruno MICHEL",   "Isabelle GARCIA","Philippe LEBRUN", "Sylvie ROUX",
  "Olivier DAVID",  "Céline PEREZ",   "Antoine LEROUX", "Virginie BONNET",
];

const FAKE_MATRICULES = [
  "1234567A", "2345678B", "3456789C", "4567890D", "5678901E",
  "6789012F", "7890123G", "8901234H", "9012345I", "0123456J",
  "1357924K", "2468013L", "3579124M", "4680235N", "5791346P",
  "6802457Q", "7913568R", "8024679S", "9135780T", "0246891U",
];

// ── Liste des captures ────────────────────────────────────────────────────────
// mask: true  → injection du masquage des données personnelles avant capture
// mask: false → page sans données personnelles visibles

const CAPTURES = [
  { file: "01-login.png",                route: "/auth/login",              auth: false, mask: false },
  { file: "00-vue-planning.png",         route: "/planning",                auth: true,  mask: true  },
  { file: "02-import-planning.png",      route: "/import",                  auth: true,  mask: false },
  { file: "03-agents-liste.png",         route: "/agents",                  auth: true,  mask: true  },
  { file: "04-fiche-agent.png",          route: null,                       auth: true,  mask: true,  dynamic: "agentId" },
  { file: "06-simulation-multi.png",     route: "/simulations/multi-js",    auth: true,  mask: false },
  { file: "08-lpa.png",                  route: "/lpa",                     auth: true,  mask: false },
  { file: "09-admin-work-rules.png",     route: "/admin/work-rules",        auth: true,  mask: false },
  { file: "10-admin-users.png",          route: "/admin/users",             auth: true,  mask: false },
  { file: "11-admin-registrations.png",  route: "/admin/registrations",     auth: true,  mask: false },
  { file: "12-admin-js-types.png",       route: "/admin/js-types",          auth: true,  mask: false },
  { file: "13-admin-habilitations.png",  route: "/admin/habilitations",     auth: true,  mask: false },
  { file: "14-admin-npo-exclusions.png", route: "/admin/npo-exclusions",    auth: true,  mask: false },
  { file: "15-admin-parametrage.png",    route: "/admin/parametrage",       auth: true,  mask: false },
  { file: "16-admin-agents-supprimes.png",route: "/admin/agents-supprimes", auth: true,  mask: true  },
  { file: "17-admin-zero-load-prefixes.png", route: "/admin/zero-load-prefixes", auth: true,  mask: false },
];

// ── Utilitaires ───────────────────────────────────────────────────────────────

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function login(page) {
  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: "networkidle0" });
  await page.type('input[type="email"]', CREDENTIALS.email);
  await page.type('input[type="password"]', CREDENTIALS.password);
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: "networkidle0", timeout: 15000 }).catch(() => {}),
  ]);
  await delay(1000);
}

async function getFirstAgentId(page) {
  await page.goto(`${BASE_URL}/agents`, { waitUntil: "networkidle0" });
  await delay(800);
  const href = await page.$eval(
    'a[href^="/agents/"]',
    (el) => el.getAttribute("href")
  ).catch(() => null);
  return href ?? "/agents";
}

// ── Masquage des données personnelles ─────────────────────────────────────────

async function maskPersonalData(page, fakeNames, fakeMatricules) {
  await page.evaluate((names, mats) => {
    let nameIdx = 0;
    const nameMap = new Map();
    let matIdx = 0;
    const matMap = new Map();

    const fakeName = (orig) => {
      const key = orig.trim();
      if (!key) return key;
      if (!nameMap.has(key)) { nameMap.set(key, names[nameIdx++ % names.length]); }
      return nameMap.get(key);
    };
    const fakeMat = (orig) => {
      const key = orig.trim();
      if (!key) return key;
      if (!matMap.has(key)) { matMap.set(key, mats[matIdx++ % mats.length]); }
      return matMap.get(key);
    };

    // ── 1. Tableau agents (AgentTable) — tbody td:first-child = nom prénom ──
    document.querySelectorAll("tbody tr").forEach((row) => {
      const tds = [...row.querySelectorAll("td")];
      if (tds.length < 2) return;

      // Première cellule : nom prénom (texte brut, pas d'enfants)
      const nameCell = tds[0];
      if (nameCell.children.length === 0) {
        const orig = nameCell.textContent.trim();
        if (orig) nameCell.textContent = fakeName(orig);
      }

      // AgentsSupprimes : div.font-medium > texte, + div.font-mono > matricule
      const nameDiv = nameCell.querySelector("div.font-medium");
      if (nameDiv && nameDiv.children.length === 0) {
        const orig = nameDiv.textContent.trim();
        if (orig) nameDiv.textContent = fakeName(orig);
      }
      const matDivMono = nameCell.querySelector("div.font-mono");
      if (matDivMono) {
        const node = matDivMono.childNodes[0];
        if (node && node.nodeType === Node.TEXT_NODE) {
          const orig = node.textContent.trim();
          if (orig) node.textContent = " " + fakeMat(orig);
        }
      }

      // Deuxième cellule : matricule dans un <span>
      const matSpan = tds[1]?.querySelector("span");
      if (matSpan && matSpan.children.length === 0) {
        const orig = matSpan.textContent.trim();
        if (orig) matSpan.textContent = fakeMat(orig);
      }
    });

    // ── 2. Fiche agent — h1.font-bold (nom prénom dans le fil d'Ariane) ────
    document.querySelectorAll("h1.font-bold").forEach((h1) => {
      const orig = h1.textContent.trim();
      if (!orig) return;
      const SKIP = ["agents", "planning", "résultats", "résultat", "simulation",
                    "import", "paramétrage", "lpa", "admin", "supprimés"];
      if (!SKIP.some((s) => orig.toLowerCase().includes(s))) {
        h1.textContent = fakeName(orig);
      }
    });

    // Fiche agent — matricule : span.font-mono.font-medium dans flex justify-between
    document.querySelectorAll("span.font-mono.font-medium").forEach((span) => {
      const parent = span.parentElement;
      if (parent && (parent.classList.contains("justify-between") ||
          window.getComputedStyle(parent).justifyContent === "space-between")) {
        const orig = span.textContent.trim();
        if (orig) span.textContent = fakeMat(orig);
      }
    });

    // ── 3. Planning — LeftCell (div.sticky.left-0 avec 2 spans directs) ────
    document.querySelectorAll("div.sticky.left-0").forEach((cell) => {
      const spans = [...cell.querySelectorAll(":scope > span")];
      // L'agent LeftCell a exactement 2 spans ; le 2e a la classe font-mono
      if (spans.length === 2 && spans[1].classList.contains("font-mono")) {
        const n = spans[0].textContent.trim();
        const m = spans[1].textContent.trim();
        if (n) spans[0].textContent = fakeName(n);
        if (m) spans[1].textContent = fakeMat(m);
      }
    });

    // ── 4. ResultatCard — lien nom prénom + p.font-mono matricule ──────────
    document.querySelectorAll("a.font-semibold.text-gray-900").forEach((a) => {
      const orig = a.textContent.trim();
      if (orig) a.textContent = fakeName(orig);
    });
    document.querySelectorAll("p.font-mono").forEach((p) => {
      const orig = p.textContent.trim();
      if (orig) p.textContent = fakeMat(orig);
    });

  }, fakeNames, fakeMatricules);
}

// ── Capture ───────────────────────────────────────────────────────────────────

async function screenshot(page, route, file, needsMask) {
  console.log(`  📸 ${file} ← ${route}`);
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle0" });
  await delay(1500); // animations + async data
  if (needsMask) {
    await maskPersonalData(page, FAKE_NAMES, FAKE_MATRICULES);
  }
  const outPath = path.join(ASSETS_DIR, file);
  await page.screenshot({ path: outPath, type: "png", fullPage: false });
}

// ── Point d'entrée ────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Démarrage du navigateur Edge...");
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=1440,900"],
    defaultViewport: VIEWPORT,
  });

  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  // ── Login page (sans auth) ────────────────────────────────────────────────
  const loginCap = CAPTURES.find((c) => !c.auth);
  if (loginCap) await screenshot(page, loginCap.route, loginCap.file, false);

  // ── Authentification ──────────────────────────────────────────────────────
  console.log("🔐 Authentification...");
  await login(page);

  // ── Résolution de la route dynamique (premier agent) ─────────────────────
  const agentRoute = await getFirstAgentId(page);

  // ── Captures authentifiées ────────────────────────────────────────────────
  for (const cap of CAPTURES) {
    if (!cap.auth) continue;
    const route = cap.dynamic === "agentId" ? agentRoute : cap.route;
    await screenshot(page, route, cap.file, cap.mask);
  }

  await browser.close();
  console.log("\n✅ Captures sauvegardées dans", ASSETS_DIR);
}

main().catch((err) => {
  console.error("❌ Erreur :", err.message);
  process.exit(1);
});
