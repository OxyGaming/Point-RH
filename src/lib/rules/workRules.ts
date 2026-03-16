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
  periodeNocturne: {
    debutSoir: 21.5,   // h — début plage nocturne (21h30)
    finMatin: 6.5,     // h — fin plage nocturne (06h30)
    seuilJsNuit: 2.5,  // h — chevauchement minimum pour qualifier une JS de "nuit"
    seuilGptNuit: 4,   // h — fenêtre [00h → X] pour qualifier une GPT de "nuit"
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
  periodeNocturne: {
    debutSoir: number;
    finMatin: number;
    seuilJsNuit: number;
    seuilGptNuit: number;
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
  periodeNocturne: {
    debutSoir: number;    // minutes — début plage nocturne (1290 = 21h30)
    finMatin: number;     // minutes — fin plage nocturne (390 = 06h30)
    seuilJsNuit: number;  // minutes — seuil chevauchement pour JS de nuit (150 = 2h30)
    seuilGptNuit: number; // minutes — borne fenêtre GPT nuit (240 = 04h00)
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
    periodeNocturne: {
      debutSoir: h(rules.periodeNocturne.debutSoir),
      finMatin: h(rules.periodeNocturne.finMatin),
      seuilJsNuit: h(rules.periodeNocturne.seuilJsNuit),
      seuilGptNuit: h(rules.periodeNocturne.seuilGptNuit),
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
  min?: number;
  max?: number;
  step?: number;
}

export const WORK_RULES_METADATA: Record<string, RuleMetadata> = {
  // ── Amplitude ────────────────────────────────────────────────────────────────
  "amplitude.general": {
    category: "amplitude", label: "Amplitude cas général", unit: "h",
    defaultValue: DEFAULT_WORK_RULES.amplitude.general,
    description: "Durée maximale d'une journée de service (prise de service → fin). Applicable aux postes standards.",
    min: 8, max: 15, step: 0.5,
  },
  "amplitude.deplacement": {
    category: "amplitude", label: "Amplitude déplacement (sans remplacement)", unit: "h",
    defaultValue: DEFAULT_WORK_RULES.amplitude.deplacement,
    description: "Amplitude maximale lors d'un déplacement hors remplacement d'un agent absent.",
    min: 8, max: 15, step: 0.5,
  },
  "amplitude.deplacementRemplacement": {
    category: "amplitude", label: "Amplitude déplacement avec remplacement", unit: "h",
    defaultValue: DEFAULT_WORK_RULES.amplitude.deplacementRemplacement,
    description: "Amplitude maximale lors d'un déplacement combiné à un remplacement.",
    min: 8, max: 15, step: 0.5,
  },
  "amplitude.journeeIsoleeTransport": {
    category: "amplitude", label: "Amplitude journée isolée + transport commun", unit: "h",
    defaultValue: DEFAULT_WORK_RULES.amplitude.journeeIsoleeTransport,
    description: "Amplitude maximale pour une journée isolée intégrant un temps de transport en commun.",
    min: 8, max: 15, step: 0.5,
  },
  "amplitude.nuit": {
    category: "amplitude", label: "Amplitude poste de nuit (cas général)", unit: "h",
    defaultValue: DEFAULT_WORK_RULES.amplitude.nuit,
    description: "Amplitude maximale d'un poste chevauchant la plage nocturne (>2h30 de chevauchement).",
    min: 7, max: 13, step: 0.5,
  },
  "amplitude.nuitReserve": {
    category: "amplitude", label: "Amplitude poste de nuit (agent de réserve)", unit: "h",
    defaultValue: DEFAULT_WORK_RULES.amplitude.nuitReserve,
    description: "Amplitude maximale pour un agent de réserve effectuant un poste de nuit. Inférieure au cas général.",
    min: 7, max: 12, step: 0.5,
  },
  // ── Travail effectif ─────────────────────────────────────────────────────────
  "travailEffectif.max": {
    category: "travailEffectif", label: "TE maximum (standard / journée isolée)", unit: "h",
    defaultValue: DEFAULT_WORK_RULES.travailEffectif.max,
    description: "Durée de travail effectif maximale par journée de service (hors temps de transport et de présence passive).",
    min: 6, max: 12, step: 0.5,
  },
  "travailEffectif.supplementRemplace": {
    category: "travailEffectif", label: "Supplément TE — DJS agent remplacé", unit: "h",
    defaultValue: DEFAULT_WORK_RULES.travailEffectif.supplementRemplace,
    description: "Supplément de durée effective autorisé pour le DJS de l'agent remplacé. S'ajoute au TE max standard (+2h → 12h).",
    min: 0, max: 4, step: 0.5,
  },
  "travailEffectif.nuit": {
    category: "travailEffectif", label: "TE maximum poste de nuit", unit: "h",
    defaultValue: DEFAULT_WORK_RULES.travailEffectif.nuit,
    description: "Durée de travail effectif maximale pour un poste de nuit. Distincte du maximum de remplacement.",
    min: 6, max: 10, step: 0.5,
  },
  "travailEffectif.maxGPT": {
    category: "travailEffectif", label: "TE maximum par GPT", unit: "h",
    defaultValue: DEFAULT_WORK_RULES.travailEffectif.maxGPT,
    description: "Cumul maximal du travail effectif sur l'ensemble d'une Grande Période de Travail.",
    min: 24, max: 60, step: 1,
  },
  "travailEffectif.minRegimeBC": {
    category: "travailEffectif", label: "TE minimum régimes B et C", unit: "h",
    defaultValue: DEFAULT_WORK_RULES.travailEffectif.minRegimeBC,
    description: "Durée minimale de travail effectif imposée aux agents relevant des régimes B et C.",
    min: 3, max: 8, step: 0.5,
  },
  // ── Repos journalier ─────────────────────────────────────────────────────────
  "reposJournalier.standard": {
    category: "reposJournalier", label: "Repos journalier standard", unit: "h",
    defaultValue: DEFAULT_WORK_RULES.reposJournalier.standard,
    description: "Durée minimale de repos entre deux journées de service consécutives. Règle de base.",
    min: 10, max: 16, step: 0.5,
  },
  "reposJournalier.reduitReserve": {
    category: "reposJournalier", label: "Repos journalier réduit (réserve + remplacement)", unit: "h",
    defaultValue: DEFAULT_WORK_RULES.reposJournalier.reduitReserve,
    description: "Applicable une seule fois par GPT pour un agent de réserve assurant un remplacement. Doit être inférieur au repos standard.",
    min: 8, max: 13, step: 0.5,
  },
  "reposJournalier.apresNuit": {
    category: "reposJournalier", label: "Repos journalier après poste de nuit", unit: "h",
    defaultValue: DEFAULT_WORK_RULES.reposJournalier.apresNuit,
    description: "Repos minimum obligatoire après tout poste de nuit. Prioritaire sur le repos réduit réserve.",
    min: 12, max: 18, step: 0.5,
  },
  // ── Repos périodique ─────────────────────────────────────────────────────────
  "reposPeriodique.simple": {
    category: "reposPeriodique", label: "RP simple (RP1)", unit: "h",
    defaultValue: DEFAULT_WORK_RULES.reposPeriodique.simple,
    description: "Durée minimale d'un Repos Périodique simple. Seul un écart ≥ à cette valeur réinitialise la GPT.",
    min: 24, max: 48, step: 1,
  },
  "reposPeriodique.double": {
    category: "reposPeriodique", label: "RP double (RP2)", unit: "h",
    defaultValue: DEFAULT_WORK_RULES.reposPeriodique.double,
    description: "Durée minimale d'un Repos Périodique double. Obligatoire si la GPT dépasse le maximum autorisé avant RP simple.",
    min: 48, max: 84, step: 1,
  },
  "reposPeriodique.triple": {
    category: "reposPeriodique", label: "RP triple (RP3)", unit: "h",
    defaultValue: DEFAULT_WORK_RULES.reposPeriodique.triple,
    description: "Durée minimale d'un Repos Périodique triple.",
    min: 60, max: 120, step: 1,
  },
  // ── Pause / Coupure ──────────────────────────────────────────────────────────
  "pause.min": {
    category: "pause", label: "Coupure minimum", unit: "h",
    defaultValue: DEFAULT_WORK_RULES.pause.min,
    description: "Durée minimale d'une coupure accordée dans la journée de service.",
    min: 0, max: 4, step: 0.5,
  },
  "pause.supplementSansCoupure": {
    category: "pause", label: "Supplément RJ si TE > seuil sans coupure", unit: "min",
    defaultValue: DEFAULT_WORK_RULES.pause.supplementSansCoupure,
    description: "Minutes ajoutées au repos journalier minimum si le TE dépasse le seuil sans qu'une coupure ait été accordée.",
    min: 0, max: 60, step: 5,
  },
  "pause.seuilTE": {
    category: "pause", label: "Seuil TE déclenchant le supplément de pause", unit: "h",
    defaultValue: DEFAULT_WORK_RULES.pause.seuilTE,
    description: "Dès que le travail effectif dépasse ce seuil sans coupure, le supplément de repos journalier s'applique.",
    min: 3, max: 10, step: 0.5,
  },
  // ── GPT ──────────────────────────────────────────────────────────────────────
  "gpt.min": {
    category: "gpt", label: "GPT minimum", unit: "jours",
    defaultValue: DEFAULT_WORK_RULES.gpt.min,
    description: "Nombre minimum de journées de service dans une GPT avant qu'un Repos Périodique puisse intervenir.",
    min: 1, max: 6, step: 1,
  },
  "gpt.minDimanche": {
    category: "gpt", label: "GPT minimum (RP simple dimanche + accord agent)", unit: "jours",
    defaultValue: DEFAULT_WORK_RULES.gpt.minDimanche,
    description: "GPT minimum réduit applicable si le RP simple tombe un dimanche avec accord exprès de l'agent. Non évalué automatiquement.",
    min: 1, max: 4, step: 1,
  },
  "gpt.max": {
    category: "gpt", label: "GPT maximum", unit: "jours",
    defaultValue: DEFAULT_WORK_RULES.gpt.max,
    description: "Nombre maximum de journées de service dans une GPT. Toute simulation dépassant ce seuil génère un statut NON_CONFORME.",
    min: 3, max: 10, step: 1,
  },
  "gpt.maxAvantRP": {
    category: "gpt", label: "GPT maximum avant RP simple", unit: "jours",
    defaultValue: DEFAULT_WORK_RULES.gpt.maxAvantRP,
    description: "Au-delà de ce nombre de journées, le prochain repos périodique doit être au minimum un RP double. Génère un point de vigilance.",
    min: 2, max: 8, step: 1,
  },
  // ── Période nocturne ─────────────────────────────────────────────────────────
  "periodeNocturne.debutSoir": {
    category: "periodeNocturne", label: "Début plage nocturne", unit: "h",
    defaultValue: DEFAULT_WORK_RULES.periodeNocturne.debutSoir,
    description: "Heure à partir de laquelle une JS peut être qualifiée de poste de nuit si son chevauchement avec la plage [debutSoir–finMatin] est suffisant.",
    min: 18, max: 23, step: 0.5,
  },
  "periodeNocturne.finMatin": {
    category: "periodeNocturne", label: "Fin plage nocturne (matin)", unit: "h",
    defaultValue: DEFAULT_WORK_RULES.periodeNocturne.finMatin,
    description: "Heure de fin de la plage nocturne le lendemain matin. La plage est [debutSoir → finMatin] avec passage minuit.",
    min: 3, max: 10, step: 0.5,
  },
  "periodeNocturne.seuilJsNuit": {
    category: "periodeNocturne", label: "Seuil chevauchement JS de nuit", unit: "h",
    defaultValue: DEFAULT_WORK_RULES.periodeNocturne.seuilJsNuit,
    description: "Durée minimale de chevauchement avec la plage nocturne pour qu'une JS soit qualifiée de poste de nuit et déclenche les règles associées.",
    min: 0.5, max: 6, step: 0.5,
  },
  "periodeNocturne.seuilGptNuit": {
    category: "periodeNocturne", label: "Fenêtre [00h → X] pour GPT de nuit", unit: "h",
    defaultValue: DEFAULT_WORK_RULES.periodeNocturne.seuilGptNuit,
    description: "Une GPT est qualifiée de nuit si ≥ 50% de ses JS comportent la fenêtre [00h00 → X]. Seuil X exprimé en heures.",
    min: 1, max: 8, step: 0.5,
  },
};

export const CATEGORY_LABELS: Record<string, string> = {
  amplitude: "Amplitude",
  travailEffectif: "Travail effectif",
  reposJournalier: "Repos journalier",
  reposPeriodique: "Repos périodique",
  pause: "Pause / Coupure",
  gpt: "GPT — Grande Période de Travail",
  periodeNocturne: "Période nocturne",
};

