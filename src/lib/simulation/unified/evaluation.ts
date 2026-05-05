/**
 * Solveur unifié — évaluation d'impact d'une affectation hypothétique.
 *
 * `evaluerImpactComplet` est le cœur de l'unification : il appelle le moteur
 * RH historique (`evaluerMobilisabilite`) sur un planning hypothétique enrichi
 * de l'état de branche, puis traduit les violations RH en `Consequence`s
 * exploitables par le solveur récursif.
 *
 * Principe de mapping (voir aussi `mapViolationsToConsequences`) :
 *  - HORAIRE_CONFLICT : détecté en amont par recherche d'event qui chevauche.
 *    L'événement bloquant est retiré du planning hypothétique avant l'appel à
 *    evaluerMobilisabilite, et émis comme conséquence.
 *  - REPOS_JOURNALIER : la violation pointe vers `dernierPosteDate`/`Debut`,
 *    qui identifient un event spécifique dans le planning de l'agent. On
 *    émet INDUCED_REPOS sur cette JS.
 *  - Autres règles récupérables (GPT, TE, NUITS) : non mappées en V1 — seront
 *    rejetées comme NON_RECUPERABLE. À enrichir au fil des cas terrain.
 *  - Règles fatales (PREFIXE, NUIT_HABILITATION, AMPLITUDE…) : faisable=false,
 *    raisonRejet renseigné.
 */

import type { PlanningEvent, AgentContext } from "@/engine/rules";
import { evaluerMobilisabilite } from "@/engine/rules";
import type { JsCible, ConflitInduit } from "@/types/js-simulation";
import type { SimulationInput, RegleViolation, DetailCalcul } from "@/types/simulation";
import type {
  Besoin,
  Consequence,
  ConsequenceType,
  EtatCascade,
  ImpactEvaluation,
} from "./types";
import { cacheKey, planningEffectif } from "./etat";
import { combineDateTime, diffMinutes, isJsDeNuit } from "@/lib/utils";
import { computeEffectiveService } from "@/lib/deplacement/computeEffectiveService";
import { detecterConflitsInduits } from "@/lib/simulation/conflictDetector";

// ─── Règles fatales (jamais récupérables par cascade) ────────────────────────

const REGLES_FATALES = new Set<string>([
  "PREFIXE_JS",
  "NUIT_HABILITATION",
  "DEPLACEMENT_HABILITATION",
  "TRAJET_ABSENT",
  "MIN_REGIME_BC",
  "AMPLITUDE",            // amplitude individuelle — irrecouvrable par libération
  "TRAVAIL_EFFECTIF",     // idem
]);

const REGLES_RECUPERABLES_TYPE: Record<string, ConsequenceType> = {
  REPOS_JOURNALIER: "INDUCED_REPOS",
  GPT_MAX: "INDUCED_GPT",
  TE_GPT_48H: "INDUCED_TE_48H",
  GPT_NUIT_CONSECUTIVES: "INDUCED_NUITS",
  // INDUCED_RP : géré séparément via gptRpAnalyse, pas via violations[]
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convertit un PlanningEvent (déjà identifié comme bloquant) en JsCible. */
export function eventToJsCible(
  event: PlanningEvent,
  agentSource: AgentContext,
  importId: string
): JsCible | null {
  if (!event.planningLigneId) return null;
  const dateIso = event.dateDebut.toISOString().slice(0, 10);
  const isNuit = isJsDeNuit(event.heureDebut, event.heureFin);
  return {
    planningLigneId: event.planningLigneId,
    agentId: agentSource.id,
    agentNom: agentSource.nom,
    agentPrenom: agentSource.prenom,
    agentMatricule: agentSource.matricule,
    date: dateIso,
    heureDebut: event.heureDebut,
    heureFin: event.heureFin,
    amplitudeMin: event.amplitudeMin,
    codeJs: event.codeJs,
    typeJs: event.typeJs,
    isNuit,
    importId,
    flexibilite: "OBLIGATOIRE",
    heureDebutJsType: event.heureDebutJsType,
    heureFinJsType: event.heureFinJsType,
  };
}

/** Cherche un event JS qui chevauche le créneau [start, end]. */
function trouverEventConflit(
  events: PlanningEvent[],
  start: Date,
  end: Date
): PlanningEvent | null {
  for (const e of events) {
    if (e.jsNpo !== "JS") continue;
    if (e.dateDebut < end && e.dateFin > start) return e;
  }
  return null;
}

/** Construit un SimulationInput à partir d'une JsCible. */
function buildSimulationInput(
  besoin: Besoin,
  etat: EtatCascade,
  agent: AgentContext
): { simulationInput: SimulationInput; deplacement: boolean } {
  const js = besoin.jsCible;
  const heureDebutBase = js.heureDebutJsType ?? js.heureDebut;
  const heureFinBase = js.heureFinJsType ?? js.heureFin;

  const jsEstNuit = isJsDeNuit(heureDebutBase, heureFinBase, {
    debutSoirMin: etat.rules.periodeNocturne.debutSoir,
    finMatinMin: etat.rules.periodeNocturne.finMatin,
    seuilMin: etat.rules.periodeNocturne.seuilJsNuit,
  });

  const effectiveService = etat.lpaContext
    ? computeEffectiveService(
        { id: agent.id, lpaBaseId: agent.lpaBaseId, peutEtreDeplace: agent.peutEtreDeplace },
        {
          codeJs: js.codeJs,
          typeJs: js.typeJs,
          heureDebut: heureDebutBase,
          heureFin: heureFinBase,
          estNuit: jsEstNuit,
        },
        etat.lpaContext,
        { remplacement: etat.remplacement }
      )
    : null;

  const heureDebutSim = effectiveService?.heureDebutEffective ?? heureDebutBase;
  const heureFinSim = effectiveService?.heureFinEffective ?? heureFinBase;
  const deplacement = effectiveService?.estEnDeplacement ?? etat.deplacement;

  // dateFin : si heureFin <= heureDebut, la JS franchit minuit → dateFin = jour suivant.
  // Indispensable pour evaluerMobilisabilite qui utilise combineDateTime(dateFin, heureFin).
  const dateFin = heureFinSim <= heureDebutSim
    ? new Date(new Date(`${js.date}T00:00:00Z`).getTime() + 24 * 3600_000)
        .toISOString()
        .slice(0, 10)
    : js.date;

  return {
    simulationInput: {
      importId: etat.importId,
      dateDebut: js.date,
      dateFin,
      heureDebut: heureDebutSim,
      heureFin: heureFinSim,
      poste: js.codeJs ?? "JS",
      codeJs: js.codeJs,
      remplacement: etat.remplacement,
      deplacement,
      posteNuit: jsEstNuit,
    },
    deplacement,
  };
}

/**
 * Mappe les violations renvoyées par evaluerMobilisabilite en Consequences.
 *
 * Retourne :
 *  - `consequences` : une consequence par violation récupérable (avec
 *    jsImpactee identifiée).
 *  - `irrecuperable` : true si au moins une violation fatale est présente
 *    OU une violation récupérable sans jsImpactee identifiable.
 *  - `raisonRejet` : message diagnostic en cas d'irrecuperable=true.
 */
export function mapViolationsToConsequences(
  violations: readonly RegleViolation[],
  detail: DetailCalcul,
  agent: AgentContext,
  agentEvents: PlanningEvent[],
  importId: string
): {
  consequences: Consequence[];
  irrecuperable: boolean;
  raisonRejet?: string;
} {
  const consequences: Consequence[] = [];

  for (const v of violations) {
    if (REGLES_FATALES.has(v.regle)) {
      return {
        consequences: [],
        irrecuperable: true,
        raisonRejet: `${v.regle}: ${v.description}`,
      };
    }

    const type = REGLES_RECUPERABLES_TYPE[v.regle];
    if (!type) {
      // Règle non classifiée — conservatif : NON_RECUPERABLE.
      return {
        consequences: [],
        irrecuperable: true,
        raisonRejet: `Règle non récupérable: ${v.regle}`,
      };
    }

    // Mapping spécifique par type
    const conseq = mapViolationToConsequence(
      type,
      v,
      detail,
      agent,
      agentEvents,
      importId
    );
    if (!conseq) {
      return {
        consequences: [],
        irrecuperable: true,
        raisonRejet: `JS impactée non identifiable pour ${v.regle}`,
      };
    }
    consequences.push(conseq);
  }

  return { consequences, irrecuperable: false };
}

function mapViolationToConsequence(
  type: ConsequenceType,
  violation: RegleViolation,
  detail: DetailCalcul,
  agent: AgentContext,
  agentEvents: PlanningEvent[],
  importId: string
): Consequence | null {
  switch (type) {
    case "INDUCED_REPOS": {
      // dernierPosteDate + dernierPosteDebut identifient l'event qui crée le manque.
      if (!detail.dernierPosteDate || !detail.dernierPosteDebut) return null;
      const event = agentEvents.find(
        (e) =>
          e.jsNpo === "JS" &&
          e.dateDebut.toISOString().slice(0, 10) === detail.dernierPosteDate &&
          e.heureDebut === detail.dernierPosteDebut
      );
      if (!event || !event.planningLigneId) return null;
      const jsImpactee = eventToJsCible(event, agent, importId);
      if (!jsImpactee) return null;
      return {
        type,
        jsImpactee,
        description: violation.description,
        meta: {
          reposDisponibleMin: detail.reposJournalierDisponible ?? undefined,
          reposRequisMin: detail.reposJournalierMin,
        },
      };
    }
    case "INDUCED_GPT":
    case "INDUCED_TE_48H": {
      // Heuristique V1 : libérer la JS la PLUS RÉCENTE de la GPT courante de
      // l'agent (= dernier élément de teGptLignes). Liberation de cette JS
      // ramène le compte GPT et le cumul TE 48h sous la limite. Si plusieurs
      // JS sont éligibles, le solveur explore via la diversification multi-niveau.
      // null → branche rejetée (conformément à l'arbitrage utilisateur :
      //  "sinon rester en NON_RECUPERABLE").
      if (detail.teGptLignes.length === 0) return null;
      const ligne = detail.teGptLignes[detail.teGptLignes.length - 1];
      const event = agentEvents.find(
        (e) =>
          e.jsNpo === "JS" &&
          e.dateDebut.toISOString().slice(0, 10) === ligne.date &&
          e.heureDebut === ligne.heureDebut
      );
      if (!event || !event.planningLigneId) return null;
      const jsImpactee = eventToJsCible(event, agent, importId);
      if (!jsImpactee) return null;
      return {
        type,
        jsImpactee,
        description: violation.description,
        meta: {
          gptActuel: detail.gptActuel,
          gptMax: detail.gptMax,
          teCumule48hMin: detail.teGptCumulAvant,
        },
      };
    }
    case "INDUCED_NUITS":
      // INDUCED_NUITS : une heuristique fiable ("quelle JS de quelle GPT nuit
      // libérer ?") nécessite une donnée terrain pour calibrer. Pour l'instant
      // on rejette la candidature (NON_RECUPERABLE) plutôt que de proposer une
      // solution potentiellement non valide.
      return null;
    default:
      return null;
  }
}

// ─── evaluerImpactComplet ────────────────────────────────────────────────────

/**
 * Évalue si un agent peut prendre un besoin dans l'état courant, et identifie
 * les conséquences (JS à libérer) si oui.
 *
 * Pas de side-effects sur l'état (sauf décrément du budget et mise en cache).
 */
export function evaluerImpactComplet(
  agent: AgentContext,
  besoin: Besoin,
  etat: EtatCascade
): ImpactEvaluation {
  // 1. Cache lookup
  const key = cacheKey(agent.id, besoin.id, etat);
  const cached = etat.cache.get(key);
  if (cached) return cached;

  // 2. Décrément budget (1 unité par évaluation, même si ko)
  etat.budget.remaining -= 1;

  // 3. Pré-filtre habilitation préfixe — fatal si non couvert
  const codeJs = besoin.jsCible.codeJs;
  if (codeJs !== null && agent.prefixesJs.length > 0) {
    const codeUpper = codeJs.toUpperCase();
    const habilite = agent.prefixesJs.some((p) =>
      codeUpper.startsWith(p.trim().toUpperCase())
    );
    if (!habilite) {
      const result: ImpactEvaluation = {
        faisable: false,
        raisonRejet: `HABILITATION: ${codeJs} non couvert par préfixes ${agent.prefixesJs.join(", ")}`,
        statut: "VIGILANCE",
        detail: emptyDetail(),
        consequences: [],
      };
      etat.cache.set(key, result);
      return result;
    }
  }

  // 4. Pré-filtre nuit
  if (besoin.jsCible.isNuit && !agent.peutFaireNuit) {
    const result: ImpactEvaluation = {
      faisable: false,
      raisonRejet: "NUIT_HABILITATION: agent non habilité nuit",
      statut: "VIGILANCE",
      detail: emptyDetail(),
      consequences: [],
    };
    etat.cache.set(key, result);
    return result;
  }

  // 5. Planning effectif (évents d'origine - libérés + injectés branche)
  const agentData = etat.agentsMap.get(agent.id);
  if (!agentData) {
    const result: ImpactEvaluation = {
      faisable: false,
      raisonRejet: "AGENT_INTROUVABLE",
      statut: "VIGILANCE",
      detail: emptyDetail(),
      consequences: [],
    };
    etat.cache.set(key, result);
    return result;
  }
  const eventsEffectifs = planningEffectif(agentData, etat);

  // 6. Détection HORAIRE_CONFLICT
  const debutBesoin = combineDateTime(
    besoin.jsCible.date,
    besoin.jsCible.heureDebutJsType ?? besoin.jsCible.heureDebut
  );
  let finBesoin = combineDateTime(
    besoin.jsCible.date,
    besoin.jsCible.heureFinJsType ?? besoin.jsCible.heureFin
  );
  if (finBesoin.getTime() <= debutBesoin.getTime()) {
    finBesoin = new Date(finBesoin.getTime() + 24 * 3600_000);
  }

  const eventConflit = trouverEventConflit(eventsEffectifs, debutBesoin, finBesoin);

  const consequencesPreEval: Consequence[] = [];
  let eventsHypothetiques = eventsEffectifs;

  if (eventConflit) {
    const jsImpactee = eventToJsCible(eventConflit, agent, etat.importId);
    if (!jsImpactee) {
      const result: ImpactEvaluation = {
        faisable: false,
        raisonRejet: "HORAIRE_CONFLICT_NON_LIBERABLE: event sans planningLigneId",
        statut: "VIGILANCE",
        detail: emptyDetail(),
        consequences: [],
      };
      etat.cache.set(key, result);
      return result;
    }
    consequencesPreEval.push({
      type: "HORAIRE_CONFLICT",
      jsImpactee,
      description: `Conflit horaire avec JS ${eventConflit.codeJs ?? "?"} ${jsImpactee.heureDebut}–${jsImpactee.heureFin}`,
    });
    // Évaluation RH hypothétique : on retire le conflit
    eventsHypothetiques = eventsEffectifs.filter((e) => e !== eventConflit);
  }

  // 7. Appel evaluerMobilisabilite sur le planning hypothétique
  const { simulationInput } = buildSimulationInput(besoin, etat, agent);
  const resultat = evaluerMobilisabilite(
    agent,
    eventsHypothetiques,
    simulationInput,
    etat.rules
  );

  // 8. Mapping violations → consequences
  const mapping = mapViolationsToConsequences(
    resultat.detail.violations,
    resultat.detail,
    agent,
    eventsEffectifs,         // chercher les JS dans le planning RÉEL (pas hypothétique)
    etat.importId
  );

  if (mapping.irrecuperable) {
    const result: ImpactEvaluation = {
      faisable: false,
      raisonRejet: mapping.raisonRejet,
      statut: "VIGILANCE",
      detail: resultat.detail,
      consequences: [],
    };
    etat.cache.set(key, result);
    return result;
  }

  // 8.5. Détection des conflits induits FORWARD (sur les 72h après l'imprévu).
  // evaluerMobilisabilite vérifie surtout le repos AVANT l'imprévu (vs. dernier
  // poste). Pour les conflits APRÈS (la JS aval que l'agent ne pourra plus
  // tenir), on s'appuie sur detecterConflitsInduits — l'outil utilisé par le
  // legacy `multiJsAllocator`. On l'invoque sur le planning hypothétique +
  // l'imprévu injecté, puis on mappe chaque conflit en Consequence.
  const forwardMapping = mapForwardConflicts(
    besoin,
    agent,
    eventsHypothetiques,
    eventsEffectifs,
    simulationInput,
    resultat.detail,
    etat,
    new Set(consequencesPreEval.map((c) => c.jsImpactee.planningLigneId))
  );

  if (forwardMapping.irrecuperable) {
    const result: ImpactEvaluation = {
      faisable: false,
      raisonRejet: forwardMapping.raisonRejet,
      statut: "VIGILANCE",
      detail: resultat.detail,
      consequences: [],
    };
    etat.cache.set(key, result);
    return result;
  }

  // 9. Construction de la sortie
  const allConsequences = [
    ...consequencesPreEval,
    ...mapping.consequences,
    ...forwardMapping.consequences,
  ];
  const statut: "DIRECT" | "VIGILANCE" =
    resultat.statut === "VIGILANCE" || allConsequences.length > 0
      ? "VIGILANCE"
      : "DIRECT";

  const result: ImpactEvaluation = {
    faisable: true,
    statut,
    detail: resultat.detail,
    consequences: allConsequences,
  };
  etat.cache.set(key, result);
  return result;
}

// ─── Détection forward (conflits aval) ───────────────────────────────────────

/**
 * Construit un PlanningEvent synthétique représentant l'imprévu pris par
 * l'agent. Utilisé comme injection dans le planning hypothétique pour
 * detecterConflitsInduits.
 */
function syntheticImprevuEvent(
  besoin: Besoin,
  simulationInput: SimulationInput
): PlanningEvent {
  const debut = combineDateTime(simulationInput.dateDebut, simulationInput.heureDebut);
  let fin = combineDateTime(simulationInput.dateFin, simulationInput.heureFin);
  if (fin.getTime() <= debut.getTime()) {
    fin = new Date(fin.getTime() + 24 * 3600_000);
  }
  return {
    dateDebut: debut,
    dateFin: fin,
    heureDebut: simulationInput.heureDebut,
    heureFin: simulationInput.heureFin,
    amplitudeMin: diffMinutes(debut, fin),
    dureeEffectiveMin: null,
    jsNpo: "JS",
    codeJs: besoin.jsCible.codeJs,
    typeJs: besoin.jsCible.typeJs,
    planningLigneId: besoin.jsCible.planningLigneId,
    heureDebutJsType: besoin.jsCible.heureDebutJsType,
    heureFinJsType: besoin.jsCible.heureFinJsType,
  };
}

/**
 * Pour chaque ConflitInduit retourné par detecterConflitsInduits, identifie
 * la JS impactée dans le planning de l'agent et émet une Consequence.
 *
 *  - REPOS_INSUFFISANT (resolvable) → INDUCED_REPOS, JS identifiée par date+heure.
 *  - GPT_MAX (legacy resolvable=false dans le legacy, mais récupérable par
 *    libération d'une JS de la GPT courante) → INDUCED_GPT, JS identifiée
 *    via la dernière ligne de teGptLignes (= JS la plus récente avant l'imprévu
 *    dans la même GPT). Le solveur tentera ensuite de la libérer via cascade.
 *  - TE_GPT_48H : non émis par detecterConflitsInduits (uniquement détecté en
 *    backward par evaluerMobilisabilite).
 *  - NUIT_CONSEC (resolvable) → INDUCED_NUITS, JS identifiée par date.
 *
 * Les conflits dont la JS ne porte pas de planningLigneId, ou dont la JS est
 * déjà dans consequencesPreEval (HORAIRE_CONFLICT déjà traité), sont sautés.
 */
function mapForwardConflicts(
  besoin: Besoin,
  agent: AgentContext,
  eventsHypothetiques: PlanningEvent[],
  eventsEffectifs: PlanningEvent[],
  simulationInput: SimulationInput,
  detail: DetailCalcul,
  etat: EtatCascade,
  jsDejaCouvertes: ReadonlySet<string>
): { consequences: Consequence[]; irrecuperable: boolean; raisonRejet?: string } {
  const imprevuEvent = syntheticImprevuEvent(besoin, simulationInput);
  const eventsAvecImprevu = [...eventsHypothetiques, imprevuEvent].sort(
    (a, b) => a.dateDebut.getTime() - b.dateDebut.getTime()
  );

  const conflits: ConflitInduit[] = detecterConflitsInduits(
    eventsAvecImprevu,
    imprevuEvent.dateFin,
    agent.agentReserve,
    etat.remplacement,
    etat.rules
  );

  const consequences: Consequence[] = [];

  for (const c of conflits) {
    // Le legacy marque GPT_MAX en resolvable=false par prudence — pour le
    // solveur unifié, on étend le mapping si une JS libérable est identifiable.
    // Si non identifiable, on retombe sur le rejet conservatif comme demandé
    // par l'arbitrage utilisateur ("sinon rester en NON_RECUPERABLE").
    const isGptMaxRecupTry = c.regleCode === "GPT_MAX";
    if (!c.resolvable && !isGptMaxRecupTry) {
      return {
        consequences: [],
        irrecuperable: true,
        raisonRejet: `${c.regleCode}: ${c.description}`,
      };
    }

    let event: PlanningEvent | undefined;

    if (isGptMaxRecupTry) {
      // Heuristique GPT_MAX : la JS la plus récente de la GPT courante
      // (dernier élément de detail.teGptLignes). Liberation réduit la GPT de 1
      // → l'ajout de l'imprévu fait alors GPT count = max OK.
      if (detail.teGptLignes.length > 0) {
        const ligne = detail.teGptLignes[detail.teGptLignes.length - 1];
        event = eventsEffectifs.find(
          (e) =>
            e.jsNpo === "JS" &&
            e.dateDebut.toISOString().slice(0, 10) === ligne.date &&
            e.heureDebut === ligne.heureDebut
        );
      }
    } else {
      // Mapping standard via date+heureDebut (REPOS_INSUFFISANT, NUIT_CONSEC)
      event = eventsEffectifs.find(
        (e) =>
          e.jsNpo === "JS" &&
          e.dateDebut.toISOString().slice(0, 10) === c.date &&
          (c.heureDebut ? e.heureDebut === c.heureDebut : true)
      );
    }

    if (!event || !event.planningLigneId) {
      return {
        consequences: [],
        irrecuperable: true,
        raisonRejet: `${c.regleCode}: JS impactée non identifiable (${c.description})`,
      };
    }

    // Skip si cette JS est déjà couverte par une consequence préalable.
    if (jsDejaCouvertes.has(event.planningLigneId)) continue;

    const jsImpactee = eventToJsCible(event, agent, etat.importId);
    if (!jsImpactee) {
      return {
        consequences: [],
        irrecuperable: true,
        raisonRejet: `${c.regleCode}: conversion JsCible impossible`,
      };
    }

    const consequenceType: ConsequenceType =
      c.regleCode === "REPOS_JOURNALIER"
        ? "INDUCED_REPOS"
        : c.regleCode === "GPT_MAX"
          ? "INDUCED_GPT"
          : c.regleCode === "GPT_NUIT_CONSECUTIVES"
            ? "INDUCED_NUITS"
            : "INDUCED_REPOS";

    consequences.push({
      type: consequenceType,
      jsImpactee,
      description: c.description,
      meta: c.regleCode === "GPT_MAX"
        ? { gptActuel: detail.gptActuel, gptMax: detail.gptMax }
        : undefined,
    });
  }

  return { consequences, irrecuperable: false };
}

// ─── DetailCalcul vide (pour les rejets précoces) ────────────────────────────

function emptyDetail(): DetailCalcul {
  return {
    amplitudeMaxAutorisee: 0,
    amplitudeImprevu: 0,
    amplitudeRaison: "",
    dureeEffectiveMax: 0,
    reposJournalierMin: 0,
    dernierPosteDebut: null,
    dernierPosteFin: null,
    dernierPosteDate: null,
    reposJournalierDisponible: null,
    gptActuel: 0,
    gptMax: 0,
    teGptCumulAvant: 0,
    teGptLignes: [],
    reposPeriodiqueProchain: null,
    violations: [],
    respectees: [],
    pointsVigilance: [],
    disponible: false,
    deplacementInfo: null,
    gptRpAnalyse: null,
  };
}
