/**
 * Solveur unifié — gestion d'état de branche.
 *
 * État = trois préoccupations distinctes :
 *  1. Constantes du scénario (agentsMap, rules, etc.) : référencées par
 *     valeur, jamais clonées.
 *  2. État de branche (affectations courantes, JS libérées, agents engagés…) :
 *     CLONÉ à chaque enrichirEtat — un échec de branche n'a pas besoin de
 *     rollback explicite, on jette le clone.
 *  3. Globaux partagés (budget, cache) : MUTABLES, partagés entre toutes les
 *     branches pour borner le coût total.
 */

import type { JsCible } from "@/types/js-simulation";
import type { PlanningEvent } from "@/engine/rules";
import type { AgentDataMultiJs } from "@/lib/simulation/multiJs/multiJsCandidateFinder";
import type { EtatCascade, Besoin, Resolution } from "./types";
import { SOLVER_DEFAULTS } from "./types";
import type { AgentCoverageIndex } from "@/lib/simulation/multiJs/chaineCache";
import type { WorkRulesMinutes } from "@/lib/rules/workRules";
import type { LpaContext } from "@/types/deplacement";
import { combineDateTime } from "@/lib/utils";
import { buildImprevu } from "@/lib/simulation/multiJs/multiJsCandidateFinder";

// ─── Construction initiale ───────────────────────────────────────────────────

export interface EtatInitialParams {
  agentsMap: ReadonlyMap<string, AgentDataMultiJs>;
  index: AgentCoverageIndex;
  rules: WorkRulesMinutes;
  lpaContext?: LpaContext;
  npoExclusionCodes?: readonly string[];
  remplacement?: boolean;
  deplacement?: boolean;
  importId: string;
  profondeurMax?: number;
  budget?: number;
  /** Affectations préexistantes (autres JS déjà retenues hors solveur). */
  affectationsInitiales?: Map<string, JsCible[]>;
}

export function creerEtatInitial(params: EtatInitialParams): EtatCascade {
  return {
    agentsMap: params.agentsMap,
    index: params.index,
    rules: params.rules,
    lpaContext: params.lpaContext,
    npoExclusionCodes: params.npoExclusionCodes ?? [],
    remplacement: params.remplacement ?? true,
    deplacement: params.deplacement ?? false,
    importId: params.importId,
    profondeurMax: params.profondeurMax ?? SOLVER_DEFAULTS.CASCADE_MAX_DEPTH,
    affectationsCourantes: new Map(params.affectationsInitiales ?? []),
    jsLibereesDansBranche: new Set(),
    agentsEngagesBranche: new Set(),
    besoinsEnCoursBranche: new Set(),
    budget: { remaining: params.budget ?? SOLVER_DEFAULTS.CASCADE_EVAL_BUDGET },
    cache: new Map(),
  };
}

// ─── Enrichissement (clone partiel + extension) ──────────────────────────────

/**
 * Construit un nouvel état pour la récursion : l'agent vient d'être affecté
 * au besoin, donc il est désormais engagé et la JS du besoin (si elle a un
 * planningLigneId) est marquée comme libérée pour son agent originel.
 *
 * Convention : les Sets/Maps de branche sont clonés. Les globaux (budget,
 * cache) restent référencés par valeur.
 */
export function enrichirEtat(
  etat: EtatCascade,
  agent: { id: string },
  besoin: Besoin
): EtatCascade {
  const cur = etat.affectationsCourantes.get(agent.id) ?? [];
  const affectationsCourantes = new Map(etat.affectationsCourantes);
  affectationsCourantes.set(agent.id, [...cur, besoin.jsCible]);

  const jsLibereesDansBranche = new Set(etat.jsLibereesDansBranche);
  if (besoin.jsCible.planningLigneId) {
    jsLibereesDansBranche.add(besoin.jsCible.planningLigneId);
  }

  return {
    agentsMap: etat.agentsMap,
    index: etat.index,
    rules: etat.rules,
    lpaContext: etat.lpaContext,
    npoExclusionCodes: etat.npoExclusionCodes,
    remplacement: etat.remplacement,
    deplacement: etat.deplacement,
    importId: etat.importId,
    profondeurMax: etat.profondeurMax,

    affectationsCourantes,
    jsLibereesDansBranche,
    agentsEngagesBranche: new Set([...etat.agentsEngagesBranche, agent.id]),
    besoinsEnCoursBranche: new Set([...etat.besoinsEnCoursBranche, besoin.id]),

    budget: etat.budget,
    cache: etat.cache,
  };
}

// ─── Planning effectif ───────────────────────────────────────────────────────

/**
 * Calcule le planning effectif d'un agent dans l'état courant :
 *   events_d'origine
 *   - événements dont planningLigneId ∈ jsLibereesDansBranche
 *   + JS injectées depuis affectationsCourantes[agent.id]
 *
 * Permet à evaluerMobilisabilite de raisonner sur le planning "tel qu'il
 * sera après application de la branche en cours".
 */
export function planningEffectif(
  agent: AgentDataMultiJs,
  etat: EtatCascade
): PlanningEvent[] {
  // 1. Filtrer les events libérés
  const eventsRestants = agent.events.filter(
    (e) => !e.planningLigneId || !etat.jsLibereesDansBranche.has(e.planningLigneId)
  );

  // 2. Injecter les JS de la branche courante
  const jsInjecter = etat.affectationsCourantes.get(agent.context.id) ?? [];
  if (jsInjecter.length === 0) return eventsRestants;

  const eventsAjoutes: PlanningEvent[] = jsInjecter.map((js) => {
    const imprevu = buildImprevu(js, etat.remplacement, etat.deplacement);
    const debut = combineDateTime(js.date, imprevu.heureDebutReel);
    let fin = combineDateTime(js.date, imprevu.heureFinEstimee);
    if (fin.getTime() <= debut.getTime()) {
      fin = new Date(fin.getTime() + 24 * 3600_000);
    }
    return {
      dateDebut: debut,
      dateFin: fin,
      heureDebut: imprevu.heureDebutReel,
      heureFin: imprevu.heureFinEstimee,
      amplitudeMin: js.amplitudeMin,
      dureeEffectiveMin: null,
      jsNpo: "JS" as const,
      codeJs: js.codeJs,
      typeJs: js.typeJs,
      planningLigneId: js.planningLigneId ?? undefined,
      heureDebutJsType: js.heureDebutJsType,
      heureFinJsType: js.heureFinJsType,
    };
  });

  // 3. Tri chronologique (evaluerMobilisabilite l'attend)
  return [...eventsRestants, ...eventsAjoutes].sort(
    (a, b) => a.dateDebut.getTime() - b.dateDebut.getTime()
  );
}

// ─── Hash d'état (pour le cache) ─────────────────────────────────────────────

/**
 * Hash léger des champs de branche qui altèrent l'évaluation d'un agent sur
 * un besoin. Utilisé comme clé de cache (agentId, besoinId, hashEtat) →
 * ImpactEvaluation.
 *
 * NOTE : ne dépend QUE de jsLibereesDansBranche et des JS injectées POUR
 * L'AGENT considéré — une affectation sur un autre agent ne change pas son
 * planning. Mais pour rester safe, on inclut tout l'état de branche.
 */
export function hashEtat(etat: EtatCascade, agentId: string): string {
  const liberees = [...etat.jsLibereesDansBranche].sort().join(",");
  const injecter = (etat.affectationsCourantes.get(agentId) ?? [])
    .map((js) => js.planningLigneId ?? `${js.date}_${js.heureDebut}`)
    .sort()
    .join(",");
  return `lib:${liberees}|inj:${injecter}`;
}

export function cacheKey(agentId: string, besoinId: string, etat: EtatCascade): string {
  return `${agentId}|${besoinId}|${hashEtat(etat, agentId)}`;
}

// ─── Aplatissement DFS post-ordre ────────────────────────────────────────────

/**
 * Aplatit un arbre de Resolution en ordre DFS post-ordre : feuilles d'abord,
 * racine en dernier. C'est l'ordre d'application sur le planning si on
 * retient cette solution (libérer les sous-niveaux avant d'affecter le N1).
 */
export function aplatirResolution(racine: Resolution): Resolution[] {
  const out: Resolution[] = [];
  const stack: { resolution: Resolution; childrenDone: boolean }[] = [
    { resolution: racine, childrenDone: false },
  ];
  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    if (!top.childrenDone) {
      top.childrenDone = true;
      // Empile les enfants en sens inverse pour un parcours gauche-à-droite
      for (let i = top.resolution.sousResolutions.length - 1; i >= 0; i--) {
        stack.push({ resolution: top.resolution.sousResolutions[i], childrenDone: false });
      }
    } else {
      stack.pop();
      out.push(top.resolution);
    }
  }
  return out;
}

/**
 * Calcule la profondeur maximale d'un arbre de résolutions (1 = feuille seule).
 */
export function profondeurMaxResolution(racine: Resolution): number {
  if (racine.sousResolutions.length === 0) return 1;
  return 1 + Math.max(...racine.sousResolutions.map(profondeurMaxResolution));
}
