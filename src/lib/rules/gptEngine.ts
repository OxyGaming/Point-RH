/**
 * GPT Engine — Moteur de calcul des Groupes de Périodes de Travail
 *
 * Source de vérité unique pour toute logique GPT dans l'application.
 * Utilisé par le moteur de règles (engine/rules.ts) et le moteur de
 * simulation (lib/simulation/*).
 *
 * Règles métier :
 *  - Une GPT = séquence de jours travaillés CONSÉCUTIFS entre deux RP.
 *  - Tout événement jsNpo === "JS" compte dans la GPT (JS, C, Z, DIS, etc.).
 *  - Seul un RP réel (gap ≥ rpSimpleMin sans congé/absence entre deux JS)
 *    clôture une GPT.
 *  - Le TYPE exact de journée (JS, C, Z, DIS…) n'a aucune incidence sur le
 *    comptage : seule la continuité entre deux RP détermine la longueur.
 *
 * Conséquence directe :
 *  Remplacer une journée C par une JS simulée dans une séquence ininterrompue
 *  ne change pas la longueur de la GPT.
 */

import type { PlanningEvent } from "@/engine/rules";
import { diffMinutes } from "@/lib/utils";
import { isGapReposPeriodique, isJourTravailleGPT } from "@/lib/gptUtils";

// ─── Types publics ────────────────────────────────────────────────────────────

/**
 * Une séquence de travail (GPT) : tous les jours travaillés entre deux RP.
 */
export interface WorkSequence {
  /** Jours travaillés (jsNpo === "JS") triés chronologiquement */
  days: PlanningEvent[];
  /** Début du premier jour */
  startDate: Date;
  /** Fin du dernier jour */
  endDate: Date;
  /** Nombre de jours dans la GPT */
  length: number;
}

/**
 * Frontière de repos périodique (RP) détectée entre deux jours travaillés.
 */
export interface RPBoundary {
  /** Dernier jour de la GPT précédente */
  previousDay: PlanningEvent;
  /** Premier jour de la GPT suivante */
  nextDay: PlanningEvent;
  /** Début du gap (= fin du jour précédent) */
  gapStart: Date;
  /** Fin du gap (= début du jour suivant) */
  gapEnd: Date;
  /** Durée du gap en minutes */
  gapDurationMin: number;
}

/**
 * Description d'un remplacement de journée pour la simulation.
 */
export interface SimulatedDay {
  /**
   * Date calendaire du jour à remplacer (comparaison sur dateDebut).
   * Tous les événements JS dont la dateDebut tombe sur cette même date
   * sont supprimés avant d'insérer newEvent.
   */
  date: Date;
  /**
   * Nouvel événement à insérer.
   * null  → le jour devient un RP (aucun JS ce jour-là).
   * PlanningEvent avec jsNpo "JS"  → remplace par une journée travaillée.
   */
  newEvent: PlanningEvent | null;
}

/**
 * Résultat de la comparaison GPT avant/après simulation.
 */
export interface GPTComparison {
  /** true si la longueur de la GPT affectée a changé */
  changed: boolean;
  /** Longueur (jours) de la GPT contenant la date simulée, avant simulation */
  gptLengthBefore: number;
  /** Longueur (jours) de la GPT contenant la date simulée, après simulation */
  gptLengthAfter: number;
  /** gptLengthAfter − gptLengthBefore (positif = augmentation) */
  delta: number;
  /** Toutes les séquences avant simulation */
  sequencesBefore: WorkSequence[];
  /** Toutes les séquences après simulation */
  sequencesAfter: WorkSequence[];
}

// ─── Fonctions principales ────────────────────────────────────────────────────

/**
 * Détecte toutes les frontières de repos périodique (RP) dans un planning.
 *
 * Chaque frontière correspond à un gap ≥ rpSimpleMin entre deux journées
 * travaillées consécutives, sans congé/absence couvrant ce gap.
 */
export function detectRestBoundaries(
  planning: PlanningEvent[],
  rpSimpleMin: number
): RPBoundary[] {
  const workDays = getWorkDaysSorted(planning);
  const boundaries: RPBoundary[] = [];

  for (let i = 1; i < workDays.length; i++) {
    const prev = workDays[i - 1];
    const curr = workDays[i];
    if (isGapReposPeriodique(planning, prev.dateFin, curr.dateDebut, rpSimpleMin)) {
      boundaries.push({
        previousDay: prev,
        nextDay: curr,
        gapStart: prev.dateFin,
        gapEnd: curr.dateDebut,
        gapDurationMin: diffMinutes(prev.dateFin, curr.dateDebut),
      });
    }
  }

  return boundaries;
}

/**
 * Calcule les séquences de travail (GPTs) à partir d'un planning.
 *
 * Remplace avantageusement decoupeEnGPTs (gptUtils.ts) en retournant
 * des WorkSequence typées plutôt que des tableaux bruts.
 *
 * Règle : le TYPE de journée (JS, C, Z, DIS…) n'influe pas sur le résultat ;
 * seul le champ jsNpo === "JS" est utilisé pour identifier les jours travaillés.
 */
export function computeWorkSequences(
  planning: PlanningEvent[],
  rpSimpleMin: number
): WorkSequence[] {
  const workDays = getWorkDaysSorted(planning);
  if (workDays.length === 0) return [];

  const sequences: WorkSequence[] = [];
  let current: PlanningEvent[] = [workDays[0]];

  for (let i = 1; i < workDays.length; i++) {
    const prev = workDays[i - 1];
    const curr = workDays[i];
    if (isGapReposPeriodique(planning, prev.dateFin, curr.dateDebut, rpSimpleMin)) {
      sequences.push(buildSequence(current));
      current = [curr];
    } else {
      current.push(curr);
    }
  }
  sequences.push(buildSequence(current));

  return sequences;
}

/**
 * Retourne le nombre de jours dans une séquence de travail.
 * Équivalent à sequence.length, fourni pour une API explicite.
 */
export function computeGPTLength(sequence: WorkSequence): number {
  return sequence.length;
}

/**
 * Simule le remplacement d'une journée dans le planning et recalcule les GPTs.
 *
 * Comportement :
 *  1. Supprime TOUS les événements JS dont la dateDebut correspond à la date
 *     cible (remplacement, pas empilement).
 *  2. Insère newEvent si fourni (journée travaillée) ou ne rien insère (RP).
 *  3. Recalcule les séquences GPT sur le planning résultant.
 *
 * Garantie : si le type de journée change (C → JS) mais que la continuité
 * reste identique, la longueur de GPT retournée est inchangée.
 */
export function simulateGPT(
  planning: PlanningEvent[],
  simulatedDay: SimulatedDay,
  rpSimpleMin: number
): WorkSequence[] {
  const targetDate = toDateString(simulatedDay.date);

  // 1. Supprimer tous les jours travaillés (JS + NPO C) sur cette date calendaire.
  //    Les vrais NPO passifs (RP, absences…) sont conservés.
  //    On utilise isJourTravailleGPT pour rester cohérent avec le comptage GPT :
  //    si un C(26) est remplacé par une JS simulée, il faut d'abord retirer le C(26).
  const filteredPlanning = planning.filter((e) => {
    if (!isJourTravailleGPT(e)) return true; // Conserver les RP, absences, etc.
    return toDateString(e.dateDebut) !== targetDate;
  });

  // 2. Insérer le nouvel événement si fourni
  const newPlanning: PlanningEvent[] = simulatedDay.newEvent
    ? [...filteredPlanning, simulatedDay.newEvent]
    : filteredPlanning;

  // 3. Recalculer les séquences
  return computeWorkSequences(newPlanning, rpSimpleMin);
}

/**
 * Compare les séquences GPT avant et après simulation d'un remplacement.
 *
 * Se concentre sur la GPT qui contient (ou est la plus proche de)
 * la date simulée pour calculer le delta pertinent.
 *
 * @param before       Séquences AVANT simulation (résultat de computeWorkSequences)
 * @param after        Séquences APRÈS simulation (résultat de simulateGPT)
 * @param simulatedDate Date du jour remplacé — utilisée pour identifier la GPT affectée
 */
export function compareGPT(
  before: WorkSequence[],
  after: WorkSequence[],
  simulatedDate?: Date
): GPTComparison {
  const affectedBefore = findAffectedSequence(before, simulatedDate);
  const affectedAfter = findAffectedSequence(after, simulatedDate);

  const gptLengthBefore = affectedBefore?.length ?? 0;
  const gptLengthAfter = affectedAfter?.length ?? 0;
  const delta = gptLengthAfter - gptLengthBefore;

  return {
    changed: delta !== 0 || before.length !== after.length,
    gptLengthBefore,
    gptLengthAfter,
    delta,
    sequencesBefore: before,
    sequencesAfter: after,
  };
}

// ─── Helpers internes ─────────────────────────────────────────────────────────

function getWorkDaysSorted(planning: PlanningEvent[]): PlanningEvent[] {
  return planning
    .filter((e) => isJourTravailleGPT(e))
    .sort((a, b) => a.dateDebut.getTime() - b.dateDebut.getTime());
}

function buildSequence(days: PlanningEvent[]): WorkSequence {
  const sorted = [...days].sort((a, b) => a.dateDebut.getTime() - b.dateDebut.getTime());
  return {
    days: sorted,
    startDate: sorted[0].dateDebut,
    endDate: sorted[sorted.length - 1].dateFin,
    length: sorted.length,
  };
}

/**
 * Trouve la séquence contenant la date simulée.
 * Si aucune séquence ne la contient (ex. : jour devenu RP),
 * retourne la séquence la plus proche chronologiquement.
 */
function findAffectedSequence(
  sequences: WorkSequence[],
  date?: Date
): WorkSequence | undefined {
  if (!date || sequences.length === 0) return sequences[sequences.length - 1];

  const dateStr = toDateString(date);

  // Cherche la séquence qui contient la date
  const containing = sequences.find((s) =>
    s.days.some((d) => toDateString(d.dateDebut) === dateStr)
  );
  if (containing) return containing;

  // Sinon : séquence dont la date de fin est la plus proche AVANT la date simulée
  const ts = date.getTime();
  const before = sequences
    .filter((s) => s.endDate.getTime() < ts)
    .sort((a, b) => b.endDate.getTime() - a.endDate.getTime());
  return before[0] ?? sequences[0];
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
