/**
 * Étape 1 — Identification des candidats potentiels
 * Filtre les agents pouvant physiquement être mobilisés pour la JS cible.
 */

import { combineDateTime, diffMinutes, timeToMinutes, getDateFinJs } from "@/lib/utils";
import type { AgentContext, PlanningEvent } from "@/engine/rules";
import type { JsCible, ImpreuvuConfig, FlexibiliteJs, JsSourceFigee } from "@/types/js-simulation";
import type { EffectiveServiceInfo } from "@/types/deplacement";
import { isZeroLoadJs, isAbsenceInaptitude } from "./jsUtils";
import { isJourTravailleGPT } from "@/lib/gptUtils";

// ─── Constante de raison d'exclusion ─────────────────────────────────────────
// Utilisée à la fois dans preFilterCandidats et trouverCandidatsParFigeage
// pour éviter le matching par chaîne littérale.
export const RAISON_DEJA_EN_SERVICE = "Déjà en service pendant l'imprévu";

export interface AgentWithPlanning {
  context: AgentContext;
  events: PlanningEvent[];
}

/**
 * Critères d'élimination immédiate (avant simulation fine)
 *
 * effectiveServiceMap (optionnel) : résultats pré-calculés de computeEffectiveService
 * par agentId. Si fourni, le filtre déplacement utilise la logique LPA-based.
 * Sinon, fallback sur imprevu.deplacement (ancien comportement).
 */
export function preFilterCandidats(
  agents: AgentWithPlanning[],
  jsCible: JsCible,
  imprevu: ImpreuvuConfig,
  agentInitialId: string,
  effectiveServiceMap?: Map<string, EffectiveServiceInfo>,
  npoExclusionCodes: string[] = [],
  zeroLoadPrefixes: readonly string[] = []
): { eligible: AgentWithPlanning[]; exclus: { agent: AgentWithPlanning; raison: string }[] } {
  const eligible: AgentWithPlanning[] = [];
  const exclus: { agent: AgentWithPlanning; raison: string }[] = [];

  const debutImprevu = combineDateTime(jsCible.date, imprevu.heureDebutReel);
  const finImprevu = combineDateTime(getDateFinJs(jsCible.date, imprevu.heureDebutReel, imprevu.heureFinEstimee), imprevu.heureFinEstimee);

  for (const a of agents) {
    // Exclure l'agent initial
    if (a.context.id === agentInitialId) continue;

    // Exclure immédiatement si aucun préfixe JS renseigné
    if (a.context.prefixesJs.length === 0) {
      exclus.push({ agent: a, raison: "Aucun préfixe JS autorisé renseigné" });
      continue;
    }

    // Vérifier préfixe JS autorisé
    if (jsCible.codeJs) {
      const autorise = a.context.prefixesJs.some((p) =>
        jsCible.codeJs!.toUpperCase().startsWith(p.toUpperCase())
      );
      if (!autorise) {
        exclus.push({
          agent: a,
          raison: `Code JS "${jsCible.codeJs}" non couvert — préfixes autorisés : ${a.context.prefixesJs.join(", ")}`,
        });
        continue;
      }
    }

    // Vérifier habilitation nuit
    if (jsCible.isNuit && !a.context.peutFaireNuit) {
      exclus.push({ agent: a, raison: "Non habilité poste de nuit" });
      continue;
    }

    // Vérifier habilitation déplacement
    // Système LPA : une JS hors LPA est autorisée — le trajet est ajouté à l'amplitude
    // et l'évaluation fine (evaluerMobilisabilite) vérifiera l'amplitude résultante.
    // On ne bloque ici que le cas du déplacement MANUEL (fallback) non autorisé.
    if (effectiveServiceMap) {
      const effSvc = effectiveServiceMap.get(a.context.id);
      const lpaCompute = effSvc && effSvc.estEnDeplacement !== null;
      if (!lpaCompute) {
        // Pas de contexte LPA déterminable → fallback booléen
        if (imprevu.deplacement && !a.context.peutEtreDeplace) {
          exclus.push({ agent: a, raison: "Non autorisé déplacement (mode manuel)" });
          continue;
        }
      }
      // Si LPA a calculé le déplacement : pas de blocage ici, l'amplitude jugera
    } else {
      // Aucune effectiveServiceMap → ancien système (fallback)
      if (imprevu.deplacement && !a.context.peutEtreDeplace) {
        exclus.push({ agent: a, raison: "Non autorisé déplacement" });
        continue;
      }
    }

    // Vérifier absence pour inaptitude (codes configurés par l'admin)
    const absenceInaptitude = a.events.find(
      (e) => isAbsenceInaptitude(e, npoExclusionCodes) && e.dateDebut < finImprevu && e.dateFin > debutImprevu
    );
    if (absenceInaptitude) {
      exclus.push({
        agent: a,
        raison: `Absent pour inaptitude (${absenceInaptitude.codeJs ?? absenceInaptitude.typeJs ?? "NPO"})`,
      });
      continue;
    }

    // Vérifier que l'agent n'a pas déjà une JS non-Z pendant l'imprévu
    // (les JS de type Z = sans charge réelle sont autorisées à être réaffectées)
    const conflit = a.events.find((e) => {
      if (e.jsNpo !== "JS") return false;
      if (isZeroLoadJs(e.codeJs, e.typeJs, zeroLoadPrefixes)) return false; // JS Z : ne bloque pas la mobilisation
      const overlap = e.dateDebut < finImprevu && e.dateFin > debutImprevu;
      return overlap;
    });

    if (conflit) {
      exclus.push({ agent: a, raison: RAISON_DEJA_EN_SERVICE });
      continue;
    }

    eligible.push(a);
  }

  return { eligible, exclus };
}

// ─── Figeage ──────────────────────────────────────────────────────────────────

/**
 * Résout la FlexibiliteJs d'un événement en cherchant dans la map JsType.
 * Logique : match exact sur typeJs, puis match par préfixe sur codeJs.
 * Retourne 'OBLIGATOIRE' par défaut (comportement sécurisé).
 */
export function resolveFlexibiliteEvent(
  event: PlanningEvent,
  jsTypeFlexibiliteMap: Map<string, FlexibiliteJs>
): FlexibiliteJs {
  if (event.typeJs) {
    const f = jsTypeFlexibiliteMap.get(event.typeJs);
    if (f !== undefined) return f;
  }
  if (event.codeJs) {
    const prefix = event.codeJs.trim().split(" ")[0] ?? "";
    for (const [code, flex] of jsTypeFlexibiliteMap) {
      if (
        prefix.toUpperCase().startsWith(code.toUpperCase()) ||
        code.toUpperCase() === prefix.toUpperCase()
      ) {
        return flex;
      }
    }
  }
  return "OBLIGATOIRE";
}

/**
 * Candidat proposé par figeage de sa JS source DERNIER_RECOURS.
 */
export interface CandidatFigeage {
  agent: AgentWithPlanning;
  /** Informations sur la JS figée pour audit et affichage. */
  jsSourceFigee: JsSourceFigee;
  /** Planning de l'agent sans la JS figée — utilisé pour evaluerMobilisabilite. */
  eventsAvecFigeage: PlanningEvent[];
}

/**
 * Identifie les agents exclus pour "Déjà en service" dont la JS source est
 * DERNIER_RECOURS, et les retourne comme candidats libérables par figeage.
 *
 * Invariants :
 * - Une JS OBLIGATOIRE ne peut jamais être figée.
 * - Le figeage est indépendant du déplacement.
 * - Le score candidat n'est pas affecté par le figeage.
 */
export function trouverCandidatsParFigeage(
  exclus: { agent: AgentWithPlanning; raison: string }[],
  jsCible: JsCible,
  imprevu: ImpreuvuConfig,
  jsTypeFlexibiliteMap: Map<string, FlexibiliteJs>,
  zeroLoadPrefixes: readonly string[] = []
): CandidatFigeage[] {
  const debutImprevu = combineDateTime(jsCible.date, imprevu.heureDebutReel);
  const finImprevu   = combineDateTime(getDateFinJs(jsCible.date, imprevu.heureDebutReel, imprevu.heureFinEstimee), imprevu.heureFinEstimee);

  const result: CandidatFigeage[] = [];

  for (const { agent, raison } of exclus) {
    // Seuls les agents exclus pour "déjà en service" sont candidats au figeage
    if (raison !== RAISON_DEJA_EN_SERVICE) continue;

    // Trouver la JS conflictuelle (non-Z, chevauchant l'imprévu)
    const jsConflictuelle = agent.events.find((e) => {
      if (e.jsNpo !== "JS") return false;
      if (isZeroLoadJs(e.codeJs, e.typeJs, zeroLoadPrefixes)) return false;
      return e.dateDebut < finImprevu && e.dateFin > debutImprevu;
    });

    if (!jsConflictuelle) continue;

    // Vérifier la flexibilité — OBLIGATOIRE interdit le figeage
    const flexibilite = resolveFlexibiliteEvent(jsConflictuelle, jsTypeFlexibiliteMap);
    if (flexibilite !== "DERNIER_RECOURS") continue;

    const jsSourceFigee: JsSourceFigee = {
      planningLigneId: jsConflictuelle.planningLigneId ?? "",
      codeJs:          jsConflictuelle.codeJs,
      flexibilite:     "DERNIER_RECOURS",
      agentId:         agent.context.id,
      justification:   `JS ${jsConflictuelle.codeJs ?? "source"} (DERNIER_RECOURS) figée — ${agent.context.nom} ${agent.context.prenom} libéré vers ${jsCible.codeJs ?? "JS cible"} le ${jsCible.date}`,
    };

    // Planning sans la JS figée : l'agent est traité comme libre
    const eventsAvecFigeage = agent.events.filter((e) => e !== jsConflictuelle);

    result.push({ agent, jsSourceFigee, eventsAvecFigeage });
  }

  return result;
}

/**
 * Calcule la liste des événements d'un agent incluant fictivement la JS cible.
 *
 * Correctif GPT : la JS simulée REMPLACE toute journée existante sur le même
 * créneau horaire (overlap), pas uniquement la JS Z déjà filtrée en amont.
 * Cela garantit qu'aucun doublon n'est injecté dans le planning simulé et que
 * le calcul GPT via computeWorkSequences reste cohérent.
 */
export function injecterJsDansPlanning(
  events: PlanningEvent[],
  jsCible: JsCible,
  imprevu: ImpreuvuConfig
): PlanningEvent[] {
  const dateDebut = combineDateTime(jsCible.date, imprevu.heureDebutReel);
  const dateFin = combineDateTime(getDateFinJs(jsCible.date, imprevu.heureDebutReel, imprevu.heureFinEstimee), imprevu.heureFinEstimee);
  const amplitudeMin = Math.max(0, diffMinutes(dateDebut, dateFin));

  const jsInjectee: PlanningEvent = {
    dateDebut,
    dateFin,
    heureDebut: imprevu.heureDebutReel,
    heureFin: imprevu.heureFinEstimee,
    amplitudeMin,
    dureeEffectiveMin: amplitudeMin,
    jsNpo: "JS",
    codeJs: jsCible.codeJs,
    typeJs: jsCible.typeJs,
  };

  // Supprimer tout événement TRAVAILLÉ (JS ou NPO C) qui chevauche la nouvelle JS.
  // Correction GPT : un NPO C remplacé par une JS doit être retiré du planning simulé
  // pour éviter un doublon qui fausserait le calcul de la longueur de GPT.
  // isJourTravailleGPT couvre JS (jsNpo="JS") et congé-repos C (jsNpo="NPO", codeJs="C").
  const eventsFiltrés = events.filter((e) => {
    if (!isJourTravailleGPT(e)) return true; // Conserver RP, absences, etc.
    const overlap = e.dateDebut < dateFin && e.dateFin > dateDebut;
    return !overlap;
  });

  return [...eventsFiltrés, jsInjectee].sort(
    (a, b) => a.dateDebut.getTime() - b.dateDebut.getTime()
  );
}
