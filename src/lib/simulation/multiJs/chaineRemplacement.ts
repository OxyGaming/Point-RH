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
import { isJsDeNuit, combineDateTime } from "@/lib/utils";
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
  // Le dateDebut est désormais un instant UTC absolu (post-migration étape 3).
  // toISOString().slice(0,10) extrait le jour calendaire UTC correspondant —
  // suffisant pour tracer la JS source dans la chaîne (la convention métier
  // côté UI applique formatDateParis si l'affichage doit être en jour Paris).
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
 *
 * Note : depuis la migration UTC absolu (étape 3), `dateDebut` / `dateFin`
 * représentent les vrais instants UTC de prise/fin de service. Comparaison
 * directe possible.
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
 * Énumère jusqu'à `maxResults` chaînes valides comblant le `trou`. Chaque
 * résultat est une liste de maillons (1 si candidat libre, ≥ 2 si récursion
 * pour libérer le candidat de son propre conflit).
 *
 * `maxResults = 1` reproduit l'ancien comportement DFS premier-trouvé,
 * utilisé par le greedy. Pour exposer plusieurs alternatives à l'utilisateur,
 * passer `maxResults = 5` (ou plus).
 *
 * @param trou             JS à reprendre par un agent de cette profondeur.
 * @param ctx              Contexte commun.
 * @param niveauActuel     Niveau de récursion (1 pour le 1er maillon).
 * @param agentsEngages    Set anti-cycle : agents déjà utilisés en amont.
 * @param maxResults       Plafond du nombre de chaînes collectées (défaut 1).
 *
 * @returns Liste de chaînes (chacune = liste de maillons). Vide si aucune.
 */
export function chercherMaillons(
  trou: JsCible,
  ctx: ChaineContexte,
  niveauActuel: number,
  agentsEngages: Set<string>,
  maxResults: number = 1
): MaillonChaine[][] {
  const resultats: MaillonChaine[][] = [];
  if (niveauActuel > ctx.profondeurMax) return resultats;
  if (ctx.budget.remaining <= 0) return resultats;
  if (maxResults <= 0) return resultats;

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

  // Aligné en UTC via combineDateTime pour cohérence avec les events
  // (qui sont en UTC absolu post-migration étape 3).
  const trouStart = combineDateTime(trou.date, trou.heureDebut);
  let trouEnd = combineDateTime(trou.date, trou.heureFin);
  if (trouEnd.getTime() <= trouStart.getTime()) {
    trouEnd = new Date(trouEnd.getTime() + 24 * 3600 * 1000);
  }

  for (const candidatId of candidats) {
    if (resultats.length >= maxResults) break;
    if (ctx.budget.remaining <= 0) break;
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
      resultats.push([maillon]);
      continue;
    }

    // Cas profondeur N+1 : ce candidat est lui-même bloqué — peut-on cascader ?
    if (niveauActuel >= ctx.profondeurMax) continue;

    const sousTrou = eventToJsCibleSource(conflit, candidat, ctx.importId);
    if (sousTrou === null) continue;

    // Récursivement, ne demander qu'**une** sous-chaîne par candidat de niveau N
    // (sinon explosion combinatoire ; les utilisateurs voient déjà la diversité
    // au niveau 1 via maxResults).
    const sousChaines = chercherMaillons(
      sousTrou,
      ctx,
      niveauActuel + 1,
      new Set([...agentsEngages, candidatId]),
      1
    );
    if (sousChaines.length === 0) continue;
    const sousChaine = sousChaines[0];

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

    const conflitStart = conflit.dateDebut;
    const maillon: MaillonChaine = {
      niveau: niveauActuel,
      agentId: candidat.context.id,
      agentNom: candidat.context.nom,
      agentPrenom: candidat.context.prenom,
      agentMatricule: candidat.context.matricule,
      jsLiberee: {
        planningLigneId: conflit.planningLigneId ?? "",
        codeJs: conflit.codeJs,
        date: conflitStart.toISOString().slice(0, 10),
        heureDebut: conflit.heureDebut,
        heureFin: conflit.heureFin,
      },
      jsRepriseCodeJs: trou.codeJs,
      statut: compat.statut === "VIGILANCE" ? "VIGILANCE" : "DIRECT",
    };
    resultats.push([maillon, ...sousChaine]);
  }

  return resultats;
}

/**
 * Point d'entrée principal — variante 1 chaîne : tente de constituer la
 * première chaîne valide pour libérer `agentBloqueId` de son `eventConflit`.
 * Conserve l'ancien comportement (DFS premier-trouvé) pour le greedy.
 */
export function tenterChaineRemplacement(
  agentBloqueId: string,
  eventConflit: PlanningEvent,
  ctx: ChaineContexte
): ChaineRemplacement | null {
  const chaines = enumererChainesRemplacement(agentBloqueId, eventConflit, ctx, 1);
  return chaines[0] ?? null;
}

/**
 * Variante N chaînes : énumère jusqu'à `maxResults` alternatives de chaîne
 * pour libérer `agentBloqueId`. Utilisé pour exposer plusieurs plans B dans
 * l'onglet Alternatives — le décideur compare et choisit.
 *
 * Cap par défaut à 5, suffisant pour montrer la diversité sans saturer l'UI
 * ni exploser le budget récursif.
 */
export function enumererChainesRemplacement(
  agentBloqueId: string,
  eventConflit: PlanningEvent,
  ctx: ChaineContexte,
  maxResults: number = 5
): ChaineRemplacement[] {
  const agentBloque = ctx.agentsMap.get(agentBloqueId);
  if (!agentBloque) return [];

  const sousTrou = eventToJsCibleSource(eventConflit, agentBloque, ctx.importId);
  if (sousTrou === null) return [];

  const maillonsListe = chercherMaillons(
    sousTrou,
    ctx,
    1,
    new Set([agentBloqueId]),
    maxResults
  );

  return maillonsListe
    .filter((maillons) => maillons.length > 0)
    .map((maillons) => ({
      maillons,
      profondeur: maillons.length,
      complete: true,
    }));
}
