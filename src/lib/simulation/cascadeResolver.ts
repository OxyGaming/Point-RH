/**
 * Étape 4 — Résolution en cascade récursive
 *
 * Quand un agent est bloqué par un conflit de repos, le système cherche
 * récursivement un agent tiers pour libérer l'événement causant le blocage,
 * jusqu'à CASCADE_MAX_DEPTH niveaux de profondeur.
 *
 * Exemple à 3 niveaux :
 *   JS imprévue → Agent A (repos insuffisant à cause de JS_B)
 *     Niveau 1 : Agent B prend JS_B → mais B bloqué par JS_C
 *     Niveau 2 : Agent C prend JS_C → mais C bloqué par JS_D
 *     Niveau 3 : Agent D prend JS_D → libre → résolu ✓
 */

import { combineDateTime, isJsDeNuit } from "@/lib/utils";
import { evaluerMobilisabilite } from "@/engine/rules";
import type { AgentContext, PlanningEvent } from "@/engine/rules";
import type { ImpactCascade, ModificationPlanning, ConflitInduit } from "@/types/js-simulation";
import type { SimulationInput } from "@/types/simulation";
import { isAbsenceInaptitude } from "./jsUtils";
import { computeEffectiveService } from "@/lib/deplacement/computeEffectiveService";
import type { LpaContext } from "@/types/deplacement";
import { DEFAULT_WORK_RULES_MINUTES, type WorkRulesMinutes } from "@/lib/rules/workRules";

/**
 * Profondeur maximale de cascade.
 *
 * Réduite à 3 (ancien : 10) : au-delà, l'exploration combinatoire dégénère —
 * avec ~230 agents, depth=10 peut déclencher des dizaines de milliers d'appels
 * à evaluerMobilisabilite et bloquer l'event loop Node ≫ 60s (timeout nginx).
 *
 * Métier : une chaîne de 3 remplacements (A← B← C← D) reste gérable
 * humainement ; au-delà personne ne la valide en pratique. Le gain perf
 * l'emporte sur la perte de scénarios exotiques.
 */
export const CASCADE_MAX_DEPTH = Number(process.env.CASCADE_MAX_DEPTH ?? 3);

/**
 * Budget global d'appels à evaluerMobilisabilite par construction de scénarios.
 *
 * Sert de garde-fou absolu : si la cascade consomme ce budget (combinatoire
 * pathologique), on l'interrompt proprement au lieu de laisser l'event loop
 * tourner dans le vide. Un log `CASCADE_BUDGET_EXHAUSTED` permet de repérer
 * ces cas en prod pour investigation ciblée.
 */
export const CASCADE_EVAL_BUDGET = Number(process.env.CASCADE_EVAL_BUDGET ?? 5000);

/** État mutable partagé entre appels récursifs pour comptabiliser le budget. */
export interface CascadeBudget {
  evaluationsRestantes: number;
  epuise: boolean;
}

export function createCascadeBudget(): CascadeBudget {
  return { evaluationsRestantes: CASCADE_EVAL_BUDGET, epuise: false };
}

export interface ResolutionResultat {
  resolu: boolean;
  agentRemplagant: AgentContext | null;
  /** Chaîne complète de modifications (niveau courant + niveaux inférieurs) */
  modifications: ModificationPlanning[];
  impactsCascade: ImpactCascade[];
  /** Profondeur effective de la résolution (1 = direct, 2+ = cascade) */
  profondeur: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildEffectiveService(
  agent: AgentContext,
  event: PlanningEvent,
  lpaContext: LpaContext | undefined,
  rules: WorkRulesMinutes
) {
  // Toujours partir des horaires standard du JsType (pas des horaires personnels
  // de l'agent initial qui incluent ses déplacements propres).
  const heureDebutBase = event.heureDebutJsType ?? event.heureDebut;
  const heureFinBase   = event.heureFinJsType   ?? event.heureFin;

  const jsEstNuit = isJsDeNuit(heureDebutBase, heureFinBase, {
    debutSoirMin: rules.periodeNocturne.debutSoir,
    finMatinMin:  rules.periodeNocturne.finMatin,
    seuilMin:     rules.periodeNocturne.seuilJsNuit,
  });

  const effectiveService = lpaContext
    ? computeEffectiveService(
        { id: agent.id, lpaBaseId: agent.lpaBaseId, peutEtreDeplace: agent.peutEtreDeplace },
        { codeJs: event.codeJs, typeJs: event.typeJs,
          heureDebut: heureDebutBase, heureFin: heureFinBase, estNuit: jsEstNuit },
        lpaContext,
        { remplacement: true }
      )
    : null;

  const heureDebutSim = effectiveService?.heureDebutEffective ?? heureDebutBase;
  const heureFinSim   = effectiveService?.heureFinEffective   ?? heureFinBase;
  const deplacement   = effectiveService?.estEnDeplacement    ?? false;
  const jsEstNuitFinal = jsEstNuit;

  const simulationInput: SimulationInput = {
    importId:    "",
    dateDebut:   event.dateDebut.toISOString().slice(0, 10),
    dateFin:     event.dateFin.toISOString().slice(0, 10),
    heureDebut:  heureDebutSim,
    heureFin:    heureFinSim,
    poste:       event.codeJs ?? "JS",
    codeJs:      event.codeJs,
    remplacement: true,
    deplacement,
    posteNuit:   jsEstNuitFinal,
  };

  return { simulationInput, effectiveService, deplacement };
}

/**
 * Trouve dans le planning d'un agent l'événement qui cause le blocage repos,
 * identifié par la date + heure de début du dernier poste.
 */
function trouverEvenementCausant(
  events: PlanningEvent[],
  dernierPosteDate: string | null,
  dernierPosteDebut: string | null
): PlanningEvent | null {
  if (!dernierPosteDate || !dernierPosteDebut) return null;
  return events.find(
    (e) =>
      e.jsNpo === "JS" &&
      e.dateDebut.toISOString().slice(0, 10) === dernierPosteDate &&
      e.heureDebut === dernierPosteDebut
  ) ?? null;
}

// ─── Résolution récursive ─────────────────────────────────────────────────────

/**
 * Tente de résoudre un conflit de type REPOS_INSUFFISANT en trouvant un agent
 * libre pour reprendre l'événement conflictuel.
 *
 * Si l'agent candidat est lui-même bloqué par un conflit de repos, la fonction
 * s'appelle récursivement (depth+1) jusqu'à CASCADE_MAX_DEPTH.
 *
 * @param agentsEngages - Agents déjà engagés dans la chaîne (anti-cycle)
 */
export function tenterResolutionCascade(
  conflit: ConflitInduit,
  conflictingEvent: PlanningEvent | null,
  autresAgents: { context: AgentContext; events: PlanningEvent[] }[],
  depth: number = 1,
  npoExclusionCodes: string[] = [],
  lpaContext?: LpaContext,
  rules: WorkRulesMinutes = DEFAULT_WORK_RULES_MINUTES,
  agentsEngages: Set<string> = new Set(),
  budget: CascadeBudget = createCascadeBudget()
): ResolutionResultat {
  const echec: ResolutionResultat = {
    resolu: false, agentRemplagant: null, modifications: [], impactsCascade: [], profondeur: depth,
  };

  if (depth > CASCADE_MAX_DEPTH || !conflictingEvent) return echec;
  if (budget.epuise) return echec;

  const jsDebut = conflictingEvent.dateDebut;
  const jsFin   = conflictingEvent.dateFin;

  // Pré-calculs partagés pour le filtre d'habilitation (sortis de la boucle)
  const conflictCode = conflictingEvent.codeJs ?? null;
  const conflictHdBase = conflictingEvent.heureDebutJsType ?? conflictingEvent.heureDebut;
  const conflictHfBase = conflictingEvent.heureFinJsType   ?? conflictingEvent.heureFin;
  const conflictEstNuit = isJsDeNuit(conflictHdBase, conflictHfBase, {
    debutSoirMin: rules.periodeNocturne.debutSoir,
    finMatinMin:  rules.periodeNocturne.finMatin,
    seuilMin:     rules.periodeNocturne.seuilJsNuit,
  });

  for (const autre of autresAgents) {
    // Anti-cycle : ne pas réutiliser un agent déjà dans la chaîne
    if (agentsEngages.has(autre.context.id)) continue;

    // Habilitation : préfixe JS autorisé pour ce code (même filtre que preFilterCandidats).
    // Évite des milliers d'evaluerMobilisabilite pour des agents de toute façon non éligibles.
    if (autre.context.prefixesJs.length === 0) continue;
    if (conflictCode) {
      const codeUp = conflictCode.toUpperCase();
      const autorise = autre.context.prefixesJs.some((p) => codeUp.startsWith(p.toUpperCase()));
      if (!autorise) continue;
    }

    // Habilitation nuit
    if (conflictEstNuit && !autre.context.peutFaireNuit) continue;

    // Déjà en service sur ce créneau
    const dejaPris = autre.events.some(
      (e) => e.jsNpo === "JS" && e.dateDebut < jsFin && e.dateFin > jsDebut
    );
    if (dejaPris) continue;

    // En inaptitude sur ce créneau
    const enInaptitude = autre.events.some(
      (e) => isAbsenceInaptitude(e, npoExclusionCodes) && e.dateDebut < jsFin && e.dateFin > jsDebut
    );
    if (enInaptitude) continue;

    const { simulationInput, effectiveService, deplacement } =
      buildEffectiveService(autre.context, conflictingEvent, lpaContext, rules);

    // Horaires de référence JsType (indépendants des trajets de l'agent initial)
    const jsTypeDebut = conflictingEvent.heureDebutJsType ?? conflictingEvent.heureDebut;
    const jsTypeFin   = conflictingEvent.heureFinJsType   ?? conflictingEvent.heureFin;

    // Garde-fou combinatoire : décompter puis vérifier le budget global
    if (--budget.evaluationsRestantes < 0) {
      budget.epuise = true;
      console.warn("[cascade] CASCADE_BUDGET_EXHAUSTED", {
        depth,
        conflictDate: jsDebut.toISOString().slice(0, 10),
      });
      return echec;
    }

    const resultat = evaluerMobilisabilite(
      autre.context, autre.events, simulationInput, rules, effectiveService ?? undefined
    );

    // ── Résolution directe ────────────────────────────────────────────────
    if (resultat.statut === "CONFORME" || resultat.statut === "VIGILANCE") {
      const impacts: ImpactCascade[] = [];
      if (resultat.statut === "VIGILANCE") {
        impacts.push({
          agentId:     autre.context.id,
          agentNom:    autre.context.nom,
          agentPrenom: autre.context.prenom,
          description: resultat.motifPrincipal,
          regle:       resultat.detail.violations[0]?.regle ?? "VIGILANCE",
          severity:    "AVERTISSEMENT",
          date:        jsDebut.toISOString().slice(0, 10),
        });
      }
      const niveauLabel = depth > 1 ? ` (cascade niv. ${depth})` : "";
      return {
        resolu: true,
        agentRemplagant: autre.context,
        modifications: [{
          agentId:     autre.context.id,
          agentNom:    autre.context.nom,
          agentPrenom: autre.context.prenom,
          action:      "ECHANGER_JS",
          description: `${autre.context.nom} ${autre.context.prenom} reprend la JS ${jsDebut.toISOString().slice(0, 10)} ${jsTypeDebut}–${jsTypeFin}${deplacement ? " (déplacement LPA)" : ""}${niveauLabel}`,
          violations:  resultat.detail.violations,
          conforme:    resultat.statut === "CONFORME",
          motif:       resultat.statut !== "CONFORME" ? resultat.motifPrincipal : null,
          detail:      resultat.detail,
          heureDebutEffective: simulationInput.heureDebut,
          heureFinEffective:   simulationInput.heureFin,
          jsReprise: {
            date:      jsDebut.toISOString().slice(0, 10),
            heureDebut: jsTypeDebut,
            heureFin:   jsTypeFin,
            codeJs:     conflictingEvent.codeJs,
          },
        }],
        impactsCascade: impacts,
        profondeur: depth,
      };
    }

    // ── Tentative de cascade profonde si repos insuffisant ────────────────
    if (
      resultat.statut === "NON_CONFORME" &&
      depth < CASCADE_MAX_DEPTH
    ) {
      const violationRepos = resultat.detail.violations.find(
        (v) => v.regle === "REPOS_JOURNALIER"
      );
      if (!violationRepos) continue;

      // Trouver l'événement dans le planning de cet agent qui cause le blocage
      const eventCausant = trouverEvenementCausant(
        autre.events,
        resultat.detail.dernierPosteDate ?? null,
        resultat.detail.dernierPosteDebut ?? null
      );
      if (!eventCausant) continue;

      // Construire un conflit synthétique pour cet événement
      const conflitSub: ConflitInduit = {
        planningLigneId: null,
        date:       eventCausant.dateDebut.toISOString().slice(0, 10),
        heureDebut: eventCausant.heureDebut,
        heureFin:   eventCausant.heureFin,
        type:       "REPOS_INSUFFISANT",
        description: `Repos insuffisant — ${autre.context.nom} ${autre.context.prenom} bloqué par ${eventCausant.heureDebut}–${eventCausant.heureFin}`,
        regleCode:  "REPOS_JOURNALIER",
        resolvable: true,
      };

      const newEngages = new Set([...agentsEngages, autre.context.id]);
      const autresSansLui = autresAgents.filter((a) => a.context.id !== autre.context.id);

      const subResult = tenterResolutionCascade(
        conflitSub,
        eventCausant,
        autresSansLui,
        depth + 1,
        npoExclusionCodes,
        lpaContext,
        rules,
        newEngages,
        budget
      );

      if (!subResult.resolu) continue;
      if (budget.epuise) return echec;

      // Le sous-problème est résolu → réévaluer cet agent sans l'événement causant
      if (--budget.evaluationsRestantes < 0) {
        budget.epuise = true;
        console.warn("[cascade] CASCADE_BUDGET_EXHAUSTED", {
          depth,
          conflictDate: jsDebut.toISOString().slice(0, 10),
          phase: "reevaluation-liberee",
        });
        return echec;
      }

      const eventsLiberes = autre.events.filter((e) => e !== eventCausant);
      const resultatLibere = evaluerMobilisabilite(
        autre.context, eventsLiberes, simulationInput, rules, effectiveService ?? undefined
      );

      if (resultatLibere.statut === "CONFORME" || resultatLibere.statut === "VIGILANCE") {
        const impacts: ImpactCascade[] = [...subResult.impactsCascade];
        if (resultatLibere.statut === "VIGILANCE") {
          impacts.push({
            agentId:     autre.context.id,
            agentNom:    autre.context.nom,
            agentPrenom: autre.context.prenom,
            description: resultatLibere.motifPrincipal,
            regle:       resultatLibere.detail.violations[0]?.regle ?? "VIGILANCE",
            severity:    "AVERTISSEMENT",
            date:        jsDebut.toISOString().slice(0, 10),
          });
        }

        const modCourant: ModificationPlanning = {
          agentId:     autre.context.id,
          agentNom:    autre.context.nom,
          agentPrenom: autre.context.prenom,
          action:      "ECHANGER_JS",
          description: `${autre.context.nom} ${autre.context.prenom} reprend la JS ${jsDebut.toISOString().slice(0, 10)} ${jsTypeDebut}–${jsTypeFin} après libération cascade niv. ${depth}`,
          violations:  resultatLibere.detail.violations,
          conforme:    resultatLibere.statut === "CONFORME",
          motif:       resultatLibere.statut !== "CONFORME" ? resultatLibere.motifPrincipal : null,
          detail:      resultatLibere.detail,
          heureDebutEffective: simulationInput.heureDebut,
          heureFinEffective:   simulationInput.heureFin,
          jsReprise: {
            date:      jsDebut.toISOString().slice(0, 10),
            heureDebut: jsTypeDebut,
            heureFin:   jsTypeFin,
            codeJs:     conflictingEvent.codeJs,
          },
        };

        return {
          resolu: true,
          agentRemplagant: autre.context,
          // Modifications : d'abord les sous-niveaux, puis le niveau courant
          modifications: [...subResult.modifications, modCourant],
          impactsCascade: impacts,
          profondeur: subResult.profondeur,
        };
      }
    }
  }

  return echec;
}

/**
 * Résout tous les conflits résolvables en cascade pour un candidat.
 */
export function resoudreTousConflits(
  conflitsResolvables: ConflitInduit[],
  eventsApresJs: PlanningEvent[],
  autresAgents: { context: AgentContext; events: PlanningEvent[] }[],
  npoExclusionCodes: string[] = [],
  lpaContext?: LpaContext,
  rules: WorkRulesMinutes = DEFAULT_WORK_RULES_MINUTES
): { modifications: ModificationPlanning[]; impactsCascade: ImpactCascade[]; nbResolu: number; profondeurMax: number } {
  const modifications: ModificationPlanning[] = [];
  const impactsCascade: ImpactCascade[] = [];
  let nbResolu = 0;
  let profondeurMax = 0;

  // Agents déjà engagés globalement dans ce passage (anti-cycle inter-conflits)
  const agentsEngagesGlobal = new Set<string>();

  // Budget partagé entre tous les conflits de ce candidat : si la résolution
  // du 1er conflit a déjà consommé des milliers d'évaluations, le 2e ne relance
  // pas une explosion en cascade.
  const budget = createCascadeBudget();

  for (const conflit of conflitsResolvables) {
    if (!conflit.resolvable) continue;
    if (budget.epuise) break;

    const evConflictuel = eventsApresJs.find((e) => {
      const dateStr = e.dateDebut.toISOString().slice(0, 10);
      return (
        dateStr === conflit.date &&
        e.jsNpo === "JS" &&
        (conflit.heureDebut ? e.heureDebut === conflit.heureDebut : true)
      );
    }) ?? null;

    const res = tenterResolutionCascade(
      conflit,
      evConflictuel,
      autresAgents,
      1,
      npoExclusionCodes,
      lpaContext,
      rules,
      new Set(agentsEngagesGlobal),
      budget
    );

    if (res.resolu) {
      modifications.push(...res.modifications);
      impactsCascade.push(...res.impactsCascade);
      for (const mod of res.modifications) agentsEngagesGlobal.add(mod.agentId);
      if (res.profondeur > profondeurMax) profondeurMax = res.profondeur;
      nbResolu++;
    } else {
      impactsCascade.push({
        agentId:     "",
        agentNom:    "—",
        agentPrenom: "",
        description: `Conflit non résolu : ${conflit.description}`,
        regle:       conflit.regleCode,
        severity:    "BLOQUANT",
        date:        conflit.date,
      });
    }
  }

  return { modifications, impactsCascade, nbResolu, profondeurMax };
}
