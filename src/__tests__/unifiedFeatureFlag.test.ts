/**
 * Tests du gate `FEATURE_UNIFIED_PRIMARY` derrière `UNIFIED_PRIMARY_ALIGNMENT_DONE`.
 *
 * Couvre les 4 combinaisons de flags + l'unicité du warning par process.
 * Voir docs/unified-solver-divergences.md pour le contexte fonctionnel.
 */

import {
  isUnifiedPrimaryEnabled,
  isUnifiedShadowEnabled,
  _resetUnifiedFlagWarnForTests,
} from "@/lib/simulation/unified/featureFlag";

const ORIGINAL_PRIMARY = process.env.FEATURE_UNIFIED_PRIMARY;
const ORIGINAL_ALIGN = process.env.UNIFIED_PRIMARY_ALIGNMENT_DONE;
const ORIGINAL_SHADOW = process.env.UNIFIED_SHADOW;

function setEnv(
  primary: string | undefined,
  align: string | undefined,
  shadow: string | undefined
) {
  if (primary === undefined) delete process.env.FEATURE_UNIFIED_PRIMARY;
  else process.env.FEATURE_UNIFIED_PRIMARY = primary;

  if (align === undefined) delete process.env.UNIFIED_PRIMARY_ALIGNMENT_DONE;
  else process.env.UNIFIED_PRIMARY_ALIGNMENT_DONE = align;

  if (shadow === undefined) delete process.env.UNIFIED_SHADOW;
  else process.env.UNIFIED_SHADOW = shadow;
}

describe("unified/featureFlag — isUnifiedPrimaryEnabled", () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    _resetUnifiedFlagWarnForTests();
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    setEnv(ORIGINAL_PRIMARY, ORIGINAL_ALIGN, ORIGINAL_SHADOW);
  });

  it("retourne false quand aucun flag n'est positionné", () => {
    setEnv(undefined, undefined, undefined);
    expect(isUnifiedPrimaryEnabled()).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("retourne false quand seul UNIFIED_PRIMARY_ALIGNMENT_DONE=1 (sans FEATURE_UNIFIED_PRIMARY)", () => {
    setEnv(undefined, "1", undefined);
    expect(isUnifiedPrimaryEnabled()).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("retourne false et émet un warn quand FEATURE_UNIFIED_PRIMARY=1 sans alignment", () => {
    setEnv("1", undefined, undefined);
    expect(isUnifiedPrimaryEnabled()).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/FEATURE_UNIFIED_PRIMARY=1 ignored/);
    expect(warnSpy.mock.calls[0][0]).toMatch(/UNIFIED_PRIMARY_ALIGNMENT_DONE/);
  });

  it("retourne true quand les deux flags sont positionnés", () => {
    setEnv("1", "1", undefined);
    expect(isUnifiedPrimaryEnabled()).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("n'émet le warn qu'une seule fois par process même sur appels répétés", () => {
    setEnv("1", undefined, undefined);
    isUnifiedPrimaryEnabled();
    isUnifiedPrimaryEnabled();
    isUnifiedPrimaryEnabled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("ne réémet pas le warn après un appel valide intermédiaire", () => {
    // Cas réaliste : opérateur active alignment au runtime, désactive à nouveau.
    setEnv("1", undefined, undefined);
    isUnifiedPrimaryEnabled();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    setEnv("1", "1", undefined);
    expect(isUnifiedPrimaryEnabled()).toBe(true);

    setEnv("1", undefined, undefined);
    isUnifiedPrimaryEnabled();
    // Toujours 1 — le warn a déjà été émis dans ce process.
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("traite toute valeur autre que '1' comme désactivé", () => {
    setEnv("true", "true", undefined);
    expect(isUnifiedPrimaryEnabled()).toBe(false);

    setEnv("1", "0", undefined);
    expect(isUnifiedPrimaryEnabled()).toBe(false);
  });
});

describe("unified/featureFlag — isUnifiedShadowEnabled", () => {
  afterEach(() => {
    setEnv(ORIGINAL_PRIMARY, ORIGINAL_ALIGN, ORIGINAL_SHADOW);
  });

  it("retourne false quand aucun flag n'est positionné", () => {
    setEnv(undefined, undefined, undefined);
    expect(isUnifiedShadowEnabled()).toBe(false);
  });

  it("retourne true sur UNIFIED_SHADOW=1", () => {
    setEnv(undefined, undefined, "1");
    expect(isUnifiedShadowEnabled()).toBe(true);
  });

  it("retourne true sur FEATURE_UNIFIED_PRIMARY=1 même sans alignment (run en shadow)", () => {
    setEnv("1", undefined, undefined);
    expect(isUnifiedShadowEnabled()).toBe(true);
  });

  it("retourne true sur les deux flags primary+alignment (mode primary inclut shadow)", () => {
    setEnv("1", "1", undefined);
    expect(isUnifiedShadowEnabled()).toBe(true);
  });
});
