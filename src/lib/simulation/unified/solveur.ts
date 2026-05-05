/**
 * Solveur unifié — moteur récursif principal.
 *
 * `resoudreBesoin` : trouve une résolution complète pour un besoin donné dans
 * un état donné (DFS bornée par budget, profondeur et anti-cycles).
 *
 * `enumererSolutions` : trouve jusqu'à N solutions complètes distinctes (N1
 * différent à chaque itération) pour un besoin racine — utilisé par l'UI
 * pour exposer plusieurs alternatives.
 *
 * Le solveur ne mute pas l'état du caller : chaque tentative travaille sur
 * un clone via `enrichirEtat`. Seuls le budget et le cache sont partagés.
 */

import { findEligibleAgentsForJs } from "@/lib/simulation/multiJs/chaineCache";
import { evaluerImpactComplet } from "./evaluation";
import {
  enrichirEtat,
  aplatirResolution,
  profondeurMaxResolution,
  planningEffectif,
} from "./etat";
import type {
  Besoin,
  BesoinOrigine,
  Consequence,
  EtatCascade,
  Resolution,
  ResolutionResult,
  ResolutionOptions,
  Solution,
  ConsequenceType,
} from "./types";
import { besoinIdFromJs, SOLVER_DEFAULTS } from "./types";
import type { JsCible } from "@/types/js-simulation";

// ─── Helpers internes ────────────────────────────────────────────────────────

/**
 * Construit le Besoin dérivé d'une consequence : la JS impactée devient un
 * nouveau besoin de niveau N+1, avec origine LIBERATION traçant le parent.
 */
function besoinDerive(
  consequence: Consequence,
  parent: Besoin,
  agentLibere: string
): Besoin {
  const origine: BesoinOrigine = {
    type: "LIBERATION",
    parentBesoinId: parent.id,
    agentLibere,
    consequenceType: consequence.type,
  };
  return {
    id: besoinIdFromJs(consequence.jsImpactee),
    jsCible: consequence.jsImpactee,
    origine,
    niveau: parent.niveau + 1,
  };
}

/**
 * Tri des candidats : par défaut réservistes d'abord (ils sont là pour ça),
 * puis ordre stable par agentId.
 */
function trierCandidats(
  candidats: string[],
  etat: EtatCascade,
  tri: "STANDARD" | "RESERVE_PRIO"
): string[] {
  const out = [...candidats];
  if (tri === "RESERVE_PRIO") {
    out.sort((a, b) => {
      const ar = etat.agentsMap.get(a)?.context.agentReserve ? 1 : 0;
      const br = etat.agentsMap.get(b)?.context.agentReserve ? 1 : 0;
      if (br !== ar) return br - ar;
      return a.localeCompare(b);
    });
  } else {
    out.sort();
  }
  return out;
}

// ─── resoudreBesoin ──────────────────────────────────────────────────────────

/**
 * Tente de résoudre un Besoin : pour chaque candidat habilité, évalue
 * `evaluerImpactComplet`, puis si des conséquences sont émises, recurse.
 * Retourne la première résolution complète trouvée (mode PREMIER_TROUVE) ou
 * explore tous les candidats avant de retourner la meilleure (mode EXHAUSTIF
 * — réservé à enumererSolutions).
 */
export function resoudreBesoin(
  besoin: Besoin,
  etat: EtatCascade,
  options?: ResolutionOptions
): ResolutionResult {
  const opts = {
    maxCandidatsAuNiveau: options?.maxCandidatsAuNiveau ?? SOLVER_DEFAULTS.MAX_CANDIDATS_PAR_NIVEAU,
    tri: options?.tri ?? "RESERVE_PRIO",
    mode: options?.mode ?? "PREMIER_TROUVE",
  } as const;

  // ─── Garde-fous d'entrée ───────────────────────────────────────
  if (etat.budget.remaining <= 0) {
    return { ok: false, raison: "BUDGET" };
  }
  if (besoin.niveau > etat.profondeurMax) {
    return { ok: false, raison: "PROFONDEUR" };
  }
  if (etat.besoinsEnCoursBranche.has(besoin.id)) {
    return { ok: false, raison: "CYCLE", detail: `Besoin ${besoin.id} déjà en cours` };
  }

  // ─── Pré-filtre structurel ─────────────────────────────────────
  const eligibles = findEligibleAgentsForJs(
    etat.index,
    besoin.jsCible.codeJs,
    besoin.jsCible.isNuit,
    etat.deplacement
  );

  // Anti-cycle agent + cap horizontal
  const candidatsBruts: string[] = [];
  for (const id of eligibles) {
    if (etat.agentsEngagesBranche.has(id)) continue;
    candidatsBruts.push(id);
  }
  const candidats = trierCandidats(candidatsBruts, etat, opts.tri).slice(
    0,
    opts.maxCandidatsAuNiveau
  );

  if (candidats.length === 0) {
    return { ok: false, raison: "AUCUN_CANDIDAT", detail: `niveau ${besoin.niveau}` };
  }

  // ─── Boucle d'exploration ──────────────────────────────────────
  let derniereRaisonEchec: ResolutionResult & { ok: false } = {
    ok: false,
    raison: "AUCUN_CANDIDAT",
  };

  for (const candidatId of candidats) {
    if (etat.budget.remaining <= 0) {
      return { ok: false, raison: "BUDGET" };
    }

    const candidat = etat.agentsMap.get(candidatId);
    if (!candidat) continue;

    const eval_ = evaluerImpactComplet(candidat.context, besoin, etat);
    if (!eval_.faisable) {
      derniereRaisonEchec = {
        ok: false,
        raison: "INCOMPLET",
        detail: eval_.raisonRejet,
      };
      continue;
    }

    // Cas feuille : pas de conséquences → branche terminée.
    if (eval_.consequences.length === 0) {
      return {
        ok: true,
        resolution: {
          besoin,
          agent: candidat.context,
          statut: eval_.statut,
          detail: eval_.detail,
          consequences: [],
          sousResolutions: [],
        },
      };
    }

    // Cas récursif : résoudre chaque conséquence.
    // etatEnrichi est mutable localement — chaque sous-résolution réussie
    // ajoute ses agents/JS engagés à l'état pour que les besoins frères
    // suivants n'aient pas accès aux mêmes agents (anti-cycle inter-frères).
    const etatEnrichi = enrichirEtat(etat, candidat.context, besoin);
    const sousResolutions: Resolution[] = [];
    let toutesResolues = true;

    for (const conseq of eval_.consequences) {
      // Le besoin dérivé porte la JS impactée et a comme parent le besoin courant.
      // L'agent libéré est le candidat actuel (sa JS conseq.jsImpactee va passer
      // à un autre agent, ce qui le libère).
      const sousBesoin = besoinDerive(conseq, besoin, candidat.context.id);

      const sousResult = resoudreBesoin(sousBesoin, etatEnrichi, {
        maxCandidatsAuNiveau: opts.maxCandidatsAuNiveau,
        tri: opts.tri,
        mode: "PREMIER_TROUVE",  // récursion toujours en greedy
      });
      if (!sousResult.ok) {
        toutesResolues = false;
        derniereRaisonEchec = {
          ok: false,
          raison: "INCOMPLET",
          detail: `Sous-besoin ${sousBesoin.id}: ${sousResult.raison}${sousResult.detail ? ` (${sousResult.detail})` : ""}`,
        };
        break;
      }
      sousResolutions.push(sousResult.resolution);

      // Propage les agents/JS engagés dans cette sous-arborescence vers
      // l'état utilisé pour les besoins frères suivants. Sans ça, deux
      // besoins frères pourraient être résolus par le même agent — produisant
      // une chaîne incohérente du type "Leguay → Mendi → Leguay".
      for (const r of aplatirResolution(sousResult.resolution)) {
        etatEnrichi.agentsEngagesBranche.add(r.agent.id);
        if (r.besoin.jsCible.planningLigneId) {
          etatEnrichi.jsLibereesDansBranche.add(r.besoin.jsCible.planningLigneId);
        }
      }
    }

    if (toutesResolues) {
      return {
        ok: true,
        resolution: {
          besoin,
          agent: candidat.context,
          statut: eval_.statut,
          detail: eval_.detail,
          consequences: eval_.consequences,
          sousResolutions,
        },
      };
    }
    // Sinon : on essaie le candidat suivant.
  }

  return derniereRaisonEchec;
}

// ─── enumererSolutions ───────────────────────────────────────────────────────

/**
 * Construit l'objet Solution à partir d'une Resolution racine + de l'état dans
 * lequel elle a été trouvée. Calcule les agrégats (profondeur, vigilance,
 * agents engagés…).
 */
function construireSolution(racine: Resolution, etat: EtatCascade): Solution {
  const aplaties = aplatirResolution(racine);
  const hasVigilance = aplaties.some((r) => r.statut === "VIGILANCE");
  const agentsEngages = new Set<string>(aplaties.map((r) => r.agent.id));

  return {
    resolutionRacine: racine,
    resolutionsAplaties: aplaties,
    complete: true,
    hasVigilance,
    niveauRisque: hasVigilance ? "VIGILANCE" : "OK",
    profondeurMax: profondeurMaxResolution(racine),
    budgetConsomme: SOLVER_DEFAULTS.CASCADE_EVAL_BUDGET - etat.budget.remaining,
    agentsEngages,
  };
}

/**
 * Signature stable d'une solution = liste ordonnée des couples (agent, besoin)
 * dans l'aplatissement post-ordre. Permet de dédupliquer les solutions
 * distinctes en topologie.
 */
function signatureSolution(sol: Solution): string {
  return sol.resolutionsAplaties
    .map((r) => `${r.agent.id}:${r.besoin.id}`)
    .join("|");
}

/**
 * Construit un état d'itération basé sur l'état initial, en ajoutant des
 * exclusions globales (qui s'appliquent à tous les niveaux).
 */
function cloneEtatAvecExclusions(
  etatInitial: EtatCascade,
  exclusions: ReadonlySet<string>
): EtatCascade {
  return {
    agentsMap: etatInitial.agentsMap,
    index: etatInitial.index,
    rules: etatInitial.rules,
    lpaContext: etatInitial.lpaContext,
    npoExclusionCodes: etatInitial.npoExclusionCodes,
    remplacement: etatInitial.remplacement,
    deplacement: etatInitial.deplacement,
    importId: etatInitial.importId,
    profondeurMax: etatInitial.profondeurMax,

    affectationsCourantes: new Map(etatInitial.affectationsCourantes),
    jsLibereesDansBranche: new Set(etatInitial.jsLibereesDansBranche),
    agentsEngagesBranche: new Set([
      ...etatInitial.agentsEngagesBranche,
      ...exclusions,
    ]),
    besoinsEnCoursBranche: new Set(etatInitial.besoinsEnCoursBranche),

    budget: etatInitial.budget,
    cache: etatInitial.cache,
  };
}

export interface EnumererOptions {
  /**
   * Stratégie de diversification :
   *  - N1_SEUL    : seul l'agent N1 (racine) est varié entre solutions.
   *                 Utile pour exposer des "premiers responsables" différents.
   *  - MULTI_NIVEAU : après la phase N1, chaque solution est revisitée en
   *                   excluant un agent intermédiaire à la fois pour générer
   *                   des variantes profondes (ex: même N1+N2 mais N3 distinct).
   *                   Permet de faire émerger des chaînes terrain qui ne
   *                   sortent pas du DFS premier-trouvé.
   */
  diversification?: "N1_SEUL" | "MULTI_NIVEAU";
}

/**
 * Énumère jusqu'à `maxSolutions` solutions complètes distinctes pour un besoin
 * racine. Deux stratégies de diversification — voir `EnumererOptions`.
 */
export function enumererSolutions(
  besoinRacine: Besoin,
  etatInitial: EtatCascade,
  maxSolutions: number = SOLVER_DEFAULTS.MAX_SOLUTIONS_ENUMEREES,
  options?: EnumererOptions
): Solution[] {
  const mode = options?.diversification ?? "N1_SEUL";

  // ─── Phase 1 — N1 distincts (commune aux deux modes) ──────────────────────
  const solutions: Solution[] = [];
  const seenSignatures = new Set<string>();
  const exclusionsN1 = new Set<string>();

  for (let i = 0; i < maxSolutions; i++) {
    if (etatInitial.budget.remaining <= 0) break;

    const etatIter = cloneEtatAvecExclusions(etatInitial, exclusionsN1);
    const r = resoudreBesoin(besoinRacine, etatIter, { mode: "PREMIER_TROUVE" });
    if (!r.ok) break;

    const sol = construireSolution(r.resolution, etatIter);
    const sig = signatureSolution(sol);
    if (!seenSignatures.has(sig)) {
      seenSignatures.add(sig);
      solutions.push(sol);
    }
    exclusionsN1.add(r.resolution.agent.id);
  }

  if (mode === "N1_SEUL") return solutions;

  // ─── Phase 2 — diversification multi-niveau ───────────────────────────────
  // Pour chaque solution déjà trouvée, exclure UN agent intermédiaire à la fois
  // (tous sauf la racine = le N1 — celui-ci est déjà varié en phase 1) et
  // relancer le solveur. Garde toute solution distincte en topologie.
  //
  // L'exclusion est globale (l'agent ne peut plus apparaître à AUCUN niveau)
  // — c'est une simplification pragmatique. Une exclusion par-niveau serait
  // plus précise mais demanderait une refonte d'`agentsEngagesBranche` ; le
  // résultat empirique de l'exclusion globale suffit à exposer les variantes
  // de la chaîne terrain (ex: Brouillat → Leguay vs Brouillat → Ollier).

  const baseCount = solutions.length;
  for (let s = 0; s < baseCount; s++) {
    if (solutions.length >= maxSolutions) break;
    if (etatInitial.budget.remaining <= 0) break;

    const sol = solutions[s];
    // L'aplatissement est en post-ordre : feuilles d'abord, racine en dernier.
    // On exclut tout sauf le DERNIER élément (la racine = N1).
    for (let i = 0; i < sol.resolutionsAplaties.length - 1; i++) {
      if (solutions.length >= maxSolutions) break;
      if (etatInitial.budget.remaining <= 0) break;

      const agentAExclure = sol.resolutionsAplaties[i].agent.id;
      const etatIter = cloneEtatAvecExclusions(
        etatInitial,
        new Set([agentAExclure])
      );
      const r = resoudreBesoin(besoinRacine, etatIter, { mode: "PREMIER_TROUVE" });
      if (!r.ok) continue;

      const newSol = construireSolution(r.resolution, etatIter);
      const sig = signatureSolution(newSol);
      if (seenSignatures.has(sig)) continue;
      seenSignatures.add(sig);
      solutions.push(newSol);
    }
  }

  return solutions;
}

// ─── Helpers de construction d'un besoin racine ──────────────────────────────

/**
 * Construit le besoin racine pour un imprévu (la JS à couvrir).
 * Utilitaire pour le branchement allocator futur.
 */
export function besoinRacineFromJs(js: JsCible): Besoin {
  return {
    id: besoinIdFromJs(js),
    jsCible: js,
    origine: { type: "RACINE" },
    niveau: 0,
  };
}

// Re-exports pour usage externe
export { aplatirResolution, profondeurMaxResolution, planningEffectif } from "./etat";
export type { ConsequenceType };
