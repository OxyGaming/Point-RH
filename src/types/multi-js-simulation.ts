/**
 * Types pour la simulation multi-JS (grève, perturbation majeure, absences multiples)
 */

import type { JsCible, ConflitInduit, ModificationPlanning, ImpactCascade, SolutionJs, JsSourceFigee, FlexibiliteJs } from "./js-simulation";
import type { Exclusion } from "@/engine/ruleTypes";
import type { LogEntry } from "@/engine/logger";
import type { DetailCalcul } from "./simulation";

// ─── Mode de simulation ───────────────────────────────────────────────────────

/** Périmètre des agents candidats pour la simulation */
export type CandidateScope = "reserve_only" | "all_agents";

// ─── Requête ──────────────────────────────────────────────────────────────────

export interface MultiJsSimulationRequest {
  importId: string;
  jsSelectionnees: JsCible[];
  candidateScope: CandidateScope;
  deplacement?: boolean;
  remplacement?: boolean;
  /**
   * Si true, l'allocateur peut figer une JS DERNIER_RECOURS pour libérer son agent.
   * Défaut false — aucun figeage sans activation explicite.
   */
  autoriserFigeage?: boolean;
}

// ─── Candidat interne (avant allocation) ─────────────────────────────────────

export interface CandidatMultiJs {
  agentId: string;
  nom: string;
  prenom: string;
  matricule: string;
  posteAffectation: string | null;
  agentReserve: boolean;
  score: number;
  statut: "DIRECT" | "VIGILANCE";
  motif: string;
  conflitsInduits: ConflitInduit[];
  /** Détail des règles évaluées lors de l'analyse de mobilisabilité */
  detail?: DetailCalcul;
  /**
   * Renseigné si l'agent est libéré par figeage de sa JS source DERNIER_RECOURS.
   * null si l'agent était libre ou sur JS Z — aucun figeage appliqué.
   */
  jsSourceFigee?: JsSourceFigee | null;
}

// ─── Situation initiale de l'agent remplaçant ────────────────────────────────

/** Ce que l'agent remplaçant avait initialement dans son planning au créneau couvert */
export type TypeSituationInitiale = "LIBRE" | "RESERVE" | "JS_Z" | "JS";

export interface JsOriginaleAgent {
  type: TypeSituationInitiale;
  /** Code JS d'origine (null si LIBRE ou RESERVE) */
  codeJs: string | null;
  /** Heures d'origine (renseignées si JS ou JS_Z) */
  heureDebut: string | null;
  heureFin: string | null;
  /** Libellé lisible affiché dans l'UI */
  description: string;
}

// ─── Chaîne de remplacement (mode Cascade) ───────────────────────────────────

/**
 * Un maillon d'une chaîne de remplacement.
 * Représente un agent déplacé pour combler un trou créé par le maillon précédent.
 *
 * Niveau 0 : agent affecté à la JS cible (origine de la chaîne)
 * Niveau 1 : agent qui reprend la JS source du niveau 0
 * Niveau 2 : agent qui reprend la JS source du niveau 1
 * etc.
 */
export interface MaillonChaine {
  /** Profondeur dans la chaîne (0 = agent affecté à la JS cible). */
  niveau: number;
  agentId: string;
  agentNom: string;
  agentPrenom: string;
  agentMatricule: string;
  /**
   * JS libérée par cet agent pour rejoindre la cible (ou la JS du maillon précédent).
   * Pour le niveau 0, c'est la JS qu'il devait initialement tenir.
   * Pour les niveaux ≥ 1, c'est la JS du maillon précédent qu'il vient combler.
   */
  jsLiberee: {
    planningLigneId: string;
    codeJs: string | null;
    date: string;       // "YYYY-MM-DD"
    heureDebut: string; // "HH:MM"
    heureFin: string;   // "HH:MM"
  };
  /** JS que ce maillon va tenir (cible du niveau précédent). */
  jsRepriseCodeJs: string | null;
  /** Statut RH de cet agent sur la JS qu'il prend en charge. */
  statut: "DIRECT" | "VIGILANCE";
}

/**
 * Chaîne de remplacement complète pour une affectation.
 * `complete=true` ssi tous les trous induits par la chaîne sont comblés.
 */
export interface ChaineRemplacement {
  maillons: MaillonChaine[];
  /** Nombre de maillons (= nombre d'agents déplacés en plus du niveau 0). */
  profondeur: number;
  /** True ssi la chaîne couvre tous les trous induits sans laisser de JS découverte. */
  complete: boolean;
}

// ─── Cascade conflits induits : alternatives ─────────────────────────────────

/**
 * Cascade alternative pour résoudre un conflit induit donné.
 * L'agent N1 est l'agent qui prend la JS imprévue à la place de l'agent
 * principal de la cascade retenue. Les sous-niveaux sont les agents
 * mobilisés pour libérer N1, le cas échéant.
 */
export interface CascadeAlternative {
  /** Conflit induit que cette cascade résout (date + horaires de la JS bloquante). */
  conflitDate: string;
  conflitHeureDebut: string | null;
  conflitHeureFin: string | null;
  conflitDescription: string;
  /** Agent N1 — visible en tête de l'alternative dans l'UI. */
  agentN1: {
    agentId: string;
    agentNom: string;
    agentPrenom: string;
    agentMatricule: string;
  };
  /** Modifications complètes (sous-niveaux d'abord, N1 en dernier). */
  modifications: ModificationPlanning[];
  /** Impacts résiduels (vigilances/avertissements) de cette alternative. */
  impacts: ImpactCascade[];
  /** Profondeur effective (1 = direct, 2+ = sous-cascade). */
  profondeur: number;
}

// ─── Affectation d'une JS à un agent dans le scénario ────────────────────────

export interface AffectationJs {
  jsId: string;            // planningLigneId de la JS cible
  jsCible: JsCible;
  agentId: string;
  agentNom: string;
  agentPrenom: string;
  agentMatricule: string;
  agentReserve: boolean;
  statut: "DIRECT" | "VIGILANCE";
  score: number;
  justification: string;
  conflitsInduits: ConflitInduit[];
  /** Situation initiale de l'agent remplaçant au créneau couvert */
  jsOriginaleAgent: JsOriginaleAgent;
  /** Agents mobilisés en cascade pour couvrir les conflits induits */
  cascadeModifications: ModificationPlanning[];
  /** Impacts cascade résiduels (vigilances, bloquants non résolus) */
  cascadeImpacts: ImpactCascade[];
  /** Nombre de conflits induits résolus par cascade */
  nbCascadesResolues: number;
  /** Nombre de conflits induits non résolus malgré la tentative cascade */
  nbCascadesNonResolues: number;
  /** Nature et ajustement de la solution retenue pour cette affectation. */
  solution: SolutionJs;
  /**
   * JS source figée pour libérer l'agent affecté.
   * null si ajustement === 'AUCUN' (aucun figeage).
   */
  jsSourceFigee: JsSourceFigee | null;
  /** Détail complet des règles évaluées lors de l'analyse de mobilisabilité */
  detail?: DetailCalcul;
  /**
   * Chaîne de remplacement appliquée pour cette affectation (mode Cascade).
   * null si l'agent était directement disponible ou figé.
   * Renseigné uniquement dans les scénarios `tousAgentsCascade*`.
   */
  chaineRemplacement: ChaineRemplacement | null;
  /**
   * Cascades alternatives non retenues — autres séquences d'agents capables
   * de résoudre les mêmes conflits induits. Chaque alternative correspond à
   * un agent N1 différent de la cascade principale.
   * Permet d'exposer plusieurs options au décideur (ex: Martin+Franz vs
   * Brouillat+Leguay pour un même repos insuffisant).
   */
  cascadeAlternatives?: CascadeAlternative[];
}

// ─── Conflit détecté dans le scénario global ─────────────────────────────────

export type TypeConflitMultiJs =
  | "CHEVAUCHEMENT_HORAIRE"
  | "AMPLITUDE_DEPASSEE"
  | "REPOS_JOURNALIER"
  | "GPT_MAX"
  | "TE_GPT"
  | "NUIT_CONSECUTIVES"
  | "PREFIXE_INTERDIT"
  | "HABILITATION_MANQUANTE"
  | "AUCUN_CANDIDAT";

export interface ConflitMultiJs {
  type: TypeConflitMultiJs;
  description: string;
  jsId?: string;
  agentId?: string;
  severity: "INFO" | "AVERTISSEMENT" | "BLOQUANT";
}

// ─── Récapitulatif par agent ──────────────────────────────────────────────────

export interface AffectationsParAgent {
  agentId: string;
  agentNom: string;
  agentPrenom: string;
  agentMatricule: string;
  agentReserve: boolean;
  jsAssignees: AffectationJs[];
  nbJs: number;
  conformiteGlobale: "CONFORME" | "VIGILANCE" | "NON_CONFORME";
}

// ─── Alternatives non retenues ───────────────────────────────────────────────

/**
 * Type de solution d'un agent alternatif.
 * Reflète comment il aurait pu couvrir la JS s'il avait été retenu.
 */
export type TypeSolutionAlternative = "DIRECT" | "VIGILANCE" | "CASCADE" | "FIGEAGE" | "CHAINE";

/**
 * Un agent candidat évalué et non retenu pour une JS donnée.
 */
export interface AlternativeJs {
  rang: number;
  agentId: string;
  nom: string;
  prenom: string;
  matricule: string;
  agentReserve: boolean;
  /** Statut RH issu de l'évaluation de mobilisabilité */
  statut: "DIRECT" | "VIGILANCE";
  score: number;
  /** Nature de la solution que cet agent aurait représentée */
  typeSolution: TypeSolutionAlternative;
  /** Raison métier expliquant pourquoi cet agent n'a pas été retenu */
  raisonNonRetention: string;
  /** Motif principal de l'évaluation (issu de evaluerMobilisabilite) */
  motif: string;
  conflitsInduits: import("./js-simulation").ConflitInduit[];
  jsSourceFigee: import("./js-simulation").JsSourceFigee | null;
  detail?: import("./simulation").DetailCalcul;
  /**
   * Chaîne cascade pré-calculée pour les alternatives de type CASCADE.
   * Montre quels agents résoudraient les conflits induits si cet agent était retenu.
   * Absent pour DIRECT, VIGILANCE et FIGEAGE.
   */
  cascadeResolution?: {
    modifications: import("./js-simulation").ModificationPlanning[];
    impacts: import("./js-simulation").ImpactCascade[];
    nbResolu: number;
  };
  /**
   * Cascades alternatives non retenues pour cet agent — autres séquences
   * d'agents capables de résoudre les mêmes conflits induits.
   * Présent uniquement pour les alternatives de type CASCADE.
   */
  cascadeAlternatives?: CascadeAlternative[];
  /**
   * Chaîne de remplacement proposée pour les alternatives de type CHAINE.
   * Présente quand l'agent était exclu pour CONFLIT_HORAIRE mais qu'une chaîne
   * de remplacement aurait pu le libérer (mode Cascade). Affichée en plan B
   * dans l'onglet Alternatives, même si la JS est déjà couverte autrement.
   */
  chaineRemplacementProposee?: ChaineRemplacement;
}

/**
 * Alternatives par JS : candidats valides non retenus pour chaque JS cible,
 * avec explication métier de leur non-sélection.
 */
export interface AlternativesParJs {
  jsId: string;
  codeJs: string | null;
  date: string;
  heureDebut: string;
  heureFin: string;
  /** Agent effectivement retenu (null si JS non couverte) */
  agentAffecte: {
    agentId: string;
    nom: string;
    prenom: string;
    matricule: string;
    score: number;
    statut: "DIRECT" | "VIGILANCE";
  } | null;
  alternatives: AlternativeJs[];
}

// ─── Scénario global ─────────────────────────────────────────────────────────

export type RobustesseScenario = "HAUTE" | "MOYENNE" | "FAIBLE";

/**
 * Exclusion enrichie avec les informations nominatives de l'agent.
 * Étend Exclusion (agentId, jsId, raison, regle, niveau) avec les
 * champs d'affichage nécessaires dans l'UI.
 */
export interface MultiJsExclusion extends Exclusion {
  agentNom: string;
  agentPrenom: string;
  agentMatricule: string;
}

/**
 * Exclusions tracées par JS dans un scénario multi-JS.
 * Permet de comprendre pourquoi chaque agent a été écarté pour chaque JS.
 */
export interface ExclusionsParJs {
  /** planningLigneId de la JS concernée */
  jsId: string;
  /** Code lisible de la JS (ex: "GIV001") */
  codeJs: string | null;
  /** Date de la JS (YYYY-MM-DD) */
  date: string;
  /** Horaire de la JS */
  heureDebut: string;
  heureFin: string;
  /** Agents exclus avec leur raison structurée et informations nominatives */
  exclusions: MultiJsExclusion[];
}

// ─── Solveur unifié : exposition UI sous feature flag ────────────────────────

/**
 * Vue UI d'une solution unifiée (sortie du solveur unified). Aplatissement
 * post-ordre de la chaîne pour faciliter le rendu : feuilles d'abord, racine
 * en dernier. Le `niveauRisque` permet à l'UI de filtrer/regrouper.
 */
export interface UnifiedSolutionUI {
  /** Identifiant de l'agent racine (= N1 = qui prend l'imprévu). */
  n1AgentId: string;
  n1Nom: string;
  n1Prenom: string;
  /** Profondeur effective de la chaîne (1 = direct, ≥ 2 = cascade). */
  profondeur: number;
  /** Niveau de risque agrégé : OK / VIGILANCE / DECONSEILLEE / INCOMPLETE. */
  niveauRisque: "OK" | "VIGILANCE" | "DECONSEILLEE" | "INCOMPLETE";
  /** Aplatissement DFS post-ordre : feuilles → racine. */
  chaine: Array<{
    agentId: string;
    agentNom: string;
    agentPrenom: string;
    jsCode: string | null;
    jsDate: string;
    jsHoraires: string;
    /** Type de besoin : RACINE = imprévu, sinon catégorie de la conséquence. */
    consequenceType: string;
    statut: "DIRECT" | "VIGILANCE";
    score: number;
  }>;
}

/**
 * Résultat unifié pour une JS donnée — analogue de `AlternativesParJs` mais
 * issu du solveur unified. Présent uniquement quand FEATURE_UNIFIED_PRIMARY
 * est activé.
 */
export interface UnifiedJsAnalyseUI {
  jsId: string;
  jsCode: string | null;
  jsDate: string;
  jsHoraires: string;
  /** Référence au candidat retenu par le legacy pour cette JS — sert à l'UI
   *  pour afficher la comparaison "le legacy dit X, l'unified dit Y". */
  legacyAgentRetenu: string | null;
  legacyStatut: string | null;
  /** Solutions ordonnées par score décroissant (meilleure en premier). */
  solutions: UnifiedSolutionUI[];
  /** Budget consommé pour cette JS (audit / debug). */
  budgetConsomme: number;
  /** Renseigné si aucune solution trouvée. */
  raisonSiVide?: string;
}

/**
 * Résultat d'une séquence forcée (test "possible / impossible / raison").
 * Renseigné uniquement si une séquence cible a été testée.
 */
export interface SequenceForceeUI {
  possible: boolean;
  synthese: string;
  etapeEchec: number;
  trace: Array<{
    numero: number;
    agentNom: string;
    besoinCode: string | null;
    besoinDate: string | null;
    besoinHoraires: string | null;
    faisable: boolean;
    statut?: string;
    raisonEchec?: string;
    consequences: Array<{
      type: string;
      code: string | null;
      date: string;
      horaires: string;
    }>;
  }>;
}

/**
 * Rapport unifié exposé à l'UI quand FEATURE_UNIFIED_PRIMARY est actif.
 * Aucun impact sur le legacy — l'UI affiche ce rapport dans un onglet
 * dédié, marqué "expérimental".
 */
export interface UnifiedReportUI {
  /** Données par JS (analogue de alternativesParJs). */
  jsAnalyses: UnifiedJsAnalyseUI[];
  /** Agrégat global pour comparaison rapide legacy ↔ unified. */
  agregat: {
    nbN1Match: number;
    nbUnifiedSeul: number;
    nbLegacySeul: number;
    nbSequenceCibleTrouvee: number;
    budgetTotal: number;
  };
  /** Test de séquence forcée (ex: Chennouf → Brouillat → Leguay). */
  sequenceForceeResultat?: SequenceForceeUI;
}

export interface MultiJsScenario {
  id: string;
  titre: string;
  description: string;
  score: number;
  candidateScope: CandidateScope;
  affectations: AffectationJs[];
  jsNonCouvertes: JsCible[];
  affectationsParAgent: AffectationsParAgent[];
  conflitsDetectes: ConflitMultiJs[];
  nbJsCouvertes: number;
  nbJsNonCouvertes: number;
  nbAgentsMobilises: number;
  robustesse: RobustesseScenario;
  tauxCouverture: number; // 0-100 %
  /** Nombre total de conflits induits résolus en cascade sur toutes les affectations */
  nbCascadesResolues: number;
  /** Nombre total de conflits induits non résolus malgré cascade sur toutes les affectations */
  nbCascadesNonResolues: number;
  /**
   * Exclusions tracées par JS — aucune exclusion silencieuse.
   * Permet d'expliquer à l'utilisateur pourquoi chaque agent a été écarté.
   */
  exclusionsParJs: ExclusionsParJs[];
  /**
   * Alternatives non retenues par JS : candidats valides écartés au profit
   * du retenu, avec raison métier. Permet de reproduire la lisibilité de la PJ.
   */
  alternativesParJs: AlternativesParJs[];
  /**
   * Rapport du solveur unifié (FEATURE_UNIFIED_PRIMARY uniquement).
   * Exposé pour comparaison côté UI sans modifier les autres champs.
   */
  unifiedReport?: UnifiedReportUI;
}

// ─── Résultat global de la simulation multi-JS ───────────────────────────────

export interface MultiJsSimulationResultat {
  jsSelectionnees: JsCible[];
  nbJsSelectionnees: number;
  scenarios: MultiJsScenario[];
  /** Meilleur scénario (score le plus élevé) */
  scenarioMeilleur: MultiJsScenario | null;
  /** Scénario réserve uniquement, sans figeage */
  scenarioReserveOnly: MultiJsScenario | null;
  /** Scénario réserve uniquement, avec figeage DERNIER_RECOURS */
  scenarioReserveOnlyFigeage: MultiJsScenario | null;
  /** Scénario réserve uniquement avec chaînes de remplacement (mode Cascade). */
  scenarioReserveOnlyCascade: MultiJsScenario | null;
  /** Scénario réserve uniquement combinant chaînes de remplacement et figeage. */
  scenarioReserveOnlyCascadeFigeage: MultiJsScenario | null;
  /** Scénario tous agents, sans figeage */
  scenarioTousAgents: MultiJsScenario | null;
  /** Scénario tous agents, avec figeage DERNIER_RECOURS */
  scenarioTousAgentsFigeage: MultiJsScenario | null;
  /** Scénario tous agents avec chaînes de remplacement (mode Cascade). */
  scenarioTousAgentsCascade: MultiJsScenario | null;
  /** Scénario tous agents combinant chaînes de remplacement et figeage DERNIER_RECOURS. */
  scenarioTousAgentsCascadeFigeage: MultiJsScenario | null;
  /** Nombre total d'agents analysés */
  nbAgentsAnalyses: number;
  /**
   * Traces horodatées de toutes les décisions du moteur multi-JS.
   * Utile pour l'audit post-événement et le debug.
   */
  auditLog: LogEntry[];
}

// ─── Ligne JS pour l'affichage timeline ──────────────────────────────────────

export interface JsTimeline {
  planningLigneId: string;
  importId: string;
  date: string;            // "YYYY-MM-DD"
  heureDebut: string;      // horaires du planning de l'agent (peuvent inclure son trajet)
  heureFin: string;
  /** Propagé depuis JsType.flexibilite. Optionnel en Phase 1 — défaut OBLIGATOIRE si absent. */
  flexibilite?: FlexibiliteJs;
  /** Horaires standard du JsType de référence (indépendants du trajet de l'agent initial) */
  heureDebutJsType?: string; // "HH:MM"
  heureFinJsType?: string;   // "HH:MM"
  amplitudeMin: number;
  codeJs: string | null;
  typeJs: string | null;
  isNuit: boolean;
  isZ: boolean;            // JS sans charge réelle
  agentId: string | null;
  agentNom: string;
  agentPrenom: string;
  agentMatricule: string;
  posteAffectation: string | null;
  uch: string | null;
  numeroJs: string | null;
  prefixeJs: string | null;  // ex: "GIV", "GIC", "PEY"
  /** JsType.libelle résolu — ex: "Garde Itinérante Voie". Null si type inconnu. */
  libelle: string | null;
}
