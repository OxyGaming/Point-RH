/**
 * Tests unitaires — LogCollector
 *
 * Couvre :
 *  - Méthodes debug/info/warn/error ajoutent les bons niveaux
 *  - all() retourne une copie immuable
 *  - forAgent() filtre par agentId
 *  - forJs() filtre par jsId
 *  - reset() vide les logs
 *  - createLogger() retourne une instance fraîche
 */

import { LogCollector, createLogger } from "@/engine/logger";

// ─── 1. Niveaux de log ────────────────────────────────────────────────────────

describe("LogCollector — niveaux", () => {
  it("debug() ajoute une entrée de niveau DEBUG", () => {
    const logger = new LogCollector();
    logger.debug("TEST_EVENT");
    const logs = logger.all();
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe("DEBUG");
    expect(logs[0].event).toBe("TEST_EVENT");
  });

  it("info() ajoute une entrée de niveau INFO", () => {
    const logger = new LogCollector();
    logger.info("RULE_OK");
    expect(logger.all()[0].level).toBe("INFO");
  });

  it("warn() ajoute une entrée de niveau WARN", () => {
    const logger = new LogCollector();
    logger.warn("VIGILANCE_GPT");
    expect(logger.all()[0].level).toBe("WARN");
  });

  it("error() ajoute une entrée de niveau ERROR", () => {
    const logger = new LogCollector();
    logger.error("EXCLUSION_BLOQUANTE");
    expect(logger.all()[0].level).toBe("ERROR");
  });
});

// ─── 2. Métadonnées ───────────────────────────────────────────────────────────

describe("LogCollector — métadonnées", () => {
  it("les métadonnées agentId / jsId / data sont conservées", () => {
    const logger = new LogCollector();
    logger.info("REPOS_CHECK", {
      agentId: "agent-42",
      jsId:    "js-007",
      data:    { repos: 720, min: 720 },
    });
    const entry = logger.all()[0];
    expect(entry.agentId).toBe("agent-42");
    expect(entry.jsId).toBe("js-007");
    expect(entry.data).toEqual({ repos: 720, min: 720 });
  });

  it("ts est une chaîne ISO valide", () => {
    const logger = new LogCollector();
    logger.info("EVENT");
    const ts = logger.all()[0].ts;
    expect(() => new Date(ts)).not.toThrow();
    expect(new Date(ts).toISOString()).toBe(ts);
  });
});

// ─── 3. all() — copie immuable ────────────────────────────────────────────────

describe("LogCollector — all()", () => {
  it("retourne tous les logs dans l'ordre d'insertion", () => {
    const logger = new LogCollector();
    logger.debug("A");
    logger.info("B");
    logger.warn("C");
    const logs = logger.all();
    expect(logs.map(l => l.event)).toEqual(["A", "B", "C"]);
  });

  it("la copie retournée est indépendante du collecteur", () => {
    const logger = new LogCollector();
    logger.info("A");
    const copy = logger.all();
    logger.info("B"); // ajoute après la copie
    expect(copy).toHaveLength(1);   // la copie ne change pas
    expect(logger.all()).toHaveLength(2);
  });
});

// ─── 4. forAgent() ───────────────────────────────────────────────────────────

describe("LogCollector — forAgent()", () => {
  it("retourne uniquement les logs sans agentId + ceux de l'agent ciblé", () => {
    const logger = new LogCollector();
    logger.info("GLOBAL");                                     // pas d'agentId → inclus
    logger.info("POUR_A1", { agentId: "agent-1" });           // agent-1 → inclus
    logger.info("POUR_A2", { agentId: "agent-2" });           // agent-2 → exclu

    const result = logger.forAgent("agent-1");
    expect(result.some(l => l.event === "GLOBAL")).toBe(true);
    expect(result.some(l => l.event === "POUR_A1")).toBe(true);
    expect(result.some(l => l.event === "POUR_A2")).toBe(false);
  });
});

// ─── 5. forJs() ──────────────────────────────────────────────────────────────

describe("LogCollector — forJs()", () => {
  it("retourne uniquement les logs sans jsId + ceux de la JS ciblée", () => {
    const logger = new LogCollector();
    logger.info("GLOBAL");
    logger.info("POUR_JS1", { jsId: "js-1" });
    logger.info("POUR_JS2", { jsId: "js-2" });

    const result = logger.forJs("js-1");
    expect(result.some(l => l.event === "GLOBAL")).toBe(true);
    expect(result.some(l => l.event === "POUR_JS1")).toBe(true);
    expect(result.some(l => l.event === "POUR_JS2")).toBe(false);
  });
});

// ─── 6. reset() ──────────────────────────────────────────────────────────────

describe("LogCollector — reset()", () => {
  it("vide tous les logs", () => {
    const logger = new LogCollector();
    logger.info("A");
    logger.warn("B");
    expect(logger.all()).toHaveLength(2);
    logger.reset();
    expect(logger.all()).toHaveLength(0);
  });

  it("les logs ajoutés après reset() sont normaux", () => {
    const logger = new LogCollector();
    logger.info("AVANT");
    logger.reset();
    logger.debug("APRES");
    const logs = logger.all();
    expect(logs).toHaveLength(1);
    expect(logs[0].event).toBe("APRES");
  });
});

// ─── 7. createLogger() ───────────────────────────────────────────────────────

describe("createLogger()", () => {
  it("retourne une instance fraîche (sans logs)", () => {
    const logger = createLogger();
    expect(logger.all()).toHaveLength(0);
  });

  it("deux appels retournent des instances indépendantes", () => {
    const l1 = createLogger();
    const l2 = createLogger();
    l1.info("ONLY_IN_L1");
    expect(l2.all()).toHaveLength(0);
  });
});
