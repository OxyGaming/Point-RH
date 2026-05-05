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
 * Énumère jusqu'à `maxSolutions` solutions complètes distinctes pour un besoin
 * racine. Diversification par exclusion successive de l'agent N1 — les
 * sous-niveaux peuvent réapparaître dans d'autres solutions.
 */
export function enumererSolutions(
  besoinRacine: Besoin,
  etatInitial: EtatCascade,
  maxSolutions: number = SOLVER_DEFAULTS.MAX_SOLUTIONS_ENUMEREES
): Solution[] {
  const solutions: Solution[] = [];
  const exclusionsN1 = new Set<string>();

  for (let i = 0; i < maxSolutions; i++) {
    if (etatInitial.budget.remaining <= 0) break;

    const etatIter: EtatCascade = {
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
        ...exclusionsN1,
      ]),
      besoinsEnCoursBranche: new Set(etatInitial.besoinsEnCoursBranche),

      budget: etatInitial.budget,
      cache: etatInitial.cache,
    };

    const r = resoudreBesoin(besoinRacine, etatIter, { mode: "PREMIER_TROUVE" });
    if (!r.ok) break;

    solutions.push(construireSolution(r.resolution, etatIter));
    exclusionsN1.add(r.resolution.agent.id);
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
