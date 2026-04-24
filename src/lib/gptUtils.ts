/**
 * Utilitaires GPT — Grande Période de Travail
 *
 * RÔLE : couche logique canonique. Source de vérité pour la détection de
 * frontière de RP et le découpage en GPTs. Toute modification ici impacte
 * le calcul de règles métier en production.
 *
 * Consommateurs directs :
 *   – engine/rules.ts                         → évaluation des règles (prod)
 *   – lib/rules/gptEngine.ts                  → wrapper typé (délègue ici)
 *   – lib/simulation/candidateFinder.ts       → classification d'événements
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

// ─── Cache de décomposition GPT ──────────────────────────────────────────────
//
// L'analyse d'imprévu appelle `evaluerMobilisabilite` plusieurs milliers de fois
// (230 agents × cascade jusqu'à 10 niveaux × 2 résultats sans/avec figeage).
// À chaque appel, on redécoupait les mêmes événements en GPTs. Ce cache partagé,
// clé = référence d'array + rpSimpleMin, élimine ces recalculs redondants.
//
// Hypothèse d'intégrité : une fois construit (dans la route API), un tableau
// d'événements n'est JAMAIS muté — il est passé en lecture seule au moteur.
// Les variantes (filtre JS Z, figeage, eventsSimules) créent de nouveaux tableaux,
// qui ressortent naturellement comme cache miss. WeakMap libère la mémoire dès
// que le tableau n'est plus référencé (fin de requête).
const gptCache = new WeakMap<PlanningEvent[], Map<number, PlanningEvent[][]>>();

// ─── Détection de la GPT courante ────────────────────────────────────────────

/**
 * Trouve le début de la GPT courante et la liste de ses JS.
 *
 * S'appuie sur `decoupeEnGPTs` (mémoïsé) : on prend la dernière GPT
 * contenant au moins une JS antérieure à `before`, puis on la tronque
 * à cette borne.
 */
export function trouverDebutGPT(
  allEvents: PlanningEvent[],
  before: Date,
  rpSimpleMin: number
): { gptStart: Date; joursGPT: PlanningEvent[] } {
  const gpts = decoupeEnGPTs(allEvents, rpSimpleMin);
  const beforeTs = before.getTime();

  // Les GPTs et les événements qu'elles contiennent sont triés chronologiquement.
  // On parcourt en ordre inverse pour trouver la GPT la plus récente dont au moins
  // un événement commence strictement avant `before`.
  for (let i = gpts.length - 1; i >= 0; i--) {
    const gpt = gpts[i];
    if (gpt[0].dateDebut.getTime() >= beforeTs) continue;

    const joursGPT = gpt.filter((e) => e.dateDebut.getTime() < beforeTs);
    if (joursGPT.length > 0) {
      return { gptStart: joursGPT[0].dateDebut, joursGPT };
    }
  }

  return { gptStart: before, joursGPT: [] };
}

// ─── Fonctions utilitaires dérivées ──────────────────────────────────────────

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
 *
 * Résultat mémoïsé par (référence allEvents, rpSimpleMin) via WeakMap —
 * voir `gptCache` ci-dessus pour la justification et l'hypothèse d'intégrité.
 */
export function decoupeEnGPTs(
  allEvents: PlanningEvent[],
  rpSimpleMin: number
): PlanningEvent[][] {
  let byRp = gptCache.get(allEvents);
  if (byRp) {
    const cached = byRp.get(rpSimpleMin);
    if (cached) return cached;
  }

  const joursJS = allEvents
    .filter((e) => isJourTravailleGPT(e))
    .sort((a, b) => a.dateDebut.getTime() - b.dateDebut.getTime());

  let gpts: PlanningEvent[][];
  if (joursJS.length === 0) {
    gpts = [];
  } else {
    gpts = [];
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
  }

  if (!byRp) {
    byRp = new Map();
    gptCache.set(allEvents, byRp);
  }
  byRp.set(rpSimpleMin, gpts);
  return gpts;
}
