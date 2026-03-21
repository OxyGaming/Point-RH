/**
 * Types métier pour la gestion du déplacement LPA
 *
 * Le déplacement est calculé dynamiquement à partir de :
 *  – la LPA de base de l'agent (Lieu de Prise d'Attachement)
 *  – la table LpaJsType (correspondance LPA ↔ JsType)
 *  – les règles spécifiques agent (AgentJsDeplacementRule)
 *
 * Toutes les durées sont en MINUTES.
 */

// ─── Données LPA (contexte chargé depuis la base) ─────────────────────────────

export interface LpaData {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
  /** Ensemble des jsTypeId associés à cette LPA (via LpaJsType) */
  jsTypeIds: Set<string>;
}

export interface JsTypeData {
  id: string;
  code: string;
  libelle: string;
  heureDebutStandard: string; // "HH:MM"
  heureFinStandard: string;   // "HH:MM"
  dureeStandard: number;      // minutes
  estNuit: boolean;
  regime: string | null;
  actif: boolean;
}

export interface AgentDeplacementRuleData {
  id: string;
  agentId: string;
  jsTypeId: string | null;
  prefixeJs: string | null;
  horsLpa: boolean | null;   // override : force JS hors/dans LPA
  tempsTrajetAllerMinutes: number;
  tempsTrajetRetourMinutes: number;
  actif: boolean;
}

/** Contexte LPA pré-chargé depuis la base, passé à computeEffectiveService */
export interface LpaContext {
  lpas: LpaData[];
  jsTypes: JsTypeData[];
  /** agentId → liste de règles déplacement de cet agent */
  agentRulesMap: Map<string, AgentDeplacementRuleData[]>;
}

// ─── Résultat du calcul de service effectif ───────────────────────────────────

export type RegimeRH =
  | "general"
  | "deplacement"
  | "deplacementRemplacement"
  | "nuit";

export interface EffectiveServiceInfo {
  /** ID du JsType reconnu (null = non trouvé dans le référentiel) */
  jsTypeId: string | null;
  /** Code du JsType reconnu (null = non trouvé) */
  jsTypeCode: string | null;
  /** Libellé du JsType reconnu (null = non trouvé) */
  jsTypeLibelle: string | null;
  /** ID de la LPA de l'agent (null = non configurée) */
  lpaId: string | null;
  /** La JS est dans la LPA de l'agent (null = indéterminable) */
  jsDansLpa: boolean | null;
  /**
   * L'agent est effectivement en déplacement (null = indéterminable).
   * true  : JS hors LPA + agent autorisé
   * false : JS dans LPA, ou agent non autorisé
   */
  estEnDeplacement: boolean | null;
  /** Temps de trajet aller en minutes (0 si pas de déplacement) */
  tempsTrajetAllerMin: number;
  /** Temps de trajet retour en minutes (0 si pas de déplacement) */
  tempsTrajetRetourMin: number;
  /**
   * Horaire de référence de la JS (= JsType.heureDebutStandard si JsType trouvé,
   * sinon heureDebut du planning).
   * C'est la base avant ajout du trajet.
   */
  heureDebutReference: string;   // "HH:MM"
  heureFinReference: string;     // "HH:MM"
  /** Heure de début effective (= heureDebutReference − tempsAller si déplacement) */
  heureDebutEffective: string;   // "HH:MM"
  /** Heure de fin effective (= heureFinReference + tempsRetour si déplacement) */
  heureFinEffective: string;     // "HH:MM"
  /** Amplitude totale incluant temps de trajet (en minutes) */
  amplitudeEffectiveMin: number;
  /** Régime RH déterminé */
  regimeRH: RegimeRH;
  /** Impossible à calculer (LPA non configurée, JS inconnue, règle absente) */
  indeterminable: boolean;
  /** Raison d'indétermination (affiché "Indéterminable" dans l'UI) */
  raisonIndeterminable?: string;
  /** Explication textuelle complète du calcul */
  explication: string;
}
