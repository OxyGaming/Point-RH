/**
 * Types fondamentaux du moteur de règles — partagés entre tous les modules.
 *
 * Ces types garantissent qu'aucune exclusion ou violation n'est silencieuse :
 * chaque décision négative du moteur doit produire un objet structuré.
 */

// ─── Niveaux de règle ─────────────────────────────────────────────────────────

/**
 * BLOQUANT  : l'agent ne peut pas effectuer la JS — exclusion immédiate.
 * VIGILANCE : l'agent peut effectuer la JS mais avec des réserves — pénalité de score.
 */
export type NiveauRegle = 'BLOQUANT' | 'VIGILANCE';

// ─── Exclusion structurée ─────────────────────────────────────────────────────

/**
 * Produite chaque fois qu'un agent est exclu d'une JS, quelle qu'en soit la raison.
 * Aucune exclusion silencieuse : tout `continue` ou filtre doit produire cet objet.
 */
export interface Exclusion {
  /** Identifiant de l'agent exclu */
  agentId: string;
  /** planningLigneId de la JS concernée */
  jsId: string;
  /** Message lisible expliquant l'exclusion */
  raison: string;
  /** Code de la règle ayant déclenché l'exclusion */
  regle: string;
  /** Niveau : toujours BLOQUANT pour une exclusion */
  niveau: NiveauRegle;
}

// ─── Résultat d'évaluation de règle ──────────────────────────────────────────

/**
 * Résultat retourné par l'évaluation d'une règle individuelle.
 * Permet d'unifier le format entre moteur simple et moteur multiple.
 */
export interface ResultatRegle {
  regle: string;
  ok: boolean;
  niveau: NiveauRegle;
  description: string;
  valeur?: string | number;
  limite?: string | number;
  /** Données calculées (ex: repos effectif, amplitude, GPT count) */
  data?: Record<string, unknown>;
}

// ─── Codes de règles (registre centralisé) ───────────────────────────────────

/**
 * Codes de règles reconnus par le moteur.
 * Toute règle non listée ici doit être ajoutée avant implémentation.
 *
 * BLOQUANT par nature (NON_CONFORME si violée) :
 *   REPOS_JOURNALIER, AMPLITUDE, PREFIXE_JS,
 *   NUIT_HABILITATION, DEPLACEMENT_HABILITATION,
 *   GPT_MAX, TE_GPT_48H, TRAVAIL_EFFECTIF,
 *   TRAJET_ABSENT
 *
 * VIGILANCE par nature (score pénalisé, agent toujours mobilisable) :
 *   GPT_MIN, GPT_MAX_AVANT_RP, GPT_NUIT_CONSECUTIVES,
 *   MIN_REGIME_BC, CONGES_EN_GPT
 */
export type CodeRegle =
  | 'REPOS_JOURNALIER'
  | 'AMPLITUDE'
  | 'PREFIXE_JS'
  | 'NUIT_HABILITATION'
  | 'DEPLACEMENT_HABILITATION'
  | 'GPT_MAX'
  | 'TE_GPT_48H'
  | 'TRAVAIL_EFFECTIF'
  | 'TRAJET_ABSENT'
  | 'GPT_MIN'
  | 'GPT_MAX_AVANT_RP'
  | 'GPT_NUIT_CONSECUTIVES'
  | 'MIN_REGIME_BC'
  | 'CONGES_EN_GPT'
  | 'HABILITATION'          // préfiltrage générique
  | 'ABSENCE_INAPTITUDE'    // NPO exclu
  | 'CONFLIT_HORAIRE'       // déjà en service
  | 'SCOPE_RESERVE';        // hors périmètre réserve

/**
 * Règles dont la violation seule suffit à rendre le statut NON_CONFORME.
 * Toute règle absente de cette liste avec une seule violation → VIGILANCE.
 */
export const REGLES_BLOQUANTES: CodeRegle[] = [
  'REPOS_JOURNALIER',
  'AMPLITUDE',
  'PREFIXE_JS',
  'NUIT_HABILITATION',
  'DEPLACEMENT_HABILITATION',
  'GPT_MAX',
  'TE_GPT_48H',
  'TRAVAIL_EFFECTIF',
  'TRAJET_ABSENT',
];

// ─── Règles configurées mais non évaluées automatiquement ────────────────────

/**
 * Liste des règles CONFIGURÉES en base (WorkRule) mais dont l'évaluation
 * automatique n'est PAS implémentée dans le moteur.
 *
 * Pour chacune : raison de non-implémentation + comportement actuel.
 *
 * ┌─────────────────────────────┬──────────────────────────────────────────────┐
 * │ Règle                       │ Raison / Comportement actuel                  │
 * ├─────────────────────────────┼──────────────────────────────────────────────┤
 * │ gpt.minDimanche             │ Nécessite de connaître le jour du prochain RP │
 * │                             │ et l'accord de l'agent. Non disponible en     │
 * │                             │ simulation. → VIGILANCE nuancée si 2 ≤ GPT<3 │
 * ├─────────────────────────────┼──────────────────────────────────────────────┤
 * │ pause.coupurePlage          │ Nécessite les horaires de coupure interne de  │
 * │ ([11h-14h] / [18h-21h])     │ la JS. Non disponible dans PlanningEvent.     │
 * │                             │ → VIGILANCE générique si amplitude > 6h      │
 * └─────────────────────────────┴──────────────────────────────────────────────┘
 *
 * Toute règle listée ici DOIT produire un pointsVigilance explicite dans
 * engine/rules.ts pour informer l'opérateur.
 */
export const REGLES_NON_IMPLEMENTEES = [
  {
    code:            'GPT_MIN_DIMANCHE',
    configKey:       'gpt.minDimanche',
    raison:          'Jour du prochain RP et accord agent non disponibles en simulation',
    comportement:    'Vigilance nuancée générée si GPT entre minDimanche et min',
  },
  {
    code:            'COUPURE_EN_PLAGE',
    configKey:       'pause.coupurePlage',
    raison:          'Données de coupure interne non présentes dans PlanningEvent',
    comportement:    'Vigilance générique générée si amplitude > seuilTE',
  },
] as const;
