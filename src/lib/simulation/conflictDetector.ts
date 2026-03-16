/**
 * Étape 3 — Détection des conflits induits
 * Analyse le planning d'un agent après injection de la JS cible.
 */

import { diffMinutes, minutesToTime, isJsDeNuit, jsComportePeriode0h4h } from "@/lib/utils";
import type { PlanningEvent } from "@/engine/rules";
import type { ConflitInduit, TypeConflit } from "@/types/js-simulation";
import { DEFAULT_WORK_RULES_MINUTES, type WorkRulesMinutes } from "@/lib/rules/workRules";
import { computeWorkSequences } from "@/lib/rules/gptEngine";

function dateToYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Retourne les conflits induits sur les 72h suivant la JS injectée
 */
export function detecterConflitsInduits(
  eventsAvecJs: PlanningEvent[],
  heureFinJs: Date,
  agentReserve: boolean,
  remplacement: boolean,
  rules: WorkRulesMinutes = DEFAULT_WORK_RULES_MINUTES
): ConflitInduit[] {
  const conflits: ConflitInduit[] = [];

  // Trier les événements chronologiquement
  const sortedEvents = [...eventsAvecJs].sort(
    (a, b) => a.dateDebut.getTime() - b.dateDebut.getTime()
  );

  // Trouver l'index de la JS injectée
  const jsIdx = sortedEvents.findIndex(
    (e) => e.jsNpo === "JS" && Math.abs(e.dateFin.getTime() - heureFinJs.getTime()) < 60000
  );

  if (jsIdx === -1) return conflits;

  // Vérifier les événements suivants dans les 72h
  for (let i = jsIdx + 1; i < sortedEvents.length; i++) {
    const next = sortedEvents[i];
    const prev = sortedEvents[i - 1];
    const gap = diffMinutes(prev.dateFin, next.dateDebut);
    const deltaDays = diffMinutes(heureFinJs, next.dateDebut) / 60 / 24;

    if (deltaDays > 3) break; // Au-delà de 3 jours, on arrête

    if (next.jsNpo === "JS") {
      // Repos minimum requis : 14h après JS de nuit, 10h réserve+remplacement, 12h sinon
      const prevEstNuit = prev.jsNpo === "JS" && isJsDeNuit(prev.heureDebut, prev.heureFin, {
        debutSoirMin: rules.periodeNocturne.debutSoir,
        finMatinMin: rules.periodeNocturne.finMatin,
        seuilMin: rules.periodeNocturne.seuilJsNuit,
      });
      const reposMin = prevEstNuit
        ? rules.reposJournalier.apresNuit        // 14h — prioritaire sur toute réduction
        : agentReserve && remplacement
          ? rules.reposJournalier.reduitReserve  // 10h
          : rules.reposJournalier.standard;      // 12h

      // Repos journalier insuffisant
      if (gap < reposMin) {
        conflits.push({
          planningLigneId: null,
          date: dateToYYYYMMDD(next.dateDebut),
          heureDebut: next.heureDebut,
          heureFin: next.heureFin,
          type: "REPOS_INSUFFISANT",
          description: `Repos insuffisant avant JS du ${dateToYYYYMMDD(next.dateDebut)} ${next.heureDebut}: ${minutesToTime(gap)} disponibles (min: ${minutesToTime(reposMin)}${prevEstNuit ? " — post-nuit" : ""})`,
          regleCode: "REPOS_JOURNALIER",
          resolvable: true,
        });
      }

      // Amplitude de la JS suivante
      if (next.amplitudeMin > rules.amplitude.general) {
        conflits.push({
          planningLigneId: null,
          date: dateToYYYYMMDD(next.dateDebut),
          heureDebut: next.heureDebut,
          heureFin: next.heureFin,
          type: "AMPLITUDE_DEPASSEE",
          description: `Amplitude dépassée pour JS du ${dateToYYYYMMDD(next.dateDebut)}: ${minutesToTime(next.amplitudeMin)} (max ${minutesToTime(rules.amplitude.general)})`,
          regleCode: "AMPLITUDE",
          resolvable: false,
        });
      }
    }
  }

  // ─ Vérification GPT_MAX via computeWorkSequences (congés/RU ne réinitialisent pas la GPT) ─
  const sequences = computeWorkSequences(eventsAvecJs, rules.reposPeriodique.simple);
  const sequencesTriees = [...sequences].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime()
  );

  for (const seq of sequencesTriees) {
    if (seq.length > rules.gpt.max) {
      const e = seq.days[rules.gpt.max]; // première JS en dépassement
      conflits.push({
        planningLigneId: null,
        date: dateToYYYYMMDD(e.dateDebut),
        type: "GPT_MAX",
        description: `GPT dépasse le maximum de ${rules.gpt.max} JS (jour ${seq.length}) — les congés/RU ne constituent pas un RP`,
        regleCode: "GPT_MAX",
        resolvable: false,
      });
      break; // un seul conflit GPT_MAX suffit
    }
  }

  // ─ 2 GPT de nuit consécutives ───────────────────────────────────────────────
  // Une GPT est de nuit si au moins la moitié de ses JS comportent la période 0h-4h.
  const isGPTDeNuit = (days: PlanningEvent[]) => {
    const nb = days.filter((j) => jsComportePeriode0h4h(j.heureDebut, j.heureFin, rules.periodeNocturne.seuilGptNuit)).length;
    return nb >= days.length / 2;
  };

  const allSequences = computeWorkSequences(eventsAvecJs, rules.reposPeriodique.simple);
  if (allSequences.length >= 2) {
    const n = allSequences.length;
    if (isGPTDeNuit(allSequences[n - 1].days) && isGPTDeNuit(allSequences[n - 2].days)) {
      const e = allSequences[n - 1].days[0];
      conflits.push({
        planningLigneId: null,
        date: dateToYYYYMMDD(e.dateDebut),
        type: "NUIT_CONSEC",
        description: "Deux GPT de nuit consécutives détectées",
        regleCode: "GPT_NUIT_CONSECUTIVES",
        resolvable: true,
      });
    }
  }

  return conflits;
}
