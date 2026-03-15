/**
 * Moteur de règles métier ferroviaire
 * Calcule la mobilisabilité d'un agent pour un imprévu donné
 */

import { timeToMinutes, combineDateTime, diffMinutes, minutesToTime, isJsDeNuit, jsComportePeriode0h4h } from "@/lib/utils";
import type { DetailCalcul, RegleViolation, RegleRespectee, ResultatAgentDetail, StatutAgent } from "@/types/simulation";
import type { SimulationInput } from "@/types/simulation";
import { DEFAULT_WORK_RULES_MINUTES, type WorkRulesMinutes } from "@/lib/rules/workRules";

// ─── Types internes ────────────────────────────────────────────────────────────

export interface AgentContext {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  posteAffectation: string | null;
  agentReserve: boolean;
  peutFaireNuit: boolean;
  peutEtreDeplace: boolean;
  regimeB: boolean;
  regimeC: boolean;
  prefixesJs: string[];  // préfixes des codes JS autorisés — vide = aucune restriction
}

export interface PlanningEvent {
  dateDebut: Date;
  dateFin: Date;
  heureDebut: string;
  heureFin: string;
  amplitudeMin: number;     // durée totale en minutes
  dureeEffectiveMin: number | null;
  jsNpo: "JS" | "NPO";
  codeJs: string | null;
  typeJs: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// isJsDeNuit et jsComportePeriode0h4h importés depuis utils

function isJourneeJS(event: PlanningEvent): boolean {
  return event.jsNpo === "JS";
}

/**
 * Retourne le dernier poste JS (travail effectif) avant la date cible
 */
function getDernierPoste(events: PlanningEvent[], before: Date): PlanningEvent | null {
  const postes = events
    .filter((e) => isJourneeJS(e) && e.dateDebut < before)
    .sort((a, b) => b.dateDebut.getTime() - a.dateDebut.getTime());
  return postes[0] ?? null;
}

/**
 * Compte les jours dans la GPT courante (depuis dernier repos périodique)
 */
function compterJoursGPT(
  events: PlanningEvent[],
  before: Date,
  rpSimpleMin: number
): number {
  const joursJS = events
    .filter((e) => isJourneeJS(e) && e.dateDebut < before)
    .sort((a, b) => a.dateDebut.getTime() - b.dateDebut.getTime());

  if (joursJS.length === 0) return 0;

  let gptStart = joursJS[0].dateDebut;
  for (let i = joursJS.length - 1; i >= 1; i--) {
    const gap = diffMinutes(joursJS[i - 1].dateFin, joursJS[i].dateDebut);
    if (gap >= rpSimpleMin) {
      gptStart = joursJS[i].dateDebut;
      break;
    }
  }

  return joursJS.filter((e) => e.dateDebut >= gptStart).length;
}

/**
 * Calcule le cumul de travail effectif sur la GPT courante
 */
function cumulTrailEffectifGPT(
  events: PlanningEvent[],
  before: Date,
  rpSimpleMin: number
): number {
  const joursJS = events
    .filter((e) => isJourneeJS(e) && e.dateDebut < before)
    .sort((a, b) => a.dateDebut.getTime() - b.dateDebut.getTime());

  if (joursJS.length === 0) return 0;

  let gptStart = joursJS[0].dateDebut;
  for (let i = joursJS.length - 1; i >= 1; i--) {
    const gap = diffMinutes(joursJS[i - 1].dateFin, joursJS[i].dateDebut);
    if (gap >= rpSimpleMin) {
      gptStart = joursJS[i].dateDebut;
      break;
    }
  }

  return joursJS
    .filter((e) => e.dateDebut >= gptStart)
    .reduce((sum, e) => sum + (e.dureeEffectiveMin ?? e.amplitudeMin), 0);
}

/**
 * Détermine si une GPT (liste de JS) est de nuit.
 * Une GPT est de nuit si au moins la moitié de ses journées de service
 * comporte la période de 0h à 4h.
 */
function isGPTDeNuit(joursGPT: PlanningEvent[]): boolean {
  if (joursGPT.length === 0) return false;
  const nbAvec0h4h = joursGPT.filter((j) => jsComportePeriode0h4h(j.heureDebut, j.heureFin)).length;
  return nbAvec0h4h >= joursGPT.length / 2;
}

/**
 * Vérifie s'il y a eu 2 GPT de nuit consécutives avant la date cible.
 */
function deuxGPTNuitConsecutives(events: PlanningEvent[], before: Date, rpSimpleMin: number): boolean {
  const joursJS = events
    .filter((e) => isJourneeJS(e) && e.dateDebut < before)
    .sort((a, b) => a.dateDebut.getTime() - b.dateDebut.getTime());

  if (joursJS.length === 0) return false;

  // Découper en GPTs séparées par des repos périodiques (gap >= rpSimpleMin)
  const gpts: PlanningEvent[][] = [];
  let gptCourante: PlanningEvent[] = [joursJS[0]];
  for (let i = 1; i < joursJS.length; i++) {
    const gap = diffMinutes(joursJS[i - 1].dateFin, joursJS[i].dateDebut);
    if (gap >= rpSimpleMin) {
      gpts.push(gptCourante);
      gptCourante = [joursJS[i]];
    } else {
      gptCourante.push(joursJS[i]);
    }
  }
  gpts.push(gptCourante);

  // Vérifier si les 2 dernières GPTs sont de nuit
  if (gpts.length < 2) return false;
  const derniere = gpts[gpts.length - 1];
  const avantDerniere = gpts[gpts.length - 2];
  return isGPTDeNuit(derniere) && isGPTDeNuit(avantDerniere);
}

// ─── Moteur principal ─────────────────────────────────────────────────────────

export function evaluerMobilisabilite(
  agent: AgentContext,
  events: PlanningEvent[],
  simulation: SimulationInput,
  rules: WorkRulesMinutes = DEFAULT_WORK_RULES_MINUTES
): ResultatAgentDetail {
  const violations: RegleViolation[] = [];
  const respectees: RegleRespectee[] = [];

  const debutImprevu = combineDateTime(simulation.dateDebut, simulation.heureDebut);
  const finImprevu = combineDateTime(simulation.dateFin, simulation.heureFin);
  const amplitudeImprevu = diffMinutes(debutImprevu, finImprevu);
  const isNuitImprevu = isJsDeNuit(simulation.heureDebut, simulation.heureFin);

  // ─ Amplitude maximale autorisée ─────────────────────────────────────────────
  let amplitudeMax = rules.amplitude.general;
  let amplitudeRaison = "cas général";

  if (agent.agentReserve && (isNuitImprevu || simulation.posteNuit)) {
    amplitudeMax = rules.amplitude.nuitReserve;
    amplitudeRaison = "agent de réserve — poste de nuit";
  } else if (agent.agentReserve) {
    amplitudeMax = rules.amplitude.general;
    amplitudeRaison = "agent de réserve";
  } else if (simulation.deplacement && simulation.remplacement && agent.peutEtreDeplace) {
    amplitudeMax = rules.amplitude.deplacementRemplacement;
    amplitudeRaison = "agent en déplacement avec remplacement";
  } else if (simulation.deplacement && agent.peutEtreDeplace) {
    amplitudeMax = rules.amplitude.deplacement;
    amplitudeRaison = "agent en déplacement sans remplacement";
  } else if (isNuitImprevu || simulation.posteNuit) {
    amplitudeMax = rules.amplitude.nuit;
    amplitudeRaison = "poste de nuit";
  }

  // ─ Travail effectif max ──────────────────────────────────────────────────────
  let teMax = rules.travailEffectif.max;
  let teRaison = "standard";

  if (isNuitImprevu || simulation.posteNuit) {
    teMax = rules.travailEffectif.nuit;
    teRaison = "poste de nuit";
  } else if (simulation.remplacement) {
    teMax = rules.travailEffectif.max + rules.travailEffectif.supplementRemplace;
    teRaison = "remplacement (+2h)";
  }

  // ─ Repos journalier ──────────────────────────────────────────────────────────
  const dernierPoste = getDernierPoste(events, debutImprevu);
  let reposJournalierMin = rules.reposJournalier.standard;
  let reposDisponible: number | null = null;

  if (dernierPoste) {
    reposDisponible = diffMinutes(dernierPoste.dateFin, debutImprevu);

    // 14h après poste de nuit
    if (isJsDeNuit(dernierPoste.heureDebut, dernierPoste.heureFin)) {
      reposJournalierMin = rules.reposJournalier.apresNuit;
    } else if (agent.agentReserve && simulation.remplacement) {
      // 10h réduit pour agent de réserve assurant un remplacement (1× par GPT)
      reposJournalierMin = rules.reposJournalier.reduitReserve;
    }

    // +20 min si TE > 6h et pas de coupure (sauf après poste de nuit)
    if (
      dernierPoste.dureeEffectiveMin &&
      dernierPoste.dureeEffectiveMin > rules.pause.seuilTE &&
      !isJsDeNuit(dernierPoste.heureDebut, dernierPoste.heureFin)
    ) {
      reposJournalierMin += rules.pause.supplementSansCoupure;
    }
  }

  // ─ GPT ──────────────────────────────────────────────────────────────────────
  const joursGPT = compterJoursGPT(events, debutImprevu, rules.reposPeriodique.simple);
  const maxGPT = rules.gpt.max;
  const cumulTE = cumulTrailEffectifGPT(events, debutImprevu, rules.reposPeriodique.simple);

  // ─ Évaluation des règles ─────────────────────────────────────────────────────

  // 0. Préfixe JS autorisé
  const codeJs = simulation.codeJs ?? null;
  if (agent.prefixesJs.length === 0) {
    violations.push({
      regle: "PREFIXE_JS",
      description: "Aucun préfixe JS autorisé renseigné",
    });
  } else if (codeJs) {
    const autorise = agent.prefixesJs.some((p) =>
      codeJs.toUpperCase().startsWith(p.toUpperCase())
    );
    if (!autorise) {
      violations.push({
        regle: "PREFIXE_JS",
        description: `Code JS "${codeJs}" non couvert — préfixes autorisés : ${agent.prefixesJs.join(", ")}`,
      });
    } else {
      respectees.push({
        regle: "PREFIXE_JS",
        description: `Code JS "${codeJs}" autorisé (préfixe correspondant : ${agent.prefixesJs.find((p) => codeJs.toUpperCase().startsWith(p.toUpperCase()))})`,
      });
    }
  }

  // 1. Amplitude
  if (amplitudeImprevu > amplitudeMax) {
    violations.push({
      regle: "AMPLITUDE",
      description: `Amplitude dépasse le maximum autorisé (${amplitudeRaison})`,
      valeur: minutesToTime(amplitudeImprevu),
      limite: minutesToTime(amplitudeMax),
    });
  } else {
    respectees.push({
      regle: "AMPLITUDE",
      description: `Amplitude dans les limites (${amplitudeRaison})`,
      valeur: minutesToTime(amplitudeImprevu),
    });
  }

  // 2. Travail effectif
  if (amplitudeImprevu > teMax) {
    violations.push({
      regle: "TRAVAIL_EFFECTIF",
      description: `Durée effective dépasse le maximum (${teRaison})`,
      valeur: minutesToTime(amplitudeImprevu),
      limite: minutesToTime(teMax),
    });
  } else {
    respectees.push({ regle: "TRAVAIL_EFFECTIF", description: `Durée effective OK (${teRaison})` });
  }

  // 3. TE cumulé GPT
  const nouvelTeGPT = cumulTE + amplitudeImprevu;
  if (nouvelTeGPT > rules.travailEffectif.maxGPT) {
    violations.push({
      regle: "TE_GPT_48H",
      description: "Cumul travail effectif sur la GPT dépasserait 48h",
      valeur: minutesToTime(nouvelTeGPT),
      limite: minutesToTime(rules.travailEffectif.maxGPT),
    });
  } else {
    respectees.push({ regle: "TE_GPT_48H", description: "Cumul TE GPT OK", valeur: minutesToTime(nouvelTeGPT) });
  }

  // 4. Repos journalier
  if (reposDisponible !== null && reposDisponible < reposJournalierMin) {
    violations.push({
      regle: "REPOS_JOURNALIER",
      description: "Repos journalier insuffisant depuis le dernier poste",
      valeur: minutesToTime(reposDisponible),
      limite: minutesToTime(reposJournalierMin),
    });
  } else if (reposDisponible !== null) {
    respectees.push({
      regle: "REPOS_JOURNALIER",
      description: "Repos journalier suffisant",
      valeur: minutesToTime(reposDisponible),
    });
  } else {
    respectees.push({ regle: "REPOS_JOURNALIER", description: "Aucun poste précédent trouvé – repos OK" });
  }

  // 5. GPT max
  if (joursGPT >= maxGPT) {
    violations.push({
      regle: "GPT_MAX",
      description: "Nombre maximum de jours en GPT atteint",
      valeur: joursGPT,
      limite: maxGPT,
    });
  } else {
    respectees.push({ regle: "GPT_MAX", description: "GPT dans les limites", valeur: joursGPT });
  }

  // 7. Poste de nuit interdit si non habilité
  if ((isNuitImprevu || simulation.posteNuit) && !agent.peutFaireNuit) {
    violations.push({
      regle: "NUIT_HABILITATION",
      description: "Agent non habilité pour poste de nuit",
    });
  }

  // 8. Déplacement interdit si non habilité
  if (simulation.deplacement && !agent.peutEtreDeplace) {
    violations.push({
      regle: "DEPLACEMENT_HABILITATION",
      description: "Agent non autorisé pour déplacement",
    });
  }

  // 9. 2 GPT de nuit consécutives
  if ((isNuitImprevu || simulation.posteNuit) && deuxGPTNuitConsecutives(events, debutImprevu, rules.reposPeriodique.simple)) {
    violations.push({
      regle: "GPT_NUIT_CONSECUTIVES",
      description: "Agent aurait 2 GPT de nuit consécutives",
    });
  }

  // 10. Régime B/C – durée minimale
  if ((agent.regimeB || agent.regimeC) && amplitudeImprevu < rules.travailEffectif.minRegimeBC) {
    violations.push({
      regle: "MIN_REGIME_BC",
      description: "Durée inférieure au minimum pour régime B/C",
      valeur: minutesToTime(amplitudeImprevu),
      limite: minutesToTime(rules.travailEffectif.minRegimeBC),
    });
  }

  // ─ Statut final ──────────────────────────────────────────────────────────────
  let statut: StatutAgent;
  let scorePertinence: number;
  let motifPrincipal: string;

  if (violations.length === 0) {
    scorePertinence = 100;
    if (reposDisponible !== null) {
      const marge = reposDisponible - reposJournalierMin;
      scorePertinence -= Math.max(0, Math.round((240 - marge) / 24));
    }
    if (agent.agentReserve) scorePertinence += 10;
    if (joursGPT === 0) scorePertinence += 5;
    scorePertinence = Math.min(100, Math.max(0, scorePertinence));
    statut = "CONFORME";
    motifPrincipal = "Toutes les règles respectées";
  } else if (violations.length === 1 && violations[0].regle !== "REPOS_JOURNALIER" && violations[0].regle !== "AMPLITUDE") {
    statut = "VIGILANCE";
    scorePertinence = 40;
    motifPrincipal = violations[0].description;
  } else {
    statut = "NON_CONFORME";
    scorePertinence = Math.max(0, 10 - violations.length * 2);
    motifPrincipal = violations[0].description;
  }

  const detail: DetailCalcul = {
    amplitudeMaxAutorisee: amplitudeMax,
    amplitudeImprevu,
    dureeEffectiveMax: teMax,
    reposJournalierMin,
    dernierPosteDebut: dernierPoste ? dernierPoste.heureDebut : null,
    dernierPosteFin: dernierPoste ? dernierPoste.heureFin : null,
    reposJournalierDisponible: reposDisponible,
    gptActuel: joursGPT,
    gptMax: maxGPT,
    reposPeriodiqueProchain: null,
    violations,
    respectees,
    disponible: violations.length === 0,
  };

  return {
    agentId: agent.id,
    nom: agent.nom,
    prenom: agent.prenom,
    matricule: agent.matricule,
    posteAffectation: agent.posteAffectation,
    agentReserve: agent.agentReserve,
    statut,
    scorePertinence,
    motifPrincipal,
    detail,
  };
}
