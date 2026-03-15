/**
 * Étape 3 — Détection des conflits induits
 * Analyse le planning d'un agent après injection de la JS cible.
 */

import { diffMinutes, minutesToTime, isJsDeNuit, jsComportePeriode0h4h } from "@/lib/utils";
import type { PlanningEvent } from "@/engine/rules";
import type { ConflitInduit, TypeConflit } from "@/types/js-simulation";
import { DEFAULT_WORK_RULES_MINUTES, type WorkRulesMinutes } from "@/lib/rules/workRules";

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
  const reposMin = agentReserve && remplacement
    ? rules.reposJournalier.reduitReserve
    : rules.reposJournalier.standard;

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
    const gap = diffMinutes(sortedEvents[i - 1].dateFin, next.dateDebut);
    const deltaDays = diffMinutes(heureFinJs, next.dateDebut) / 60 / 24;

    if (deltaDays > 3) break; // Au-delà de 3 jours, on arrête

    if (next.jsNpo === "JS") {
      // Repos journalier insuffisant
      if (gap < reposMin) {
        conflits.push({
          planningLigneId: null,
          date: dateToYYYYMMDD(next.dateDebut),
          heureDebut: next.heureDebut,
          heureFin: next.heureFin,
          type: "REPOS_INSUFFISANT",
          description: `Repos insuffisant avant JS du ${dateToYYYYMMDD(next.dateDebut)} ${next.heureDebut}: ${minutesToTime(gap)} disponibles (min: ${minutesToTime(reposMin)})`,
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

  // Vérifier GPT (compter les JS dans la période courante)
  const jsOnly = sortedEvents.filter((e) => e.jsNpo === "JS");
  let gptCourant = 0;

  for (let i = 0; i < jsOnly.length; i++) {
    if (i === 0 || diffMinutes(jsOnly[i - 1].dateFin, jsOnly[i].dateDebut) >= rules.reposPeriodique.simple) {
      gptCourant = 1;
    } else {
      gptCourant++;
    }

    if (gptCourant > rules.gpt.max) {
      conflits.push({
        planningLigneId: null,
        date: dateToYYYYMMDD(jsOnly[i].dateDebut),
        type: "GPT_MAX",
        description: `GPT dépasse le maximum de ${rules.gpt.max} jours (jour ${gptCourant})`,
        regleCode: "GPT_MAX",
        resolvable: false,
      });
      break;
    }
  }

  // 2 GPT de nuit consécutives
  // Une GPT est de nuit si au moins la moitié de ses JS comportent la période 0h-4h
  const gptsDetectees: PlanningEvent[][] = [];
  let gptCourante: PlanningEvent[] = jsOnly.length > 0 ? [jsOnly[0]] : [];
  for (let i = 1; i < jsOnly.length; i++) {
    if (diffMinutes(jsOnly[i - 1].dateFin, jsOnly[i].dateDebut) >= rules.reposPeriodique.simple) {
      gptsDetectees.push(gptCourante);
      gptCourante = [jsOnly[i]];
    } else {
      gptCourante.push(jsOnly[i]);
    }
  }
  if (gptCourante.length > 0) gptsDetectees.push(gptCourante);

  const isGPTDeNuit = (gpt: PlanningEvent[]) => {
    const nb = gpt.filter((j) => jsComportePeriode0h4h(j.heureDebut, j.heureFin)).length;
    return nb >= gpt.length / 2;
  };

  if (gptsDetectees.length >= 2) {
    const n = gptsDetectees.length;
    if (isGPTDeNuit(gptsDetectees[n - 1]) && isGPTDeNuit(gptsDetectees[n - 2])) {
      const e = gptsDetectees[n - 1][0];
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
