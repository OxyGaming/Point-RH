/**
 * Règles de travail ferroviaires — Module de configuration centrale
 *
 * Toutes les durées sont en HEURES (float), sauf :
 *   - pause.supplementSansCoupure : en MINUTES
 *   - gpt.* : en JOURS
 *
 * ─── État d'implémentation ────────────────────────────────────────────────────
 * ✅ Amplitude par type de poste (général, déplacement, nuit, réserve)
 * ✅ Travail effectif max/min (standard, nuit, supplément remplacé, GPT)
 * ✅ Repos journalier standard (12h) et réduit réserve (10h)
 * ✅ Repos journalier étendu après poste de nuit (14h) — CORRIGÉ
 * ✅ Repos périodique (simple 36h, double 60h, triple 84h)
 * ✅ GPT max 6 jours, max avant RP 5 jours
 * ✅ Pas 2 GPT de nuit consécutives
 * ✅ Supplément RJ +20 min si TE > 6h sans coupure (sauf nuit)
 * ✅ Amplitude nuit : 11h général (CORRIGÉ — ancien code appliquait 13h)
 * ✅ TE max nuit 8h30 distinct du cas remplacement (CORRIGÉ)
 *
 * ⚠️  Coupure en plage [11h-14h] / [18h-21h] : valeur configurée, non évaluée
 * ⚠️  GPT min dimanche (2 jours si accord agent) : valeur configurée, non évaluée
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Configuration par défaut (heures) ───────────────────────────────────────

export const DEFAULT_WORK_RULES = {
  amplitude: {
    general: 11,                 // h — cas général
    deplacement: 12,             // h — déplacement sans remplacement
    deplacementRemplacement: 13, // h — déplacement avec remplacement
    journeeIsoleeTransport: 13,  // h — journée isolée + transport commun
    nuit: 11,                    // h — poste de nuit, cas général
    nuitReserve: 10.5,           // h — poste de nuit, agent de réserve
  },
  travailEffectif: {
    max: 10,                     // h — maximum standard et journée isolée
    supplementRemplace: 2,       // h — supplément DJS agent remplacé (+2h → 12h max)
    nuit: 8.5,                   // h — poste de nuit
    maxGPT: 48,                  // h — cumul maximum par GPT
    minRegimeBC: 5.5,            // h — minimum régimes B et C
  },
  reposJournalier: {
    standard: 12,                // h — repos journalier standard
    reduitReserve: 10,           // h — réduit pour agent de réserve en remplacement (1× par GPT)
    apresNuit: 14,               // h — après poste de nuit
  },
  reposPeriodique: {
    simple: 36,                  // h — RP simple
    double: 60,                  // h — RP double
    triple: 84,                  // h — RP triple
  },
  pause: {
    min: 1,                      // h — coupure minimale
    supplementSansCoupure: 20,   // min — supplément RJ si TE > seuil sans coupure
    seuilTE: 6,                  // h — seuil TE déclenchant le supplément
  },
  gpt: {
    min: 3,                      // jours — GPT minimum
    minDimanche: 2,              // jours — GPT minimum si RP simple dimanche + accord
    max: 6,                      // jours — GPT maximum
    maxAvantRP: 5,               // jours — GPT max si suivi d'un RP simple
  },
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkRules = {
  amplitude: {
    general: number;
    deplacement: number;
    deplacementRemplacement: number;
    journeeIsoleeTransport: number;
    nuit: number;
    nuitReserve: number;
  };
  travailEffectif: {
    max: number;
    supplementRemplace: number;
    nuit: number;
    maxGPT: number;
    minRegimeBC: number;
  };
  reposJournalier: {
    standard: number;
    reduitReserve: number;
    apresNuit: number;
  };
  reposPeriodique: {
    simple: number;
    double: number;
    triple: number;
  };
  pause: {
    min: number;
    supplementSansCoupure: number;
    seuilTE: number;
  };
  gpt: {
    min: number;
    minDimanche: number;
    max: number;
    maxAvantRP: number;
  };
};

/** Valeurs converties en minutes pour le moteur de règles */
export interface WorkRulesMinutes {
  amplitude: {
    general: number;
    deplacement: number;
    deplacementRemplacement: number;
    journeeIsoleeTransport: number;
    nuit: number;
    nuitReserve: number;
  };
  travailEffectif: {
    max: number;
    supplementRemplace: number;
    nuit: number;
    maxGPT: number;
    minRegimeBC: number;
  };
  reposJournalier: {
    standard: number;
    reduitReserve: number;
    apresNuit: number;
  };
  reposPeriodique: {
    simple: number;
    double: number;
    triple: number;
  };
  pause: {
    min: number;
    supplementSansCoupure: number; // déjà en minutes
    seuilTE: number;
  };
  gpt: {
    min: number;      // jours
    minDimanche: number;
    max: number;
    maxAvantRP: number;
  };
}

// ─── Conversion heures → minutes ─────────────────────────────────────────────

function h(hours: number): number {
  return Math.round(hours * 60);
}

export function rulesHeuresToMinutes(rules: WorkRules): WorkRulesMinutes {
  return {
    amplitude: {
      general: h(rules.amplitude.general),
      deplacement: h(rules.amplitude.deplacement),
      deplacementRemplacement: h(rules.amplitude.deplacementRemplacement),
      journeeIsoleeTransport: h(rules.amplitude.journeeIsoleeTransport),
      nuit: h(rules.amplitude.nuit),
      nuitReserve: h(rules.amplitude.nuitReserve),
    },
    travailEffectif: {
      max: h(rules.travailEffectif.max),
      supplementRemplace: h(rules.travailEffectif.supplementRemplace),
      nuit: h(rules.travailEffectif.nuit),
      maxGPT: h(rules.travailEffectif.maxGPT),
      minRegimeBC: h(rules.travailEffectif.minRegimeBC),
    },
    reposJournalier: {
      standard: h(rules.reposJournalier.standard),
      reduitReserve: h(rules.reposJournalier.reduitReserve),
      apresNuit: h(rules.reposJournalier.apresNuit),
    },
    reposPeriodique: {
      simple: h(rules.reposPeriodique.simple),
      double: h(rules.reposPeriodique.double),
      triple: h(rules.reposPeriodique.triple),
    },
    pause: {
      min: h(rules.pause.min),
      supplementSansCoupure: rules.pause.supplementSansCoupure, // déjà en minutes
      seuilTE: h(rules.pause.seuilTE),
    },
    gpt: {
      min: rules.gpt.min,
      minDimanche: rules.gpt.minDimanche,
      max: rules.gpt.max,
      maxAvantRP: rules.gpt.maxAvantRP,
    },
  };
}

export const DEFAULT_WORK_RULES_MINUTES: WorkRulesMinutes =
  rulesHeuresToMinutes(DEFAULT_WORK_RULES);

// ─── Métadonnées pour l'UI ────────────────────────────────────────────────────

export interface RuleMetadata {
  category: string;
  label: string;
  unit: "h" | "min" | "jours";
  defaultValue: number;
  description?: string;
}

export const WORK_RULES_METADATA: Record<string, RuleMetadata> = {
  "amplitude.general": {
    category: "amplitude",
    label: "Amplitude cas général",
    unit: "h",
    defaultValue: DEFAULT_WORK_RULES.amplitude.general,
  },
  "amplitude.deplacement": {
    category: "amplitude",
    label: "Amplitude déplacement (sans remplacement)",
    unit: "h",
    defaultValue: DEFAULT_WORK_RULES.amplitude.deplacement,
  },
  "amplitude.deplacementRemplacement": {
    category: "amplitude",
    label: "Amplitude déplacement avec remplacement",
    unit: "h",
    defaultValue: DEFAULT_WORK_RULES.amplitude.deplacementRemplacement,
  },
  "amplitude.journeeIsoleeTransport": {
    category: "amplitude",
    label: "Amplitude journée isolée + transport commun",
    unit: "h",
    defaultValue: DEFAULT_WORK_RULES.amplitude.journeeIsoleeTransport,
  },
  "amplitude.nuit": {
    category: "amplitude",
    label: "Amplitude poste de nuit (cas général)",
    unit: "h",
    defaultValue: DEFAULT_WORK_RULES.amplitude.nuit,
  },
  "amplitude.nuitReserve": {
    category: "amplitude",
    label: "Amplitude poste de nuit (agent de réserve)",
    unit: "h",
    defaultValue: DEFAULT_WORK_RULES.amplitude.nuitReserve,
  },
  "travailEffectif.max": {
    category: "travailEffectif",
    label: "TE maximum (standard / journée isolée)",
    unit: "h",
    defaultValue: DEFAULT_WORK_RULES.travailEffectif.max,
  },
  "travailEffectif.supplementRemplace": {
    category: "travailEffectif",
    label: "Supplément TE — DJS agent remplacé",
    unit: "h",
    defaultValue: DEFAULT_WORK_RULES.travailEffectif.supplementRemplace,
    description: "+2h ajoutées au max TE pour le DJS de l'agent remplacé",
  },
  "travailEffectif.nuit": {
    category: "travailEffectif",
    label: "TE maximum poste de nuit",
    unit: "h",
    defaultValue: DEFAULT_WORK_RULES.travailEffectif.nuit,
  },
  "travailEffectif.maxGPT": {
    category: "travailEffectif",
    label: "TE maximum par GPT",
    unit: "h",
    defaultValue: DEFAULT_WORK_RULES.travailEffectif.maxGPT,
  },
  "travailEffectif.minRegimeBC": {
    category: "travailEffectif",
    label: "TE minimum régimes B et C",
    unit: "h",
    defaultValue: DEFAULT_WORK_RULES.travailEffectif.minRegimeBC,
  },
  "reposJournalier.standard": {
    category: "reposJournalier",
    label: "Repos journalier standard",
    unit: "h",
    defaultValue: DEFAULT_WORK_RULES.reposJournalier.standard,
  },
  "reposJournalier.reduitReserve": {
    category: "reposJournalier",
    label: "Repos journalier réduit (réserve + remplacement)",
    unit: "h",
    defaultValue: DEFAULT_WORK_RULES.reposJournalier.reduitReserve,
    description: "Applicable une fois par GPT",
  },
  "reposJournalier.apresNuit": {
    category: "reposJournalier",
    label: "Repos journalier après poste de nuit",
    unit: "h",
    defaultValue: DEFAULT_WORK_RULES.reposJournalier.apresNuit,
  },
  "reposPeriodique.simple": {
    category: "reposPeriodique",
    label: "RP simple",
    unit: "h",
    defaultValue: DEFAULT_WORK_RULES.reposPeriodique.simple,
  },
  "reposPeriodique.double": {
    category: "reposPeriodique",
    label: "RP double",
    unit: "h",
    defaultValue: DEFAULT_WORK_RULES.reposPeriodique.double,
  },
  "reposPeriodique.triple": {
    category: "reposPeriodique",
    label: "RP triple",
    unit: "h",
    defaultValue: DEFAULT_WORK_RULES.reposPeriodique.triple,
  },
  "pause.min": {
    category: "pause",
    label: "Coupure minimum",
    unit: "h",
    defaultValue: DEFAULT_WORK_RULES.pause.min,
  },
  "pause.supplementSansCoupure": {
    category: "pause",
    label: "Supplément RJ si TE > seuil sans coupure",
    unit: "min",
    defaultValue: DEFAULT_WORK_RULES.pause.supplementSansCoupure,
  },
  "pause.seuilTE": {
    category: "pause",
    label: "Seuil TE déclenchant le supplément de pause",
    unit: "h",
    defaultValue: DEFAULT_WORK_RULES.pause.seuilTE,
  },
  "gpt.min": {
    category: "gpt",
    label: "GPT minimum",
    unit: "jours",
    defaultValue: DEFAULT_WORK_RULES.gpt.min,
  },
  "gpt.minDimanche": {
    category: "gpt",
    label: "GPT minimum (RP simple dimanche + accord agent)",
    unit: "jours",
    defaultValue: DEFAULT_WORK_RULES.gpt.minDimanche,
  },
  "gpt.max": {
    category: "gpt",
    label: "GPT maximum",
    unit: "jours",
    defaultValue: DEFAULT_WORK_RULES.gpt.max,
  },
  "gpt.maxAvantRP": {
    category: "gpt",
    label: "GPT maximum avant RP simple",
    unit: "jours",
    defaultValue: DEFAULT_WORK_RULES.gpt.maxAvantRP,
  },
};

export const CATEGORY_LABELS: Record<string, string> = {
  amplitude: "Amplitude",
  travailEffectif: "Travail effectif",
  reposJournalier: "Repos journalier",
  reposPeriodique: "Repos périodique",
  pause: "Pause / Coupure",
  gpt: "GPT — Grande Période de Travail",
};

