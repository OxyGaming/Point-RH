/**
 * Analyse des Repos Périodiques (RP) encadrant la GPT affectée par une simulation.
 *
 * Responsabilité unique : calculer GptRpAnalyse à partir du planning post-injection.
 * Ne touche pas aux repos journaliers inter-JS (gérés par conflictDetector.ts).
 *
 * V1 : RP simple uniquement (rpSimpleMin = 36h).
 * V2 prévue : adapter rpAvantGptMinRequis / rpApresGptMinRequis selon gptLength.
 */

import { computeWorkSequences } from "@/lib/rules/gptEngine";
import { diffMinutes } from "@/lib/utils";
import type { PlanningEvent } from "@/engine/rules";
import type { GptRpAnalyse } from "@/types/simulation";
import type { WorkRulesMinutes } from "@/lib/rules/workRules";

// ─── Helpers internes ─────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Trouve l'index de la séquence contenant la date simulée.
 * Retourne -1 si aucune séquence ne la contient.
 */
function findSequenceIndex(
  sequences: ReturnType<typeof computeWorkSequences>,
  simDate: Date
): number {
  const dateStr = toDateStr(simDate);
  return sequences.findIndex((s) =>
    s.days.some((d) => toDateStr(d.dateDebut) === dateStr)
  );
}

/**
 * Calcule le gap RP avant et après une séquence donnée.
 */
function computeRpGaps(
  sequences: ReturnType<typeof computeWorkSequences>,
  idx: number
): { rpAvantMin: number | null; rpApresMin: number | null } {
  const gpt = sequences[idx];
  const prev = idx > 0 ? sequences[idx - 1] : null;
  const next = idx < sequences.length - 1 ? sequences[idx + 1] : null;

  return {
    rpAvantMin: prev !== null
      ? diffMinutes(prev.endDate, gpt.startDate)
      : null,
    rpApresMin: next !== null
      ? diffMinutes(gpt.endDate, next.startDate)
      : null,
  };
}

// ─── Fonction principale ──────────────────────────────────────────────────────

/**
 * Calcule l'analyse des RP encadrant la GPT impactée par une JS simulée.
 *
 * @param eventsSimules    Planning complet AVEC la JS injectée
 * @param simDate          Date de début de la JS injectée
 * @param rules            Règles de travail
 * @param eventsOriginaux  Planning SANS la JS injectée — permet de qualifier
 *                         transitionImpactee par comparaison avant/après.
 *                         Si absent, transitionImpactee est basé sur la
 *                         conformité post-simulation seule.
 */
export function analyserRpAutourGpt(
  eventsSimules: PlanningEvent[],
  simDate: Date,
  rules: WorkRulesMinutes,
  eventsOriginaux?: PlanningEvent[]
): GptRpAnalyse | null {
  const rpSimpleMin = rules.reposPeriodique.simple;

  // ── 1. Séquences post-simulation ──────────────────────────────────────────
  const sequencesApres = computeWorkSequences(eventsSimules, rpSimpleMin);
  if (sequencesApres.length === 0) return null;

  const idxApres = findSequenceIndex(sequencesApres, simDate);
  if (idxApres === -1) return null;

  const gptCible = sequencesApres[idxApres];
  const prevApres = idxApres > 0 ? sequencesApres[idxApres - 1] : null;
  const nextApres = idxApres < sequencesApres.length - 1 ? sequencesApres[idxApres + 1] : null;

  const { rpAvantMin: rpAvantApres, rpApresMin: rpApresApres } =
    computeRpGaps(sequencesApres, idxApres);

  // ── 2. Conformité post-simulation ─────────────────────────────────────────
  // V1 : minRequis = rpSimpleMin pour les deux transitions.
  const rpAvantMinRequis = rpSimpleMin;
  const rpApresMinRequis = rpSimpleMin;

  const rpAvantConforme: boolean | null =
    rpAvantApres === null ? null : rpAvantApres >= rpAvantMinRequis;
  const rpApresConforme: boolean | null =
    rpApresApres === null ? null : rpApresApres >= rpApresMinRequis;

  // ── 3. Calcul de transitionImpactee ───────────────────────────────────────
  let avantDegradé = false;
  let apresDegradé = false;

  if (eventsOriginaux && eventsOriginaux.length > 0) {
    const sequencesAvant = computeWorkSequences(eventsOriginaux, rpSimpleMin);

    // Trouver la GPT "équivalente" dans le planning original :
    // on cherche la première JS de gptCible.days qui existait déjà dans le planning original.
    // Si simDate est une injection pure (nouvelle JS), ce sera la première JS originale
    // absorbée dans la GPT fusionnée (ex: premier JS d'une GPT voisine).
    // Ce point d'ancrage permet de comparer des RP homologues avant / après simulation.
    let idxAvant = -1;
    for (const day of gptCible.days) {
      const dayStr = toDateStr(day.dateDebut);
      const found = sequencesAvant.findIndex((s) =>
        s.days.some((d) => toDateStr(d.dateDebut) === dayStr)
      );
      if (found !== -1) {
        idxAvant = found;
        break;
      }
    }

    if (idxAvant !== -1) {
      const { rpAvantMin: rpAvantOrig, rpApresMin: rpApresOrig } =
        computeRpGaps(sequencesAvant, idxAvant);

      // Dégradé = le RP existait avant (non null) ET est maintenant plus court
      // ou a disparu (null = fusion de GPTs).
      avantDegradé =
        rpAvantOrig !== null &&
        (rpAvantApres === null || rpAvantApres < rpAvantOrig);

      apresDegradé =
        rpApresOrig !== null &&
        (rpApresApres === null || rpApresApres < rpApresOrig);
    } else {
      // GPT entièrement nouvelle (aucune JS originale) : pas de référence de comparaison.
      // En V1 les RPs visibles sont toujours conformes → AUCUNE par défaut.
      avantDegradé = false;
      apresDegradé = false;
    }
  }
  // Sans eventsOriginaux : en V1, computeWorkSequences garantit que tout gap entre
  // deux séquences est ≥ rpSimpleMin → rpAvantGptConforme / rpApresGptConforme sont
  // toujours true quand non-null. Aucune non-conformité n'est possible ici.

  const transitionImpactee: GptRpAnalyse["transitionImpactee"] =
    avantDegradé && apresDegradé ? "LES_DEUX"
    : avantDegradé              ? "AVANT"
    : apresDegradé              ? "APRES"
                                : "AUCUNE";

  // ── 4. Construction du résultat ───────────────────────────────────────────
  return {
    gptLength:         gptCible.length,
    premierJsDate:     toDateStr(gptCible.startDate),
    dernierJsDate:     toDateStr(gptCible.endDate),

    gptPrecedenteFin:  prevApres ? prevApres.endDate.toISOString() : null,
    gptSuivanteDebut:  nextApres ? nextApres.startDate.toISOString() : null,

    rpAvantGptMin:     rpAvantApres,
    rpApresGptMin:     rpApresApres,

    rpAvantGptMinRequis: rpAvantMinRequis,
    rpApresGptMinRequis: rpApresMinRequis,

    rpAvantGptConforme: rpAvantConforme,
    rpApresGptConforme: rpApresConforme,

    transitionImpactee,
  };
}
