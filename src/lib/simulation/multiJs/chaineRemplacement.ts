/**
 * Mode "Cascade" — chaîne de remplacement à profondeur paramétrable.
 *
 * Quand un agent A est habilité pour la JS cible mais bloqué par sa propre JS
 * S(A), au lieu de sacrifier S(A) (Figeage DERNIER_RECOURS), on cherche un
 * agent B capable de couvrir S(A). Si B existe → cascade A→cible, B→S(A).
 *
 * Profondeur 1 (Phase 2) : on cherche un B libre qui peut prendre S(A).
 * Profondeur 2 (Phase 4) : autorise B lui-même à être bloqué si on trouve un C
 *                          pour reprendre S(B).
 */

import type { PlanningEvent } from "@/engine/rules";
import type { JsCible } from "@/types/js-simulation";
import type { WorkRulesMinutes } from "@/lib/rules/workRules";
import type { EffectiveServiceInfo } from "@/types/deplacement";
import type { MaillonChaine, ChaineRemplacement } from "@/types/multi-js-simulation";
import { isJsDeNuit } from "@/lib/utils";
import { canAssignJsToAgentInScenario } from "./agentScenarioValidator";
import { isZeroLoadJs } from "@/lib/simulation/jsUtils";
import type { AgentDataMultiJs } from "./multiJsCandidateFinder";
import type { AgentCoverageIndex } from "./chaineCache";
import { findEligibleAgentsForJs } from "./chaineCache";

/** Budget d'évaluations partagé entre tous les appels d'une simulation. */
export interface BudgetEvaluations {
  remaining: number;
}

/** Contexte commun à tous les appels de cascade pour un scénario. */
export interface ChaineContexte {
  agentsMap: Map<string, AgentDataMultiJs>;
  index: AgentCoverageIndex;
  rules: WorkRulesMinutes;
  remplacement: boolean;
  deplacement: boolean;
  effectiveServiceMap?: Map<string, EffectiveServiceInfo>;
  zeroLoadPrefixes: readonly string[];
  /** Allocations actuelles dans le scénario (autres JS déjà attribuées par agent). */
  agentAssignments: Map<string, JsCible[]>;
  /** Profondeur maximale de la chaîne (1 ou 2 typiquement). */
  profondeurMax: number;
  /** Budget d'évaluations partagé — décrémenté à chaque tentative. */
  budget: BudgetEvaluations;
  /** importId du dataset, pour synthétiser un JsCible à partir d'un event. */
  importId: string;
}

/**
 * Convertit un PlanningEvent (la JS source d'un agent que la chaîne va lui retirer)
 * en JsCible exploitable par `canAssignJsToAgentInScenario` et la suite.
 *
 * Note : le `planningLigneId` est conservé tel quel ; les champs nominatifs
 * (agentId/Nom…) renseignent l'agent **source** de cette JS (celui qu'on
 * libère par cette cascade).
 */
function eventToJsCibleSource(
  event: PlanningEvent,
  agentSource: AgentDataMultiJs,
  importId: string
): JsCible | null {
  if (!event.planningLigneId) return null;
  const dateIso = event.dateDebut.toISOString().slice(0, 10);
  const isNuit = isJsDeNuit(event.heureDebut, event.heureFin);
  return {
    planningLigneId: event.planningLigneId,
    agentId:        agentSource.context.id,
    agentNom:       agentSource.context.nom,
    agentPrenom:    agentSource.context.prenom,
    agentMatricule: agentSource.context.matricule,
    date:           dateIso,
    heureDebut:     event.heureDebut,
    heureFin:       event.heureFin,
    amplitudeMin:   event.amplitudeMin,
    codeJs:         event.codeJs,
    typeJs:         event.typeJs,
    isNuit,
    importId,
    flexibilite:    "OBLIGATOIRE",
  };
}

/**
 * Trouve un PlanningEvent (JS non-Z) qui chevauche `[start, end]` dans la
 * liste `events`. null si aucun.
 */
function trouverEventConflit(
  events: PlanningEvent[],
  start: Date,
  end: Date,
  zeroLoadPrefixes: readonly string[]
): PlanningEvent | null {
  for (const e of events) {
    if (e.jsNpo !== "JS") continue;
    if (isZeroLoadJs(e.codeJs, e.typeJs, zeroLoadPrefixes)) continue;
    if (e.dateDebut < end && e.dateFin > start) return e;
  }
  return null;
}

/**
 * Tente de constituer une chaîne de remplacement pour combler la JS `trou`
 * (que l'agent du niveau précédent libère pour rejoindre sa propre cible).
 *
 * @param trou             JS à reprendre par un agent de cette profondeur.
 * @param ctx              Contexte commun.
 * @param niveauActuel     Niveau de récursion (1 pour le 1er maillon).
 * @param agentsEngages    Set anti-cycle : agents déjà utilisés en amont.
 *
 * @returns Liste de maillons (1 ou plusieurs si récursion) si la chaîne existe,
 *          null si aucun candidat n'a pu être trouvé.
 */
export function chercherMaillon(
  trou: JsCible,
  ctx: ChaineContexte,
  niveauActuel: number,
  agentsEngages: Set<string>
): MaillonChaine[] | null {
  if (niveauActuel > ctx.profondeurMax) return null;
  if (ctx.budget.remaining <= 0) return null;

  // Pré-filtre structurel : préfixe + nuit + déplacement
  const eligibles = findEligibleAgentsForJs(
    ctx.index,
    trou.codeJs,
    trou.isNuit,
    ctx.deplacement
  );

  // Tri stable des candidats : libres d'abord (eligible non engagé), réservistes prioritaires
  const candidats: string[] = [];
  for (const id of eligibles) {
    if (agentsEngages.has(id)) continue;
    candidats.push(id);
  }
  candidats.sort((a, b) => {
    const aData = ctx.agentsMap.get(a);
    const bData = ctx.agentsMap.get(b);
    const aRes = aData?.context.agentReserve ? 1 : 0;
    const bRes = bData?.context.agentReserve ? 1 : 0;
    return bRes - aRes;
  });

  const trouStart = new Date(`${trou.date}T${trou.heureDebut}:00`);
  const trouEnd   = new Date(`${trou.date}T${trou.heureFin}:00`);
  if (trouEnd <= trouStart) trouEnd.setDate(trouEnd.getDate() + 1);

  for (const candidatId of candidats) {
    if (ctx.budget.remaining <= 0) return null;
    ctx.budget.remaining -= 1;

    const candidat = ctx.agentsMap.get(candidatId);
    if (!candidat) continue;

    // Le candidat a-t-il un conflit horaire sur ce trou ?
    const conflit = trouverEventConflit(candidat.events, trouStart, trouEnd, ctx.zeroLoadPrefixes);

    if (!conflit) {
      // Cas simple : candidat libre — on évalue la RH cumulée
      const dejaAff = ctx.agentAssignments.get(candidatId) ?? [];
      const compat = canAssignJsToAgentInScenario(
        candidat,
        trou,
        dejaAff,
        ctx.rules,
        ctx.remplacement,
        ctx.deplacement,
        ctx.effectiveServiceMap
      );
      if (!compat.compatible) continue;

      const maillon: MaillonChaine = {
        niveau: niveauActuel,
        agentId: candidat.context.id,
        agentNom: candidat.context.nom,
        agentPrenom: candidat.context.prenom,
        agentMatricule: candidat.context.matricule,
        jsLiberee: {
          planningLigneId: trou.planningLigneId,
          codeJs: trou.codeJs,
          date: trou.date,
          heureDebut: trou.heureDebut,
          heureFin: trou.heureFin,
        },
        jsRepriseCodeJs: trou.codeJs,
        statut: compat.statut === "VIGILANCE" ? "VIGILANCE" : "DIRECT",
      };
      return [maillon];
    }

    // Cas profondeur N+1 : ce candidat est lui-même bloqué — peut-on cascader ?
    if (niveauActuel >= ctx.profondeurMax) continue;

    const sousTrou = eventToJsCibleSource(conflit, candidat, ctx.importId);
    if (sousTrou === null) continue;

    const sousChaine = chercherMaillon(
      sousTrou,
      ctx,
      niveauActuel + 1,
      new Set([...agentsEngages, candidatId])
    );
    if (sousChaine === null) continue;

    // Le candidat peut-il prendre le trou en supposant qu'il a libéré son conflit ?
    const candidatSansConflit: AgentDataMultiJs = {
      context: candidat.context,
      events: candidat.events.filter((e) => e !== conflit),
    };
    const dejaAff = ctx.agentAssignments.get(candidatId) ?? [];
    const compat = canAssignJsToAgentInScenario(
      candidatSansConflit,
      trou,
      dejaAff,
      ctx.rules,
      ctx.remplacement,
      ctx.deplacement,
      ctx.effectiveServiceMap
    );
    if (!compat.compatible) continue;

    const maillon: MaillonChaine = {
      niveau: niveauActuel,
      agentId: candidat.context.id,
      agentNom: candidat.context.nom,
      agentPrenom: candidat.context.prenom,
      agentMatricule: candidat.context.matricule,
      jsLiberee: {
        planningLigneId: conflit.planningLigneId ?? "",
        codeJs: conflit.codeJs,
        date: conflit.dateDebut.toISOString().slice(0, 10),
        heureDebut: conflit.heureDebut,
        heureFin: conflit.heureFin,
      },
      jsRepriseCodeJs: trou.codeJs,
      statut: compat.statut === "VIGILANCE" ? "VIGILANCE" : "DIRECT",
    };
    return [maillon, ...sousChaine];
  }

  return null;
}

/**
 * Point d'entrée principal : tente de constituer une chaîne pour libérer
 * `agentBloqueId` de son `eventConflit`, afin qu'il puisse rejoindre la JS cible.
 *
 * Retourne :
 * - `{ maillons, complete: true }` si la chaîne couvre tous les trous induits
 * - `null` si aucune chaîne valide n'a pu être trouvée
 */
export function tenterChaineRemplacement(
  agentBloqueId: string,
  eventConflit: PlanningEvent,
  ctx: ChaineContexte
): ChaineRemplacement | null {
  const agentBloque = ctx.agentsMap.get(agentBloqueId);
  if (!agentBloque) return null;

  const sousTrou = eventToJsCibleSource(eventConflit, agentBloque, ctx.importId);
  if (sousTrou === null) return null;

  const maillons = chercherMaillon(
    sousTrou,
    ctx,
    1,
    new Set([agentBloqueId])
  );

  if (maillons === null || maillons.length === 0) return null;

  return {
    maillons,
    profondeur: maillons.length,
    complete: true,
  };
}
