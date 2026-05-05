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
import { scorerCandidat } from "@/lib/simulation/scenarioScorer";
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
  NiveauRisque,
  Resolution,
  ResolutionResult,
  ResolutionOptions,
  Solution,
  ConsequenceType,
} from "./types";
import { besoinIdFromJs, SEUIL_SCORE_DECONSEILLE, SOLVER_DEFAULTS } from "./types";
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
 * Tri des candidats — trois stratégies disponibles.
 *
 *  - STANDARD     : ordre stable par agentId. Diagnostic / tests.
 *  - RESERVE_PRIO : réservistes d'abord (ils sont là pour ça), puis agentId.
 *                   Tri naïf utilisé en V1 — n'expose pas le score métier.
 *  - SCORE_LEGACY : aligné sur l'allocator legacy. Évalue chaque candidat
 *                   via evaluerImpactComplet (cache hit après le 1er passage)
 *                   puis trie par DIRECT/VIGILANCE → réserve → score métier.
 *                   C'est le tri qui doit faire émerger Brouillat sur les
 *                   sous-besoins (BAD015R, GIC015) là où RESERVE_PRIO place
 *                   d'autres réservistes en tête.
 */
function trierCandidats(
  candidats: string[],
  besoin: Besoin,
  etat: EtatCascade,
  tri: "STANDARD" | "RESERVE_PRIO" | "SCORE_LEGACY"
): string[] {
  if (tri === "STANDARD") {
    return [...candidats].sort();
  }
  if (tri === "RESERVE_PRIO") {
    const out = [...candidats];
    out.sort((a, b) => {
      const ar = etat.agentsMap.get(a)?.context.agentReserve ? 1 : 0;
      const br = etat.agentsMap.get(b)?.context.agentReserve ? 1 : 0;
      if (br !== ar) return br - ar;
      return a.localeCompare(b);
    });
    return out;
  }

  // SCORE_LEGACY — évaluation préalable + tri métier
  const enrichis = candidats
    .map((id) => {
      const candidat = etat.agentsMap.get(id);
      if (!candidat) return null;
      const eval_ = evaluerImpactComplet(candidat.context, besoin, etat);
      // Score métier alignée sur scorerCandidat du legacy.
      // surJsZ = false en V1 (à raffiner si on observe une régression sur les
      // candidats actuellement positionnés sur une JS Z).
      const score = eval_.faisable
        ? scorerCandidat({
            agentId: candidat.context.id,
            nom: candidat.context.nom,
            prenom: candidat.context.prenom,
            matricule: candidat.context.matricule,
            posteAffectation: candidat.context.posteAffectation,
            agentReserve: candidat.context.agentReserve,
            surJsZ: false,
            codeJsZOrigine: null,
            statut: eval_.statut === "VIGILANCE" ? "VIGILANCE" : "DIRECT",
            motifPrincipal: eval_.raisonRejet ?? "",
            detail: eval_.detail,
            conflitsInduits: [],
            nbConflits: eval_.consequences.length,
          })
        : 0;
      return {
        id,
        score,
        faisable: eval_.faisable,
        statut: eval_.statut,
        agentReserve: candidat.context.agentReserve,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  enrichis.sort((a, b) => {
    // Faisable d'abord
    if (a.faisable !== b.faisable) return a.faisable ? -1 : 1;
    // DIRECT avant VIGILANCE
    if (a.statut !== b.statut) return a.statut === "DIRECT" ? -1 : 1;
    // Réserve avant non-réserve (tiebreaker légacy)
    if (a.agentReserve !== b.agentReserve) return a.agentReserve ? -1 : 1;
    // Score décroissant
    return b.score - a.score;
  });

  return enrichis.map((x) => x.id);
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
    tri: options?.tri ?? "SCORE_LEGACY",
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
  const candidats = trierCandidats(candidatsBruts, besoin, etat, opts.tri).slice(
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

    // Score métier de l'agent sur ce besoin (0-100). Stocké dans Resolution
    // pour que construireSolution puisse en dériver niveauRisque.
    const score = scorerCandidat({
      agentId: candidat.context.id,
      nom: candidat.context.nom,
      prenom: candidat.context.prenom,
      matricule: candidat.context.matricule,
      posteAffectation: candidat.context.posteAffectation,
      agentReserve: candidat.context.agentReserve,
      surJsZ: false,
      codeJsZOrigine: null,
      statut: eval_.statut === "VIGILANCE" ? "VIGILANCE" : "DIRECT",
      motifPrincipal: eval_.raisonRejet ?? "",
      detail: eval_.detail,
      conflitsInduits: [],
      nbConflits: eval_.consequences.length,
    });

    // Cas feuille : pas de conséquences → branche terminée.
    if (eval_.consequences.length === 0) {
      return {
        ok: true,
        resolution: {
          besoin,
          agent: candidat.context,
          statut: eval_.statut,
          score,
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
          score,
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

  // Détermination du niveauRisque :
  //  - DECONSEILLEE si un agent dans la chaîne a un score métier ≤ seuil
  //    (typiquement 30/100, voir SEUIL_SCORE_DECONSEILLE)
  //  - VIGILANCE   si au moins une feuille en VIGILANCE
  //  - OK          sinon
  const aDecourageant = aplaties.some((r) => r.score <= SEUIL_SCORE_DECONSEILLE);
  const niveauRisque: NiveauRisque = aDecourageant
    ? "DECONSEILLEE"
    : hasVigilance
      ? "VIGILANCE"
      : "OK";

  return {
    resolutionRacine: racine,
    resolutionsAplaties: aplaties,
    complete: true,
    hasVigilance,
    niveauRisque,
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
  /**
   * Mode exhaustif : ajoute une phase 3 qui élargit `maxCandidatsAuNiveau`
   * pour explorer les candidats à score métier bas (≤ SEUIL_SCORE_DECONSEILLE).
   * Solutions trouvées en phase 3 — qui incluent forcément un agent peu
   * scoré — ressortent automatiquement avec niveauRisque="DECONSEILLEE",
   * exposant des alternatives terrain documentées plutôt que recommandées.
   */
  exhaustif?: boolean;
  /**
   * Cap utilisé en phase 3 (mode exhaustif). Défaut : 30. Permet de tester
   * jusqu'à 30 candidats par niveau au lieu des 8 du tri SCORE_LEGACY normal.
   */
  maxCandidatsExhaustif?: number;
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

  // ─── Phase 3 — mode exhaustif : alternatives "DECONSEILLEE" ─────────────────
  // Pour exposer les agents à score bas (Brouillat saturé GPT, etc.) qui
  // n'apparaissent jamais dans les phases 1+2 (le greedy retient toujours
  // les mieux scorés), on exclut TOUS les agents déjà utilisés et on relance
  // le solveur avec un cap élargi. Cela force le solveur à composer des
  // chaînes avec les agents "résiduels" — typiquement ceux qui passent en
  // VIGILANCE/score=0 et qui ressortent en niveauRisque=DECONSEILLEE.
  if (options?.exhaustif) {
    const capExhaustif = options.maxCandidatsExhaustif ?? 30;
    // Pré-charger avec les agents déjà engagés dans les phases 1+2.
    const exclusExh = new Set<string>();
    for (const sol of solutions) {
      for (const r of sol.resolutionsAplaties) {
        exclusExh.add(r.agent.id);
      }
    }

    while (solutions.length < maxSolutions && etatInitial.budget.remaining > 0) {
      const etatExh = cloneEtatAvecExclusions(etatInitial, exclusExh);
      const r = resoudreBesoin(besoinRacine, etatExh, {
        mode: "PREMIER_TROUVE",
        maxCandidatsAuNiveau: capExhaustif,
      });
      if (!r.ok) break;

      const sol = construireSolution(r.resolution, etatExh);

      // Exclure tous les agents de cette solution pour la prochaine itération
      // — force des solutions vraiment distinctes en composition.
      for (const res of sol.resolutionsAplaties) {
        exclusExh.add(res.agent.id);
      }

      const sig = signatureSolution(sol);
      if (seenSignatures.has(sig)) continue;
      seenSignatures.add(sig);
      solutions.push(sol);
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
