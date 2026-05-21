/**
 * Fenêtre de chargement du planning consolidé — Phase 1 du correctif d'import.
 *
 * `PlanningLigne` est déjà consolidé : la contrainte @@unique([matricule,
 * jourPlanning]) garantit une seule ligne par agent et par jour, tous imports
 * confondus. Filtrer les lectures par `importId` masquait donc les agents
 * écrits par un import antérieur (bug « import Base puis import UCH »).
 *
 * Les routes de lecture (timeline + simulations) chargent désormais une
 * FENÊTRE TEMPORELLE sur `jourPlanning` : tous les agents de la période sont
 * visibles, quel que soit l'import qui les a écrits.
 *
 * Les marges autour des JS cibles couvrent l'horizon réel du moteur de règles
 * (engine/rules.ts) : `deuxGPTNuitConsecutives` remonte 2 GPT, `joursGPTApres`
 * et `analyserRpAutourGpt` regardent la fin de GPT + le RP suivant. Elles sont
 * volontairement larges — au-delà de cet horizon l'agent est forcément reposé,
 * ce que toutes les règles traitent comme conforme : l'évaluation par agent
 * reste donc identique à un chargement sans fenêtre.
 */
import { minuitParisEnUtc, formatDateParis } from "@/lib/timezone";

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Jours chargés AVANT la 1re JS cible — couvre 2 GPT + RP en amont. */
export const MARGE_AMONT_JOURS = parsePositiveIntEnv("PLANNING_WINDOW_MARGE_AMONT", 35);

/** Jours chargés APRÈS la dernière JS cible — couvre fin de GPT + RP en aval. */
export const MARGE_AVAL_JOURS = parsePositiveIntEnv("PLANNING_WINDOW_MARGE_AVAL", 21);

const FORMAT_JOUR = /^\d{4}-\d{2}-\d{2}$/;

/** Fenêtre de filtrage sur `jourPlanning` (bornes incluses, minuit Paris en UTC). */
export interface FenetrePlanning {
  gte: Date;
  lte: Date;
}

/** Décale une date calendaire "YYYY-MM-DD" de `n` jours (`n` peut être négatif). */
function decalerJours(jour: string, n: number): string {
  const d = new Date(`${jour}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Construit la fenêtre de chargement d'une simulation à partir des dates des
 * JS cibles ("YYYY-MM-DD"). Étend de MARGE_AMONT/MARGE_AVAL jours et convertit
 * en bornes `jourPlanning` (minuit Paris en UTC).
 *
 * @throws si aucune date de JS cible valide n'est fournie.
 */
export function fenetreSimulation(datesCibles: readonly string[]): FenetrePlanning {
  const dates = datesCibles.filter(
    (d) => typeof d === "string" && FORMAT_JOUR.test(d)
  );
  if (dates.length === 0) {
    throw new Error("fenetreSimulation : aucune date de JS cible valide");
  }
  let min = dates[0];
  let max = dates[0];
  for (const d of dates) {
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return {
    gte: minuitParisEnUtc(decalerJours(min, -MARGE_AMONT_JOURS)),
    lte: minuitParisEnUtc(decalerJours(max, MARGE_AVAL_JOURS)),
  };
}

/**
 * Log diagnostic temporaire (Phase 1) — actif uniquement si la variable
 * d'environnement `PLANNING_WINDOW_DEBUG=1`. Sert à vérifier en prod/VPS que
 * les volumes chargés restent maîtrisés et que le périmètre est le bon.
 * À retirer une fois la stratégie consolidée validée en réel.
 */
export function logFenetrePlanning(info: {
  source: "js-list" | "multi-js" | "single-js";
  jsCount?: number;
  fenetre: FenetrePlanning;
  loadedAgents: number;
  loadedLines: number;
}): void {
  if (process.env.PLANNING_WINDOW_DEBUG !== "1") return;
  console.log(
    `[PlanningWindow] source=${info.source} ` +
      `jsCount=${info.jsCount ?? "-"} ` +
      `window=${formatDateParis(info.fenetre.gte)} → ${formatDateParis(info.fenetre.lte)} ` +
      `loadedAgents=${info.loadedAgents} loadedLines=${info.loadedLines}`
  );
}
