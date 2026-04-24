/**
 * Moteur de règles métier ferroviaire
 * Calcule la mobilisabilité d'un agent pour un imprévu donné
 */

import { combineDateTime, diffMinutes, minutesToTime, isJsDeNuit, jsComportePeriode0h4h } from "@/lib/utils";
import type { DetailCalcul, RegleViolation, RegleRespectee, ResultatAgentDetail, StatutAgent } from "@/types/simulation";
import type { SimulationInput } from "@/types/simulation";
import { DEFAULT_WORK_RULES_MINUTES, type WorkRulesMinutes } from "@/lib/rules/workRules";
import type { EffectiveServiceInfo } from "@/types/deplacement";
import { REGLES_BLOQUANTES } from "@/engine/ruleTypes";
import {
  trouverDebutGPT,
  cumulTravailEffectifGPT,
  decoupeEnGPTs,
  isCongeOuAbsence,
  isJourTravailleGPT,
} from "@/lib/gptUtils";
import { analyserRpAutourGpt } from "@/lib/simulation/gptRpAnalyser";

// ─── Types internes ────────────────────────────────────────────────────────────

export interface AgentContext {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  posteAffectation: string | null;
  agentReserve: boolean;
  peutFaireNuit: boolean;
  peutEtreDeplace: boolean;
  regimeB: boolean;
  regimeC: boolean;
  prefixesJs: string[];  // préfixes des codes JS autorisés — vide = aucune restriction
  /** LPA de base de l'agent (Lieu de Prise d'Attachement) */
  lpaBaseId: string | null;
}

export interface PlanningEvent {
  dateDebut: Date;
  dateFin: Date;
  heureDebut: string;
  heureFin: string;
  amplitudeMin: number;     // durée totale en minutes
  dureeEffectiveMin: number | null;
  jsNpo: "JS" | "NPO";
  codeJs: string | null;
  typeJs: string | null;
  /** ID de la ligne de planning source — optionnel, renseigné par les routes API pour le figeage. */
  planningLigneId?: string;
  /**
   * Horaires standard du JsType (indépendants des trajets de l'agent).
   * Utilisés pour évaluer les remplaçants en cascade — toujours repartir du JsType,
   * pas des horaires personnels de l'agent initial (qui incluent ses déplacements).
   */
  heureDebutJsType?: string;
  heureFinJsType?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDernierPoste(events: PlanningEvent[], before: Date): PlanningEvent | null {
  const postes = events
    .filter((e) => e.jsNpo === "JS" && e.dateDebut < before)
    .sort((a, b) => b.dateDebut.getTime() - a.dateDebut.getTime());
  return postes[0] ?? null;
}

/**
 * Détermine si une GPT (liste de JS) est de nuit.
 * Une GPT est de nuit si au moins la moitié de ses journées de service
 * comporte la période de 0h à 4h.
 */
function isGPTDeNuit(joursGPT: PlanningEvent[], seuilGptNuitMin: number): boolean {
  if (joursGPT.length === 0) return false;
  const nbAvec0h4h = joursGPT.filter((j) => jsComportePeriode0h4h(j.heureDebut, j.heureFin, seuilGptNuitMin)).length;
  return nbAvec0h4h >= joursGPT.length / 2;
}

/**
 * Vérifie s'il y a eu 2 GPT de nuit consécutives avant la date cible.
 * Utilise decoupeEnGPTs pour une détection correcte (congés/RU ignorés comme RP).
 *
 * S'appuie sur la décomposition mémoïsée de l'array complet d'événements puis
 * tronque les GPTs à la borne `before`, au lieu de filtrer+redécouper à chaque
 * appel (cache miss systématique).
 */
function deuxGPTNuitConsecutives(events: PlanningEvent[], before: Date, rules: WorkRulesMinutes): boolean {
  const gpts = decoupeEnGPTs(events, rules.reposPeriodique.simple);
  const beforeTs = before.getTime();

  // Conserver les GPTs ayant au moins une JS avant `before`, en tronquant la
  // dernière si elle chevauche. Ordre chronologique → on peut break au 1er
  // élément entièrement après `before`.
  const gptsAvant: PlanningEvent[][] = [];
  for (const gpt of gpts) {
    if (gpt[0].dateDebut.getTime() >= beforeTs) break;
    const avant = gpt.filter((e) => e.dateDebut.getTime() < beforeTs);
    if (avant.length > 0) gptsAvant.push(avant);
  }

  if (gptsAvant.length < 2) return false;
  const n = gptsAvant.length;
  return isGPTDeNuit(gptsAvant[n - 1], rules.periodeNocturne.seuilGptNuit) && isGPTDeNuit(gptsAvant[n - 2], rules.periodeNocturne.seuilGptNuit);
}

// ─── Moteur principal ─────────────────────────────────────────────────────────

export function evaluerMobilisabilite(
  agent: AgentContext,
  events: PlanningEvent[],
  simulation: SimulationInput,
  rules: WorkRulesMinutes = DEFAULT_WORK_RULES_MINUTES,
  /** Résultat du calcul LPA-based (computeEffectiveService). Null = fallback booléen. */
  effectiveService?: EffectiveServiceInfo | null
): ResultatAgentDetail {
  const violations: RegleViolation[] = [];
  const respectees: RegleRespectee[] = [];

  // ─ Horaires effectifs (incluant temps de trajet si déplacement) ──────────────
  // Si effectiveService est fourni et non-indéterminable, on utilise les horaires
  // effectifs (JS standard ± trajet) pour le calcul d'amplitude.
  const heureDebutEffective = effectiveService && !effectiveService.indeterminable
    ? effectiveService.heureDebutEffective
    : simulation.heureDebut;
  const heureFinEffective = effectiveService && !effectiveService.indeterminable
    ? effectiveService.heureFinEffective
    : simulation.heureFin;
  const dateDebutEffective = simulation.dateDebut; // la date reste inchangée
  const dateFinEffective = simulation.dateFin;

  const debutImprevu = combineDateTime(dateDebutEffective, heureDebutEffective);
  const finImprevu = combineDateTime(dateFinEffective, heureFinEffective);
  const amplitudeImprevu = effectiveService && !effectiveService.indeterminable
    ? effectiveService.amplitudeEffectiveMin
    : diffMinutes(debutImprevu, finImprevu);

  // ─ Déplacement effectif (LPA-based ou fallback booléen) ─────────────────────
  // effectiveService.estEnDeplacement = null  → indéterminable, utiliser simulation.deplacement
  // effectiveService.estEnDeplacement = bool  → valeur calculée automatiquement
  const deplacement: boolean =
    effectiveService && effectiveService.estEnDeplacement !== null
      ? effectiveService.estEnDeplacement
      : simulation.deplacement;

  // JS dans la LPA (pour le message de violation)
  const jsDansLpa: boolean | null = effectiveService?.jsDansLpa ?? null;
  const nightOpts = {
    debutSoirMin: rules.periodeNocturne.debutSoir,
    finMatinMin: rules.periodeNocturne.finMatin,
    seuilMin: rules.periodeNocturne.seuilJsNuit,
  };
  // isNuit calculé sur les horaires effectifs (incluant trajet si déplacement)
  const isNuitImprevu = isJsDeNuit(heureDebutEffective, heureFinEffective, nightOpts);

  // ─ Amplitude maximale autorisée ─────────────────────────────────────────────
  // Si le déplacement est calculé automatiquement par le système LPA
  // (effectiveService.estEnDeplacement non-null), les limites déplacement
  // s'appliquent d'office — peutEtreDeplace ne conditionne pas l'amplitude LPA.
  // Pour le fallback manuel (simulation.deplacement sans effectiveService),
  // peutEtreDeplace reste requis.
  const deplacementLpaCompute =
    effectiveService !== null &&
    effectiveService !== undefined &&
    effectiveService.estEnDeplacement !== null;

  let amplitudeMax = rules.amplitude.general;
  let amplitudeRaison = "cas général";

  if (agent.agentReserve && (isNuitImprevu || simulation.posteNuit)) {
    amplitudeMax = rules.amplitude.nuitReserve;
    amplitudeRaison = "agent de réserve — poste de nuit";
  } else if (agent.agentReserve) {
    amplitudeMax = rules.amplitude.general;
    amplitudeRaison = "agent de réserve";
  } else if (deplacement && simulation.remplacement && (deplacementLpaCompute || agent.peutEtreDeplace)) {
    amplitudeMax = rules.amplitude.deplacementRemplacement;
    amplitudeRaison = "agent en déplacement avec remplacement";
  } else if (deplacement && (deplacementLpaCompute || agent.peutEtreDeplace)) {
    amplitudeMax = rules.amplitude.deplacement;
    amplitudeRaison = "agent en déplacement";
  } else if (isNuitImprevu || simulation.posteNuit) {
    amplitudeMax = rules.amplitude.nuit;
    amplitudeRaison = "poste de nuit";
  }

  // ─ Travail effectif max ──────────────────────────────────────────────────────
  let teMax = rules.travailEffectif.max;
  let teRaison = "standard";

  if (isNuitImprevu || simulation.posteNuit) {
    teMax = rules.travailEffectif.nuit;
    teRaison = "poste de nuit";
  } else if (simulation.remplacement) {
    teMax = rules.travailEffectif.max + rules.travailEffectif.supplementRemplace;
    teRaison = "remplacement (+2h)";
  }

  // ─ Repos journalier ──────────────────────────────────────────────────────────
  const dernierPoste = getDernierPoste(events, debutImprevu);
  let reposJournalierMin = rules.reposJournalier.standard;
  let reposDisponible: number | null = null;

  if (dernierPoste) {
    reposDisponible = diffMinutes(dernierPoste.dateFin, debutImprevu);

    // 14h après poste de nuit
    if (isJsDeNuit(dernierPoste.heureDebut, dernierPoste.heureFin, nightOpts)) {
      reposJournalierMin = rules.reposJournalier.apresNuit;
    } else if (agent.agentReserve && simulation.remplacement) {
      // 10h réduit pour agent de réserve assurant un remplacement (1× par GPT)
      reposJournalierMin = rules.reposJournalier.reduitReserve;
    }

    // +20 min si TE > 6h et pas de coupure (sauf après poste de nuit)
    if (
      dernierPoste.dureeEffectiveMin &&
      dernierPoste.dureeEffectiveMin > rules.pause.seuilTE &&
      !isJsDeNuit(dernierPoste.heureDebut, dernierPoste.heureFin, nightOpts)
    ) {
      reposJournalierMin += rules.pause.supplementSansCoupure;
    }
  }

  // ─ GPT — calcul via gptUtils (congés/RU ne réinitialisent PAS la GPT) ───────
  // trouverDebutGPT sert uniquement à obtenir gptStart pour la détection de congés.
  const { gptStart, joursGPT: joursGPTArr } = trouverDebutGPT(events, debutImprevu, rules.reposPeriodique.simple);
  const joursGPT = joursGPTArr.length;
  const maxGPT = rules.gpt.max;
  const cumulTE = cumulTravailEffectifGPT(events, debutImprevu, rules.reposPeriodique.simple);

  // Calcul CORRECT de joursGPTApres :
  //  – Simuler le remplacement : retirer TOUS les événements travaillés (JS + NPO C)
  //    sur la date cible, puis injecter la JS simulée.
  //  – Découper en GPTs et retrouver la séquence contenant la date cible.
  //  – Sa longueur = nombre de jours réels dans la GPT après le remplacement,
  //    y compris les jours APRÈS la date simulée (ex : C(27) pour OLLIER).
  //
  //  Garantie : C → JS ne modifie PAS la longueur de la GPT si la continuité
  //  entre les deux RP encadrants reste identique.
  const simDateStr = debutImprevu.toISOString().slice(0, 10);
  const jsSimulee: PlanningEvent = {
    dateDebut: debutImprevu,
    dateFin: finImprevu,
    heureDebut: simulation.heureDebut,
    heureFin: simulation.heureFin,
    amplitudeMin: amplitudeImprevu,
    dureeEffectiveMin: amplitudeImprevu,
    jsNpo: "JS",
    codeJs: simulation.codeJs ?? null,
    typeJs: null,
  };
  const eventsSimules: PlanningEvent[] = [
    // Retirer tous les événements travaillés sur la même date calendaire
    // (JS existantes ET NPO C — tous remplacés par la JS simulée)
    ...events.filter(
      (e) =>
        !isJourTravailleGPT(e) ||
        e.dateDebut.toISOString().slice(0, 10) !== simDateStr
    ),
    jsSimulee,
  ];
  const gptsApres = decoupeEnGPTs(eventsSimules, rules.reposPeriodique.simple);
  const gptContenant = gptsApres.find((gpt) =>
    gpt.some((e) => e.dateDebut.toISOString().slice(0, 10) === simDateStr)
  );
  // Fallback : si la date simulée n'apparaît dans aucune GPT (ne devrait pas arriver)
  const joursGPTApres = gptContenant?.length ?? joursGPT + 1;

  // ─ Points de vigilance (non bloquants) ───────────────────────────────────────
  const pointsVigilance: string[] = [];

  // Congés / RU dans la GPT courante
  const congesEnGPT = events.filter(
    (e) => e.jsNpo === "NPO" && isCongeOuAbsence(e) && e.dateDebut >= gptStart && e.dateDebut < debutImprevu
  );
  if (congesEnGPT.length > 0) {
    const labels = congesEnGPT.map((e) => e.typeJs ?? "NPO").filter((v, i, a) => a.indexOf(v) === i).join(", ");
    pointsVigilance.push(
      `${congesEnGPT.length} congé(s)/absence(s) dans la GPT en cours (${labels}) — ils ne constituent pas un repos périodique, la GPT se poursuit (${joursGPT} JS graphiées)`
    );
  }

  // GPT minimum
  if (joursGPTApres < rules.gpt.min) {
    if (joursGPTApres >= rules.gpt.minDimanche) {
      // Entre le minimum dimanche (2j) et le minimum standard (3j) :
      // la règle normale n'est PAS respectée, mais une exception existe
      // si le prochain RP simple tombe un dimanche avec accord exprès de l'agent.
      // Non évaluée automatiquement — à vérifier manuellement.
      pointsVigilance.push(
        `GPT en cours : ${joursGPTApres} jour(s) — GPT minimum standard de ${rules.gpt.min} jours non atteint. ` +
        `Exception possible : si le RP simple tombe un dimanche avec accord de l'agent, le minimum réduit (${rules.gpt.minDimanche}j) peut s'appliquer — à vérifier manuellement.`
      );
    } else {
      pointsVigilance.push(
        `GPT en cours : ${joursGPTApres} jour(s) sur ${rules.gpt.min} minimum — un repos périodique ne peut intervenir qu'après ${rules.gpt.min} jours de GPT`
      );
    }
  }

  // Coupure en plage horaire [11h-14h] / [18h-21h] — règle configurée, non évaluée automatiquement.
  // Les données de coupure interne de la JS ne sont pas disponibles dans PlanningEvent.
  // Si l'amplitude dépasse 6h, une coupure peut être requise selon convention.
  if (amplitudeImprevu > rules.pause.seuilTE && amplitudeImprevu <= amplitudeMax) {
    pointsVigilance.push(
      `Amplitude > ${rules.pause.seuilTE / 60}h : vérifier la présence d'une coupure réglementaire en plage [11h-14h] ou [18h-21h] (règle non évaluée automatiquement — données de coupure non disponibles).`
    );
  }

  // GPT max avant RP simple
  if (joursGPTApres > rules.gpt.maxAvantRP) {
    const rpDoubleH = rules.reposPeriodique.double / 60;
    pointsVigilance.push(
      `GPT atteindrait ${joursGPTApres} jour(s) (max ${rules.gpt.maxAvantRP}j avant RP simple) — le prochain repos périodique doit être au minimum un RP double (${rpDoubleH}h)`
    );
  }

  // ─ Évaluation des règles ─────────────────────────────────────────────────────

  // 0. Préfixe JS autorisé
  const codeJs = simulation.codeJs ?? null;
  if (agent.prefixesJs.length === 0) {
    violations.push({
      regle: "PREFIXE_JS",
      description: "Aucun préfixe JS autorisé renseigné",
    });
  } else if (codeJs) {
    const autorise = agent.prefixesJs.some((p) =>
      codeJs.toUpperCase().startsWith(p.toUpperCase())
    );
    if (!autorise) {
      violations.push({
        regle: "PREFIXE_JS",
        description: `Code JS "${codeJs}" non couvert — préfixes autorisés : ${agent.prefixesJs.join(", ")}`,
      });
    } else {
      respectees.push({
        regle: "PREFIXE_JS",
        description: `Code JS "${codeJs}" autorisé (préfixe correspondant : ${agent.prefixesJs.find((p) => codeJs.toUpperCase().startsWith(p.toUpperCase()))})`,
      });
    }
  }

  // 1. Amplitude
  if (amplitudeImprevu > amplitudeMax) {
    violations.push({
      regle: "AMPLITUDE",
      description: `Amplitude dépasse le maximum autorisé (${amplitudeRaison})`,
      valeur: minutesToTime(amplitudeImprevu),
      limite: minutesToTime(amplitudeMax),
    });
  } else {
    respectees.push({
      regle: "AMPLITUDE",
      description: `Amplitude dans les limites (${amplitudeRaison})`,
      valeur: minutesToTime(amplitudeImprevu),
    });
  }

  // 2. Travail effectif
  if (amplitudeImprevu > teMax) {
    violations.push({
      regle: "TRAVAIL_EFFECTIF",
      description: `Durée effective dépasse le maximum (${teRaison})`,
      valeur: minutesToTime(amplitudeImprevu),
      limite: minutesToTime(teMax),
    });
  } else {
    respectees.push({ regle: "TRAVAIL_EFFECTIF", description: `Durée effective OK (${teRaison})` });
  }

  // 3. TE cumulé GPT
  const nouvelTeGPT = cumulTE + amplitudeImprevu;
  if (nouvelTeGPT > rules.travailEffectif.maxGPT) {
    violations.push({
      regle: "TE_GPT_48H",
      description: "Cumul travail effectif sur la GPT dépasserait 48h",
      valeur: minutesToTime(nouvelTeGPT),
      limite: minutesToTime(rules.travailEffectif.maxGPT),
    });
  } else {
    respectees.push({ regle: "TE_GPT_48H", description: "Cumul TE GPT OK", valeur: minutesToTime(nouvelTeGPT) });
  }

  // 4. Repos journalier
  if (reposDisponible !== null && reposDisponible < reposJournalierMin) {
    violations.push({
      regle: "REPOS_JOURNALIER",
      description: "Repos journalier insuffisant depuis le dernier poste",
      valeur: minutesToTime(reposDisponible),
      limite: minutesToTime(reposJournalierMin),
    });
  } else if (reposDisponible !== null) {
    respectees.push({
      regle: "REPOS_JOURNALIER",
      description: "Repos journalier suffisant",
      valeur: minutesToTime(reposDisponible),
    });
  } else {
    respectees.push({ regle: "REPOS_JOURNALIER", description: "Aucun poste précédent trouvé – repos OK" });
  }

  // 5. GPT max — une GPT ne peut comporter plus de 6 JS
  //    Vérifie la longueur APRÈS simulation (joursGPTApres) pour éviter les
  //    faux positifs et les faux négatifs liés au simple +1 de l'ancienne logique.
  if (joursGPTApres > maxGPT) {
    violations.push({
      regle: "GPT_MAX",
      description: `GPT maximale dépassée — la GPT atteindrait ${joursGPTApres} JS (max ${maxGPT})`,
      valeur: joursGPTApres,
      limite: maxGPT,
    });
  } else {
    respectees.push({ regle: "GPT_MAX", description: "Nombre de JS en GPT dans les limites", valeur: joursGPTApres });
  }

  // 6. Poste de nuit interdit si non habilité
  if ((isNuitImprevu || simulation.posteNuit) && !agent.peutFaireNuit) {
    violations.push({
      regle: "NUIT_HABILITATION",
      description: "Agent non habilité pour poste de nuit",
    });
  }

  // 7. Déplacement interdit si non habilité
  // – Système LPA : la JS hors LPA est AUTORISÉE — le trajet est ajouté à l'amplitude
  //   et le moteur vérifie l'amplitude résultante. Pas de violation ici.
  // – Fallback manuel (jsDansLpa = null, pas de contexte LPA) : si simulation.deplacement
  //   et agent non autorisé → violation.
  const deplacementManuelNonAutorise = !deplacementLpaCompute && simulation.deplacement && !agent.peutEtreDeplace;
  if (deplacementManuelNonAutorise) {
    violations.push({
      regle: "DEPLACEMENT_HABILITATION",
      description: "Agent non autorisé pour déplacement (déplacement requis manuellement)",
    });
  }

  // 7b. Déplacement sans règle de trajet (si indéterminable et LPA configurée)
  if (
    effectiveService &&
    !effectiveService.indeterminable &&
    effectiveService.estEnDeplacement === true &&
    effectiveService.tempsTrajetAllerMin === 0 &&
    effectiveService.tempsTrajetRetourMin === 0
  ) {
    violations.push({
      regle: "TRAJET_ABSENT",
      description: "Agent en déplacement : aucun temps de trajet configuré — amplitude sous-évaluée",
    });
  }

  // 8. 2 GPT de nuit consécutives
  if ((isNuitImprevu || simulation.posteNuit) && deuxGPTNuitConsecutives(events, debutImprevu, rules)) {
    violations.push({
      regle: "GPT_NUIT_CONSECUTIVES",
      description: "Agent aurait 2 GPT de nuit consécutives",
    });
  }

  // 9. Régime B/C – durée minimale
  if ((agent.regimeB || agent.regimeC) && amplitudeImprevu < rules.travailEffectif.minRegimeBC) {
    violations.push({
      regle: "MIN_REGIME_BC",
      description: "Durée inférieure au minimum pour régime B/C",
      valeur: minutesToTime(amplitudeImprevu),
      limite: minutesToTime(rules.travailEffectif.minRegimeBC),
    });
  }

  // ─ Statut final ──────────────────────────────────────────────────────────────
  let statut: StatutAgent;
  let scorePertinence: number;
  let motifPrincipal: string;

  if (violations.length === 0) {
    scorePertinence = 100;
    if (reposDisponible !== null) {
      const marge = reposDisponible - reposJournalierMin;
      scorePertinence -= Math.max(0, Math.round((240 - marge) / 24));
    }
    if (agent.agentReserve) scorePertinence += 10;
    if (joursGPT === 0) scorePertinence += 5;
    scorePertinence = Math.min(100, Math.max(0, scorePertinence));
    statut = "CONFORME";
    motifPrincipal = "Toutes les règles respectées";
  } else if (
    violations.length === 1 &&
    !REGLES_BLOQUANTES.includes(violations[0].regle as (typeof REGLES_BLOQUANTES)[number])
  ) {
    // Une seule violation non bloquante → VIGILANCE (pénalité score, agent mobilisable)
    // Les règles bloquantes (REPOS, AMPLITUDE, PREFIXE_JS, NUIT_HABILITATION, etc.)
    // génèrent NON_CONFORME même seules — comportement cohérent avec le pré-filtre.
    statut = "VIGILANCE";
    scorePertinence = 40;
    motifPrincipal = violations[0].description;
  } else {
    statut = "NON_CONFORME";
    scorePertinence = Math.max(0, 10 - violations.length * 2);
    motifPrincipal = violations[0].description;
  }

  // ─ Analyse RP autour de la GPT impactée ─────────────────────────────────────
  const gptRpAnalyse = analyserRpAutourGpt(eventsSimules, debutImprevu, rules, events);

  const detail: DetailCalcul = {
    amplitudeMaxAutorisee: amplitudeMax,
    amplitudeImprevu,
    amplitudeRaison,
    dureeEffectiveMax: teMax,
    reposJournalierMin,
    dernierPosteDebut: dernierPoste ? dernierPoste.heureDebut : null,
    dernierPosteFin: dernierPoste ? dernierPoste.heureFin : null,
    dernierPosteDate: dernierPoste ? dernierPoste.dateDebut.toISOString().slice(0, 10) : null,
    reposJournalierDisponible: reposDisponible,
    gptActuel: joursGPTApres,
    gptMax: maxGPT,
    teGptCumulAvant: cumulTE,
    teGptLignes: joursGPTArr.map((e) => ({
      date: e.dateDebut.toISOString().slice(0, 10),
      heureDebut: e.heureDebut,
      heureFin: e.heureFin,
      codeJs: e.codeJs,
      dureeMin: e.dureeEffectiveMin ?? e.amplitudeMin,
    })),
    reposPeriodiqueProchain: null,
    violations,
    respectees,
    pointsVigilance,
    disponible: violations.length === 0,
    // Informations de déplacement calculées (null si non disponibles)
    deplacementInfo: effectiveService ?? null,
    gptRpAnalyse,
  };

  return {
    agentId: agent.id,
    nom: agent.nom,
    prenom: agent.prenom,
    matricule: agent.matricule,
    posteAffectation: agent.posteAffectation,
    agentReserve: agent.agentReserve,
    statut,
    scorePertinence,
    motifPrincipal,
    detail,
  };
}
