/**
 * Tests Phase 1 — correctif de la lecture consolidée du planning.
 *
 *  1. Parité simulation : `evaluerMobilisabilite` produit un résultat
 *     STRICTEMENT IDENTIQUE que le planning de l'agent soit chargé en entier
 *     ou tronqué à la fenêtre -35j / +21j autour de l'imprévu. Garantit que
 *     la fenêtre ne prive jamais le moteur de règles de contexte utile (GPT,
 *     RP, repos journalier) — le filet de sécurité du risque n°1.
 *
 *  2. Visibilité consolidée : après un import Base puis un import UCH, une
 *     sélection par fenêtre temporelle (`jourPlanning`) couvre les agents de
 *     TOUS les imports — là où l'ancien filtre `importId` masquait les agents
 *     hors UCH.
 *
 * Tests purement unitaires (in-memory) — ne touchent pas la base.
 */

import { evaluerMobilisabilite } from "@/engine/rules";
import type { AgentContext, PlanningEvent } from "@/engine/rules";
import type { SimulationInput } from "@/types/simulation";
import { DEFAULT_WORK_RULES_MINUTES } from "@/lib/rules/workRules";
import { fenetreSimulation } from "@/lib/simulation/planningWindow";
import { jourPlanningFromDate } from "@/services/import.service";
import { combineDateTimeParis, minuitParisEnUtc } from "@/lib/timezone";

const rules = DEFAULT_WORK_RULES_MINUTES;

/** Décale une date calendaire "YYYY-MM-DD" de `n` jours. */
function decalerJours(jour: string, n: number): string {
  const d = new Date(`${jour}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function buildAgent(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    id: "agent-parite",
    nom: "Test",
    prenom: "Parite",
    matricule: "M999",
    posteAffectation: "GARE",
    agentReserve: false,
    peutFaireNuit: true,
    peutEtreDeplace: false,
    regimeB: false,
    regimeC: false,
    prefixesJs: ["GIV"],
    lpaBaseId: null,
    ...overrides,
  };
}

/** Une JS sur le jour `jour` — 08:00-16:00 (jour) ou 20:00-04:00 (nuit). */
function buildJsEvent(jour: string, nuit: boolean): PlanningEvent {
  const heureDebut = nuit ? "20:00" : "08:00";
  const heureFin = nuit ? "04:00" : "16:00";
  const dateDebut = combineDateTimeParis(jour, heureDebut);
  const dateFin = combineDateTimeParis(nuit ? decalerJours(jour, 1) : jour, heureFin);
  return {
    dateDebut,
    dateFin,
    heureDebut,
    heureFin,
    amplitudeMin: Math.round((dateFin.getTime() - dateDebut.getTime()) / 60000),
    dureeEffectiveMin: null,
    jsNpo: "JS",
    codeJs: "GIV001",
    typeJs: null,
  };
}

/** Planning continu : cycle de 5 JS travaillées + 2 jours de repos. */
function genererPlanning(jourZero: string, nbJours: number, nuit: boolean): PlanningEvent[] {
  const events: PlanningEvent[] = [];
  for (let i = 0; i < nbJours; i++) {
    if (i % 7 < 5) events.push(buildJsEvent(decalerJours(jourZero, i), nuit));
  }
  return events;
}

function buildSimInput(imprevuDate: string, nuit: boolean): SimulationInput {
  return {
    importId: "ignore",
    dateDebut: imprevuDate,
    dateFin: nuit ? decalerJours(imprevuDate, 1) : imprevuDate,
    heureDebut: nuit ? "20:00" : "08:00",
    heureFin: nuit ? "04:00" : "16:00",
    poste: "GIV001",
    codeJs: "GIV001",
    remplacement: true,
    deplacement: false,
    posteNuit: nuit,
  };
}

describe("Parité simulation — fenêtre -35/+21j vs planning complet", () => {
  // jourZero choisi pour que l'imprévu (j+75) tombe sur un jour de repos.
  const jourZero = "2026-03-01";
  const imprevuDate = decalerJours(jourZero, 75);

  function lancerParite(nuit: boolean) {
    const agent = buildAgent();
    const complet = genererPlanning(jourZero, 110, nuit);

    // Tronque à la fenêtre exactement comme le font les routes (filtre sur
    // jourPlanning ∈ [gte, lte]).
    const fenetre = fenetreSimulation([imprevuDate]);
    const fenetre_ = complet.filter((e) => {
      const jp = jourPlanningFromDate(e.dateDebut);
      return jp >= fenetre.gte && jp <= fenetre.lte;
    });

    const sim = buildSimInput(imprevuDate, nuit);
    return {
      resComplet: evaluerMobilisabilite(agent, complet, sim, rules),
      resFenetre: evaluerMobilisabilite(agent, fenetre_, sim, rules),
      complet,
      fenetre_,
    };
  }

  it("imprévu de JOUR — résultat strictement identique", () => {
    const { resComplet, resFenetre, complet, fenetre_ } = lancerParite(false);

    // Non-vacuité : la fenêtre a réellement exclu des événements...
    expect(fenetre_.length).toBeLessThan(complet.length);
    expect(complet.length - fenetre_.length).toBeGreaterThan(15);
    // ...et le moteur évalue un historique GPT réel.
    expect(resComplet.detail.gptActuel).toBeGreaterThanOrEqual(2);

    // Parité stricte — la fenêtre n'altère pas l'évaluation.
    expect(resFenetre).toEqual(resComplet);
  });

  it("imprévu de NUIT — résultat identique (GPT nuit consécutives incluses)", () => {
    const { resComplet, resFenetre, complet, fenetre_ } = lancerParite(true);

    expect(fenetre_.length).toBeLessThan(complet.length);
    expect(resComplet.detail.gptActuel).toBeGreaterThanOrEqual(2);

    expect(resFenetre).toEqual(resComplet);
  });
});

describe("Visibilité consolidée — import Base puis import UCH", () => {
  it("la fenêtre d'une JS cible UCH couvre les agents hors UCH de la période", () => {
    // Après un import Base A puis un import UCH B : les lignes des agents hors
    // UCH gardent importId=A, celles des agents UCH passent à importId=B. Le
    // correctif charge par `jourPlanning` (fenêtre), jamais par `importId`.
    const lignes = [
      { matricule: "BASE-1", importId: "A", jourPlanning: minuitParisEnUtc("2026-06-09") },
      { matricule: "BASE-2", importId: "A", jourPlanning: minuitParisEnUtc("2026-06-12") },
      { matricule: "UCH-1", importId: "B", jourPlanning: minuitParisEnUtc("2026-06-15") },
    ];
    const fenetre = fenetreSimulation(["2026-06-15"]);

    const chargeesParFenetre = lignes
      .filter((l) => l.jourPlanning >= fenetre.gte && l.jourPlanning <= fenetre.lte)
      .map((l) => l.matricule)
      .sort();
    const chargeesParAncienFiltre = lignes
      .filter((l) => l.importId === "B")
      .map((l) => l.matricule);

    // Le correctif rend visibles les 3 agents (Base + UCH)...
    expect(chargeesParFenetre).toEqual(["BASE-1", "BASE-2", "UCH-1"]);
    // ...là où l'ancien filtre importId n'en montrait qu'un.
    expect(chargeesParAncienFiltre).toEqual(["UCH-1"]);
  });
});
