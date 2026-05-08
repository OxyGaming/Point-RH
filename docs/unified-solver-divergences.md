# Solveur unifié — divergences à arbitrer avant `FEATURE_UNIFIED_PRIMARY=1`

Le solveur unifié (`src/lib/simulation/unified/`) coexiste avec le moteur historique (`src/engine/rules.ts`, `src/lib/simulation/`). Tant que les divergences listées ci-dessous ne sont pas arbitrées et alignées, le flag `FEATURE_UNIFIED_PRIMARY=1` est ignoré côté API : le rapport unifié est calculé en shadow (logs serveur) mais n'est pas exposé à l'UI.

Pour autoriser l'exposition UI, il faut positionner **les deux** flags ensemble côté serveur :

```
FEATURE_UNIFIED_PRIMARY=1
UNIFIED_PRIMARY_ALIGNMENT_DONE=1
```

Le second flag est une déclaration : "j'ai pris connaissance du contenu de ce document, les divergences listées sont soit corrigées dans le code, soit explicitement acceptées comme nouveau comportement par le métier."

> **Statut 2026-05-08** : C1 et C2 arbitrées et alignées dans le code (option A pour les deux). L'activation de `UNIFIED_PRIMARY_ALIGNMENT_DONE=1` est désormais sûre — voir [Procédure d'activation](#procédure-dactivation).

---

## C1 — `MIN_REGIME_BC` : VIGILANCE (engine) vs FATAL (unified) — ✅ RÉSOLU

| | Moteur historique | Solveur unifié (avant alignement) | Solveur unifié (après alignement) |
|---|---|---|---|
| Source | [src/engine/ruleTypes.ts](../src/engine/ruleTypes.ts) — `REGLES_BLOQUANTES` | [src/lib/simulation/unified/evaluation.ts](../src/lib/simulation/unified/evaluation.ts) — `REGLES_FATALES` | `REGLES_VIGILANCE_PURE` |
| `MIN_REGIME_BC` listée ? | Non | Oui (FATAL) | Non (retirée de FATALES, ajoutée à VIGILANCE_PURE) |
| Comportement si seule violation | Statut `VIGILANCE` — agent reste mobilisable, score pénalisé | `faisable=false` — agent rejeté | Statut `VIGILANCE` — agent reste mobilisable ✓ |

**Cas concret** : agent en régime B ou C, JS dont l'amplitude est inférieure au minimum réglementaire (`travailEffectif.minRegimeBC`, défaut configuré dans `WorkRules`).

**Décision arbitrée (2026-05-08)** :

- [x] **Option A — VIGILANCE (alignement sur engine)** : `MIN_REGIME_BC` retirée de `REGLES_FATALES`, ajoutée à `REGLES_VIGILANCE_PURE`. Le solveur unifié laisse l'agent en VIGILANCE comme le legacy.
- [ ] ~~Option B — FATAL (alignement sur unified)~~ : non retenue.

**Décideur** : propriétaire fonctionnel Point RH, 2026-05-08.

---

## C2 — `GPT_NUIT_CONSECUTIVES` : VIGILANCE (engine) vs irrécupérable (unified) — ✅ RÉSOLU

| | Moteur historique | Solveur unifié (avant alignement) | Solveur unifié (après alignement) |
|---|---|---|---|
| Source | [src/engine/rules.ts:454](../src/engine/rules.ts) émet la violation | mapper `INDUCED_NUITS` retournait `null` → irrécupérable | `REGLES_VIGILANCE_PURE` (backward) + skip dans `mapForwardConflicts` (forward) |
| Listée dans bloquantes/fatales ? | Non — VIGILANCE par nature | Non — mais `null` du mapper = `irrecuperable=true` | Non — `vigilancePure=true`, statut forcé à VIGILANCE |
| Comportement si seule violation | Statut `VIGILANCE` — agent mobilisable | Agent rejeté | Statut `VIGILANCE` — agent mobilisable ✓ |

**Cas concret** : agent qui aurait deux GPT de nuit consécutives après prise de l'imprévu.

**Décision arbitrée (2026-05-08)** :

- [x] **Option A — VIGILANCE** : pas de cascade tentée pour `GPT_NUIT_CONSECUTIVES`. Statut VIGILANCE pur, l'agent reste mobilisable, le décideur arbitre humainement.
- [ ] ~~Option B — FATAL~~ : non retenue.
- [ ] ~~Option C — Récupérable (heuristique terrain)~~ : reportée — dead-code défensif conservé dans `mapViolationToConsequence` au cas où une heuristique serait implémentée plus tard.

**Décideur** : propriétaire fonctionnel Point RH, 2026-05-08.

---

## Procédure d'activation

L'arbitrage et l'alignement code étant faits :

1. ✅ ~~Trancher C1 et C2~~ — Option A retenue pour les deux.
2. ✅ ~~Implémenter dans `unified/evaluation.ts`~~ — `MIN_REGIME_BC` + `GPT_NUIT_CONSECUTIVES` désormais traitées via `REGLES_VIGILANCE_PURE`.
3. ✅ ~~Garde-fou de non-régression~~ — `src/__tests__/unifiedAlignment.test.ts` vérifie en CI que `REGLES_FATALES` reste un sous-ensemble de `REGLES_BLOQUANTES` et que les deux moteurs produisent le même statut sur les cas d'alignement.
4. **À faire** : lancer une comparaison shadow sur un échantillon de simulations historiques pour quantifier l'impact réel (cf. note d'impact dans la PR d'alignement).
5. **À faire** : positionner `UNIFIED_PRIMARY_ALIGNMENT_DONE=1` dans `.env.local` du VPS, redémarrer PM2.

## Vérification post-activation

Au démarrage avec `FEATURE_UNIFIED_PRIMARY=1` mais sans `UNIFIED_PRIMARY_ALIGNMENT_DONE=1`, le serveur émet (une fois par process) un warning :

```
[unified] FEATURE_UNIFIED_PRIMARY=1 ignored — divergences C1/C2 not yet arbitrated.
Set UNIFIED_PRIMARY_ALIGNMENT_DONE=1 once REGLES_FATALES is aligned with REGLES_BLOQUANTES
(see docs/unified-solver-divergences.md).
```

L'absence de ce warning dans les logs après redémarrage confirme que la bascule a pris effet.
