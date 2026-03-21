/**
 * Utilitaires GPT — Grande Période de Travail
 *
 * Logique partagée entre le moteur de règles (engine/rules.ts) et
 * le détecteur de conflits (lib/simulation/conflictDetector.ts).
 *
 * Règle métier fondamentale :
 *   – Seul un repos PÉRIODIQUE (RP, graphié) réinitialise la GPT.
 *   – Les congés, absences et RU (repos universels) ne sont PAS des RP :
 *     ils s'inscrivent à l'intérieur de la GPT sans la clore.
 *   – Un gap entre deux jours travaillés est un RP uniquement si aucun
 *     congé/absence/RU ne l'occupe ET si sa durée est ≥ rpSimpleMin (36 h).
 *
 * Journées comptant dans une GPT (isJourTravailleGPT) :
 *   – JS (jsNpo === "JS") — toutes les journées de service
 *   – C  (jsNpo === "NPO", codeJs === "C") — congé-repos planifié
 *     Ces jours ne constituent pas un repos périodique : ils s'inscrivent
 *     dans la continuité de la séquence de travail.
 */

import type { PlanningEvent } from "@/engine/rules";
import { diffMinutes } from "@/lib/utils";

// ─── Identification des jours travaillés (comptant dans une GPT) ──────────────

/**
 * Retourne true si l'événement compte comme une journée travaillée dans une GPT.
 *
 * Sont considérés comme jours travaillés :
 *  - Toutes les JS (jsNpo === "JS")
 *  - Les congés-repos planifiés de type C (jsNpo === "NPO", codeJs === "C")
 *    Ils participent à la continuité de la séquence entre deux RP.
 *
 * Corollaire : remplacer une journée C par une JS simulée ne modifie PAS
 * la longueur de la GPT car la continuité reste identique.
 */
export function isJourTravailleGPT(event: PlanningEvent): boolean {
  if (event.jsNpo === "JS") return true;
  if (event.jsNpo === "NPO") {
    const code = (event.codeJs ?? "").toUpperCase().trim();
    return code === "C";
  }
  return false;
}

// ─── Identification des congés / absences / RU ────────────────────────────────

/**
 * Retourne true si l'événement NPO est un congé, une absence ou un RU.
 * Ces événements ne constituent PAS un repos périodique.
 *
 * Exclusions explicites (ne sont PAS des congés/absences pour ce test) :
 *  - RP (repos périodique graphié) : codeJs === "RP" ou startsWith("RP")
 *  - C  (congé-repos planifié)     : codeJs === "C" — compte comme travail
 */
export function isCongeOuAbsence(event: PlanningEvent): boolean {
  if (event.jsNpo !== "NPO") return false;

  const code = (event.codeJs ?? "").toUpperCase().trim();

  // Les RP graphiés ne sont jamais des congés/absences
  if (code === "RP" || code.startsWith("RP")) return false;

  // Les C (congé-repos planifié) comptent comme travail dans la GPT —
  // ils ne bloquent pas la détection de frontière RP
  if (code === "C") return false;

  const t = (event.typeJs ?? "").toLowerCase();
  return (
    t.includes("congé") ||
    t.includes("conge") ||       // variante sans accent
    t.includes("absence") ||
    t === "ru" ||
    t.includes("repos universel")
  );
}

// ─── Détection de frontière de RP ────────────────────────────────────────────

/**
 * Détermine si le gap entre `debut` et `fin` constitue un repos périodique réel.
 *
 * Critères :
 *  1. Le gap doit être ≥ rpSimpleMin (durée RP simple en minutes).
 *  2. Aucun congé / absence / RU ne doit chevaucher ce gap
 *     (leur présence signifie que le repos est un congé, pas un RP).
 */
export function isGapReposPeriodique(
  allEvents: PlanningEvent[],
  debut: Date,
  fin: Date,
  rpSimpleMin: number
): boolean {
  if (diffMinutes(debut, fin) < rpSimpleMin) return false;

  // Si un congé ou une absence couvre (même partiellement) ce gap → pas un RP
  const hasConge = allEvents.some(
    (e) =>
      e.jsNpo === "NPO" &&
      isCongeOuAbsence(e) &&
      e.dateDebut < fin &&
      e.dateFin > debut
  );

  return !hasConge;
}

// ─── Détection de la GPT courante ────────────────────────────────────────────

/**
 * Trouve le début de la GPT courante et la liste de ses JS.
 *
 * Remonte la liste des JS (avant `before`) jusqu'à trouver la frontière
 * de RP la plus récente qui ne soit pas un congé/absence/RU.
 */
export function trouverDebutGPT(
  allEvents: PlanningEvent[],
  before: Date,
  rpSimpleMin: number
): { gptStart: Date; joursGPT: PlanningEvent[] } {
  const joursJS = allEvents
    .filter((e) => isJourTravailleGPT(e) && e.dateDebut < before)
    .sort((a, b) => a.dateDebut.getTime() - b.dateDebut.getTime());

  if (joursJS.length === 0) {
    return { gptStart: before, joursGPT: [] };
  }

  let gptStart = joursJS[0].dateDebut;

  for (let i = joursJS.length - 1; i >= 1; i--) {
    if (isGapReposPeriodique(allEvents, joursJS[i - 1].dateFin, joursJS[i].dateDebut, rpSimpleMin)) {
      gptStart = joursJS[i].dateDebut;
      break;
    }
  }

  const joursGPT = joursJS.filter((e) => e.dateDebut >= gptStart);
  return { gptStart, joursGPT };
}

// ─── Fonctions utilitaires dérivées ──────────────────────────────────────────

/** Nombre de JS dans la GPT courante */
export function compterJoursGPT(
  allEvents: PlanningEvent[],
  before: Date,
  rpSimpleMin: number
): number {
  return trouverDebutGPT(allEvents, before, rpSimpleMin).joursGPT.length;
}

/** Cumul de travail effectif (en minutes) dans la GPT courante */
export function cumulTravailEffectifGPT(
  allEvents: PlanningEvent[],
  before: Date,
  rpSimpleMin: number
): number {
  const { joursGPT } = trouverDebutGPT(allEvents, before, rpSimpleMin);
  return joursGPT.reduce((sum, e) => sum + (e.dureeEffectiveMin ?? e.amplitudeMin), 0);
}

/**
 * Découpe une liste d'événements en GPTs successives.
 * Chaque coupure est un RP réel (gap ≥ rpSimpleMin sans congé).
 */
export function decoupeEnGPTs(
  allEvents: PlanningEvent[],
  rpSimpleMin: number
): PlanningEvent[][] {
  const joursJS = allEvents
    .filter((e) => isJourTravailleGPT(e))
    .sort((a, b) => a.dateDebut.getTime() - b.dateDebut.getTime());

  if (joursJS.length === 0) return [];

  const gpts: PlanningEvent[][] = [];
  let gptCourante: PlanningEvent[] = [joursJS[0]];

  for (let i = 1; i < joursJS.length; i++) {
    if (isGapReposPeriodique(allEvents, joursJS[i - 1].dateFin, joursJS[i].dateDebut, rpSimpleMin)) {
      gpts.push(gptCourante);
      gptCourante = [joursJS[i]];
    } else {
      gptCourante.push(joursJS[i]);
    }
  }
  gpts.push(gptCourante);

  return gpts;
}
