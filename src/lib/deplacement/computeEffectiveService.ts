/**
 * Fonction métier centrale : computeEffectiveService
 *
 * Détermine automatiquement si un agent est en déplacement pour une JS donnée
 * et calcule les horaires de service effectifs (JS standard ± temps de trajet).
 *
 * Algorithme :
 *  1. Trouver le JsType correspondant à la JS (par code ou préfixe)
 *  2. Vérifier si ce JsType est dans la LPA de l'agent (via LpaJsType)
 *  3. Appliquer l'override agent si présent (AgentJsDeplacementRule.horsLpa)
 *  4. Si hors LPA → vérifier peutEtreDeplace
 *  5. Calculer heureDebutEffective = heureDebut − tempsAller
 *     et heureFinEffective = heureFin + tempsRetour
 *  6. Déterminer le régime RH
 *
 * ⚠ Si les données de référence sont absentes (LPA non configurée, JsType
 *   inconnu), la fonction retourne indeterminable = true. L'appelant doit
 *   alors traiter ce cas : afficher "Indéterminable" dans l'UI et appliquer
 *   un fallback (aucun déplacement, pas de violation bloquante sur ce critère).
 */

import { timeToMinutes, minutesToTime } from "@/lib/utils";
import type {
  LpaContext,
  JsTypeData,
  AgentDeplacementRuleData,
  EffectiveServiceInfo,
  RegimeRH,
} from "@/types/deplacement";

// ─── Entrées ──────────────────────────────────────────────────────────────────

export interface AgentDeplacementInput {
  id: string;
  lpaBaseId: string | null;
  peutEtreDeplace: boolean;
}

export interface JsInput {
  codeJs: string | null;
  typeJs: string | null;
  heureDebut: string; // "HH:MM"
  heureFin: string;   // "HH:MM"
  estNuit: boolean;
}

export interface SimContextInput {
  remplacement: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calcule l'amplitude en minutes entre deux horaires (gère le passage minuit).
 */
function calcAmplitude(heureDebut: string, heureFin: string): number {
  const debut = timeToMinutes(heureDebut);
  const fin = timeToMinutes(heureFin);
  return fin >= debut ? fin - debut : 24 * 60 - debut + fin;
}

/**
 * Soustrait des minutes à un horaire (gère le passage minuit).
 */
function soustraireMinutes(heure: string, minutes: number): string {
  const total = ((timeToMinutes(heure) - minutes) % (24 * 60) + 24 * 60) % (24 * 60);
  return minutesToTime(total);
}

/**
 * Ajoute des minutes à un horaire (gère le passage minuit).
 */
function ajouterMinutes(heure: string, minutes: number): string {
  return minutesToTime((timeToMinutes(heure) + minutes) % (24 * 60));
}

/**
 * Trouve le JsType correspondant à une JS donnée.
 *
 * Stratégie de matching (ordre de priorité) :
 *  1. codeJs exact → JsType.code
 *  2. codeJs préfixé → JsType.code est un préfixe de codeJs (le plus long gagne)
 *  3. typeJs exact → JsType.code
 */
function trouverJsType(
  codeJs: string | null,
  typeJs: string | null,
  jsTypes: JsTypeData[]
): JsTypeData | null {
  const actifs = jsTypes.filter((jt) => jt.actif);

  if (codeJs) {
    const upper = codeJs.toUpperCase();

    // Correspondance exacte
    const exact = actifs.find((jt) => jt.code.toUpperCase() === upper);
    if (exact) return exact;

    // Correspondance par préfixe (plus long préfixe gagne)
    const prefixMatches = actifs
      .filter((jt) => upper.startsWith(jt.code.toUpperCase()))
      .sort((a, b) => b.code.length - a.code.length);
    if (prefixMatches.length > 0) return prefixMatches[0];
  }

  if (typeJs) {
    const upper = typeJs.toUpperCase();
    const exact = actifs.find((jt) => jt.code.toUpperCase() === upper);
    if (exact) return exact;
  }

  return null;
}

/**
 * Trouve la règle déplacement applicable pour un agent sur une JS donnée.
 *
 * Priorité :
 *  1. Règle liée à jsTypeId (si le JsType a été trouvé)
 *  2. Règle liée à prefixeJs (le préfixe le plus long gagne)
 */
function trouverRegleAgent(
  agentRules: AgentDeplacementRuleData[],
  jsTypeId: string | null,
  codeJs: string | null
): AgentDeplacementRuleData | null {
  const actives = agentRules.filter((r) => r.actif);

  // Priorité 1 : jsTypeId exact
  if (jsTypeId) {
    const byType = actives.find((r) => r.jsTypeId === jsTypeId);
    if (byType) return byType;
  }

  // Priorité 2 : prefixeJs (le plus long gagne)
  if (codeJs) {
    const upper = codeJs.toUpperCase();
    const prefixMatches = actives
      .filter((r) => r.prefixeJs && upper.startsWith(r.prefixeJs.toUpperCase()))
      .sort((a, b) => (b.prefixeJs?.length ?? 0) - (a.prefixeJs?.length ?? 0));
    if (prefixMatches.length > 0) return prefixMatches[0];
  }

  return null;
}

// ─── Fonction principale ──────────────────────────────────────────────────────

export function computeEffectiveService(
  agent: AgentDeplacementInput,
  jsInfo: JsInput,
  lpaContext: LpaContext,
  simContext: SimContextInput
): EffectiveServiceInfo {
  const { codeJs, typeJs, heureDebut, heureFin, estNuit } = jsInfo;

  // ── Étape 1 : Trouver le JsType ────────────────────────────────────────────
  const jsType = trouverJsType(codeJs, typeJs, lpaContext.jsTypes);

  // ── Étape 2 : Trouver la LPA de l'agent ───────────────────────────────────
  const lpa = agent.lpaBaseId
    ? lpaContext.lpas.find((l) => l.id === agent.lpaBaseId && l.actif) ?? null
    : null;

  // ── Cas indéterminable : LPA non configurée ────────────────────────────────
  if (!lpa) {
    // Horaire de référence : standard JsType si trouvé, sinon planning
    const heureDebutRef = jsType?.heureDebutStandard ?? heureDebut;
    const heureFinRef = jsType?.heureFinStandard ?? heureFin;
    return {
      jsTypeId: jsType?.id ?? null,
      jsTypeCode: jsType?.code ?? null,
      jsTypeLibelle: jsType?.libelle ?? null,
      lpaId: null,
      jsDansLpa: null,
      estEnDeplacement: null,
      tempsTrajetAllerMin: 0,
      tempsTrajetRetourMin: 0,
      heureDebutReference: heureDebutRef,
      heureFinReference: heureFinRef,
      heureDebutEffective: heureDebutRef,
      heureFinEffective: heureFinRef,
      amplitudeEffectiveMin: calcAmplitude(heureDebutRef, heureFinRef),
      regimeRH: buildRegimeRH(false, estNuit, simContext.remplacement),
      indeterminable: true,
      raisonIndeterminable: "LPA de base non renseignée pour cet agent",
      explication: "LPA non configurée — déplacement indéterminable",
    };
  }

  // ── Cas indéterminable : JsType inconnu ───────────────────────────────────
  if (!jsType) {
    const jsLabel = codeJs ?? typeJs ?? "inconnue";
    return {
      jsTypeId: null,
      jsTypeCode: null,
      jsTypeLibelle: null,
      lpaId: lpa.id,
      jsDansLpa: null,
      estEnDeplacement: null,
      tempsTrajetAllerMin: 0,
      tempsTrajetRetourMin: 0,
      heureDebutReference: heureDebut,
      heureFinReference: heureFin,
      heureDebutEffective: heureDebut,
      heureFinEffective: heureFin,
      amplitudeEffectiveMin: calcAmplitude(heureDebut, heureFin),
      regimeRH: buildRegimeRH(false, estNuit, simContext.remplacement),
      indeterminable: true,
      raisonIndeterminable: `JS "${jsLabel}" non associée à un JsType référencé`,
      explication: `JS "${jsLabel}" inconnue dans le référentiel — déplacement indéterminable`,
    };
  }

  // ── Étape 3 : Règle spécifique agent ──────────────────────────────────────
  const agentRules = lpaContext.agentRulesMap.get(agent.id) ?? [];
  const regleAgent = trouverRegleAgent(agentRules, jsType.id, codeJs);

  // ── Étape 4 : JS dans la LPA ? ────────────────────────────────────────────
  let jsDansLpa = lpa.jsTypeIds.has(jsType.id);

  // Override depuis la règle agent (horsLpa = true → force JS hors LPA)
  if (regleAgent?.horsLpa !== null && regleAgent?.horsLpa !== undefined) {
    jsDansLpa = !regleAgent.horsLpa;
  }

  // ── Étape 5 : Déplacement effectif ────────────────────────────────────────
  const estEnDeplacement = !jsDansLpa && agent.peutEtreDeplace;

  // ── Étape 6 : Temps de trajet ─────────────────────────────────────────────
  let tempsTrajetAller = 0;
  let tempsTrajetRetour = 0;

  if (estEnDeplacement && regleAgent) {
    tempsTrajetAller = regleAgent.tempsTrajetAllerMinutes;
    tempsTrajetRetour = regleAgent.tempsTrajetRetourMinutes;
  }

  // ── Étape 7 : Horaires de référence (standard JsType) ────────────────────
  // IMPORTANT : on utilise toujours les horaires STANDARD du JsType comme base,
  // PAS les horaires du planning (qui peuvent déjà inclure le trajet de l'agent source).
  const heureDebutRef = jsType.heureDebutStandard;
  const heureFinRef = jsType.heureFinStandard;
  const amplitudeStdRefMin = calcAmplitude(heureDebutRef, heureFinRef);

  // ── Étape 8 : Horaires effectifs (référence ± trajet) ─────────────────────
  const heureDebutEffective = estEnDeplacement && tempsTrajetAller > 0
    ? soustraireMinutes(heureDebutRef, tempsTrajetAller)
    : heureDebutRef;

  const heureFinEffective = estEnDeplacement && tempsTrajetRetour > 0
    ? ajouterMinutes(heureFinRef, tempsTrajetRetour)
    : heureFinRef;

  const amplitudeEffectiveMin = amplitudeStdRefMin + tempsTrajetAller + tempsTrajetRetour;

  // ── Étape 9 : Régime RH ───────────────────────────────────────────────────
  const isNuitEffective = estNuit || jsType.estNuit;
  const regimeRH = buildRegimeRH(estEnDeplacement, isNuitEffective, simContext.remplacement);

  // ── Explication ───────────────────────────────────────────────────────────
  const parts: string[] = [];
  parts.push(`JS ref "${jsType.code}" (${jsType.libelle}) : ${heureDebutRef}→${heureFinRef}`);
  parts.push(`LPA "${lpa.code}" : JS ${jsDansLpa ? "DANS" : "HORS"} LPA`);

  if (regleAgent?.horsLpa !== null && regleAgent?.horsLpa !== undefined) {
    parts.push(`Override agent : horsLpa=${regleAgent.horsLpa}`);
  }

  if (!jsDansLpa && !agent.peutEtreDeplace) {
    parts.push("Agent non autorisé au déplacement (peutEtreDeplace=false)");
  } else if (estEnDeplacement) {
    parts.push(`Déplacement : aller ${tempsTrajetAller}min + retour ${tempsTrajetRetour}min`);
    if (tempsTrajetAller > 0 || tempsTrajetRetour > 0) {
      parts.push(`JS effective : ${heureDebutEffective}→${heureFinEffective} (amplitude ${minutesToTime(amplitudeEffectiveMin)})`);
    }
  }

  parts.push(`Régime RH : ${regimeRH}`);

  return {
    jsTypeId: jsType.id,
    jsTypeCode: jsType.code,
    jsTypeLibelle: jsType.libelle,
    lpaId: lpa.id,
    jsDansLpa,
    estEnDeplacement,
    tempsTrajetAllerMin: tempsTrajetAller,
    tempsTrajetRetourMin: tempsTrajetRetour,
    heureDebutReference: heureDebutRef,
    heureFinReference: heureFinRef,
    heureDebutEffective,
    heureFinEffective,
    amplitudeEffectiveMin,
    regimeRH,
    indeterminable: false,
    explication: parts.join(" | "),
  };
}

// ─── Helper régime RH ─────────────────────────────────────────────────────────

function buildRegimeRH(
  estEnDeplacement: boolean,
  isNuit: boolean,
  remplacement: boolean
): RegimeRH {
  if (isNuit) return "nuit";
  if (estEnDeplacement && remplacement) return "deplacementRemplacement";
  if (estEnDeplacement) return "deplacement";
  return "general";
}
