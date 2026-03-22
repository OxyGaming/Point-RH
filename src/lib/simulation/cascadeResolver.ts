/**
 * Étape 4 — Résolution en cascade
 * Pour chaque conflit résolvable, tente de trouver un agent qui peut
 * reprendre la JS conflictuelle (profondeur max = 2).
 */

import { combineDateTime, diffMinutes, minutesToTime, isJsDeNuit } from "@/lib/utils";
import { evaluerMobilisabilite } from "@/engine/rules";
import type { AgentContext, PlanningEvent } from "@/engine/rules";
import type { ImpreuvuConfig, ImpactCascade, ModificationPlanning, ConflitInduit } from "@/types/js-simulation";
import { isAbsenceInaptitude } from "./jsUtils";

const CASCADE_MAX_DEPTH = 2;

export interface ResolutionResultat {
  resolu: boolean;
  agentRemplagant: AgentContext | null;
  modification: ModificationPlanning | null;
  impactsCascade: ImpactCascade[];
}

/**
 * Tente de résoudre un conflit de type REPOS_INSUFFISANT
 * en trouvant un agent qui peut reprendre la JS conflictuelle.
 */
export function tenterResolutionCascade(
  conflit: ConflitInduit,
  conflictingEvent: PlanningEvent | null,
  autresAgents: { context: AgentContext; events: PlanningEvent[] }[],
  depth: number = 1,
  npoExclusionCodes: string[] = []
): ResolutionResultat {
  if (depth > CASCADE_MAX_DEPTH || !conflictingEvent) {
    return { resolu: false, agentRemplagant: null, modification: null, impactsCascade: [] };
  }

  // Chercher un agent disponible pour la JS conflictuelle
  for (const autre of autresAgents) {
    const jsDebut = conflictingEvent.dateDebut;
    const jsFin = conflictingEvent.dateFin;

    // Vérifier qu'il n'a pas de JS pendant cette période
    const dejaPris = autre.events.some(
      (e) => e.jsNpo === "JS" && e.dateDebut < jsFin && e.dateFin > jsDebut
    );
    if (dejaPris) continue;

    // Vérifier absence pour inaptitude (codes configurés par l'admin)
    const enInaptitude = autre.events.some(
      (e) => isAbsenceInaptitude(e, npoExclusionCodes) && e.dateDebut < jsFin && e.dateFin > jsDebut
    );
    if (enInaptitude) continue;

    // Simuler en injectant la JS conflictuelle dans son planning
    const impreuvuSimule: ImpreuvuConfig = {
      partiel: false,
      heureDebutReel: conflictingEvent.heureDebut,
      heureFinEstimee: conflictingEvent.heureFin,
      deplacement: false,
      remplacement: true,
    };

    const simulationInput = {
      importId: "",
      dateDebut: jsDebut.toISOString().slice(0, 10),
      dateFin: jsFin.toISOString().slice(0, 10),
      heureDebut: conflictingEvent.heureDebut,
      heureFin: conflictingEvent.heureFin,
      poste: conflictingEvent.codeJs ?? "JS",
      remplacement: true,
      deplacement: false,
      posteNuit: isJsDeNuit(conflictingEvent.heureDebut, conflictingEvent.heureFin),
    };

    const resultat = evaluerMobilisabilite(autre.context, autre.events, simulationInput);

    if (resultat.statut === "CONFORME" || resultat.statut === "VIGILANCE") {
      const impacts: ImpactCascade[] = [];

      if (resultat.statut === "VIGILANCE") {
        impacts.push({
          agentId: autre.context.id,
          agentNom: autre.context.nom,
          agentPrenom: autre.context.prenom,
          description: resultat.motifPrincipal,
          regle: resultat.detail.violations[0]?.regle ?? "VIGILANCE",
          severity: "AVERTISSEMENT",
          date: jsDebut.toISOString().slice(0, 10),
        });
      }

      return {
        resolu: true,
        agentRemplagant: autre.context,
        modification: {
          agentId: autre.context.id,
          agentNom: autre.context.nom,
          agentPrenom: autre.context.prenom,
          action: "ECHANGER_JS",
          description: `${autre.context.nom} ${autre.context.prenom} reprend la JS du ${jsDebut.toISOString().slice(0, 10)} ${conflictingEvent.heureDebut}-${conflictingEvent.heureFin} libérée par le conflit`,
          violations: resultat.detail.violations,
          conforme: resultat.statut === "CONFORME",
        },
        impactsCascade: impacts,
      };
    }
  }

  return { resolu: false, agentRemplagant: null, modification: null, impactsCascade: [] };
}

/**
 * Résout tous les conflits résolvables en cascade pour un candidat.
 */
export function resoudreTousConflits(
  conflitsResolvables: ConflitInduit[],
  eventsApresJs: PlanningEvent[],
  autresAgents: { context: AgentContext; events: PlanningEvent[] }[],
  npoExclusionCodes: string[] = []
): { modifications: ModificationPlanning[]; impactsCascade: ImpactCascade[]; nbResolu: number } {
  const modifications: ModificationPlanning[] = [];
  const impactsCascade: ImpactCascade[] = [];
  let nbResolu = 0;

  for (const conflit of conflitsResolvables) {
    if (!conflit.resolvable) continue;

    // Trouver l'événement conflictuel dans le planning
    const evConflictuel = eventsApresJs.find((e) => {
      const dateStr = e.dateDebut.toISOString().slice(0, 10);
      return dateStr === conflit.date && e.jsNpo === "JS" &&
        (conflit.heureDebut ? e.heureDebut === conflit.heureDebut : true);
    }) ?? null;

    const res = tenterResolutionCascade(conflit, evConflictuel, autresAgents, 1, npoExclusionCodes);

    if (res.resolu && res.modification) {
      modifications.push(res.modification);
      impactsCascade.push(...res.impactsCascade);
      nbResolu++;
    } else if (!res.resolu) {
      impactsCascade.push({
        agentId: "",
        agentNom: "—",
        agentPrenom: "",
        description: `Conflit non résolu : ${conflit.description}`,
        regle: conflit.regleCode,
        severity: "BLOQUANT",
        date: conflit.date,
      });
    }
  }

  return { modifications, impactsCascade, nbResolu };
}
