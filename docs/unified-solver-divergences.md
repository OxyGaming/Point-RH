# Solveur unifié — divergences à arbitrer avant `FEATURE_UNIFIED_PRIMARY=1`

Le solveur unifié (`src/lib/simulation/unified/`) coexiste avec le moteur historique (`src/engine/rules.ts`, `src/lib/simulation/`). Tant que les divergences listées ci-dessous ne sont pas arbitrées et alignées, le flag `FEATURE_UNIFIED_PRIMARY=1` est ignoré côté API : le rapport unifié est calculé en shadow (logs serveur) mais n'est pas exposé à l'UI.

Pour autoriser l'exposition UI, il faut positionner **les deux** flags ensemble côté serveur :

```
FEATURE_UNIFIED_PRIMARY=1
UNIFIED_PRIMARY_ALIGNMENT_DONE=1
```

Le second flag est une déclaration : "j'ai pris connaissance du contenu de ce document, les divergences listées sont soit corrigées dans le code, soit explicitement acceptées comme nouveau comportement par le métier."

---

## C1 — `MIN_REGIME_BC` : VIGILANCE (engine) vs FATAL (unified)

| | Moteur historique | Solveur unifié |
|---|---|---|
| Source | [src/engine/ruleTypes.ts](../src/engine/ruleTypes.ts) — `REGLES_BLOQUANTES` | [src/lib/simulation/unified/evaluation.ts](../src/lib/simulation/unified/evaluation.ts) — `REGLES_FATALES` |
| `MIN_REGIME_BC` listée ? | Non | Oui |
| Comportement si seule violation | Statut `VIGILANCE` — agent reste mobilisable, score pénalisé | `faisable=false` — agent rejeté de toute solution |

**Cas concret** : agent en régime B ou C, JS dont l'amplitude est inférieure au minimum réglementaire (`travailEffectif.minRegimeBC`, défaut configuré dans `WorkRules`).

**Décision attendue** :

- [ ] Option A — VIGILANCE (alignement sur engine) : retirer `MIN_REGIME_BC` de `REGLES_FATALES`. Le solveur unifié laisse l'agent en VIGILANCE comme le legacy.
- [ ] Option B — FATAL (alignement sur unified) : ajouter `MIN_REGIME_BC` à `REGLES_BLOQUANTES`. L'engine refuse l'agent de la même façon. Impact : peut faire disparaître des agents proposés en VIGILANCE aujourd'hui, à valider sur dataset historique.

**Décideur** : à confirmer.

---

## C2 — `GPT_NUIT_CONSECUTIVES` : VIGILANCE (engine) vs irrécupérable (unified)

| | Moteur historique | Solveur unifié |
|---|---|---|
| Source | [src/engine/rules.ts:454](../src/engine/rules.ts) émet la violation | [src/lib/simulation/unified/evaluation.ts:287-292](../src/lib/simulation/unified/evaluation.ts) — mapper `INDUCED_NUITS` retourne `null` |
| Listée dans bloquantes/fatales ? | Non — VIGILANCE par nature | Non — mais `null` côté mapper = `irrecuperable=true` = `faisable=false` |
| Comportement si seule violation | Statut `VIGILANCE` — agent mobilisable | Agent rejeté |

**Cas concret** : agent qui aurait deux GPT de nuit consécutives après prise de l'imprévu. La règle est marquée `resolvable: true` côté `detecterConflitsInduits` mais aucune heuristique fiable n'a été calibrée pour identifier la JS de la GPT précédente à libérer (commentaire explicite dans `evaluation.ts:287-292`).

**Décision attendue** :

- [ ] Option A — VIGILANCE : autoriser `INDUCED_NUITS` comme violation acceptable sans tentative de cascade (statut VIGILANCE pur, pas de récupération). Le solveur retourne l'agent comme faisable, le décideur arbitre humainement.
- [ ] Option B — FATAL : ajouter `GPT_NUIT_CONSECUTIVES` à `REGLES_BLOQUANTES`. Engine refuse l'agent comme l'unified.
- [ ] Option C — Récupérable : implémenter une heuristique de libération (la JS la plus récente de la GPT nuit précédente) à calibrer sur dataset terrain. Coûteux, à reporter.

**Décideur** : à confirmer.

---

## Procédure d'activation

1. Trancher C1 et C2 ci-dessus, marquer la décision dans ce document.
2. Implémenter les modifications dans `engine/ruleTypes.ts` et/ou `unified/evaluation.ts` selon la décision.
3. Ajouter un test garde-fou qui vérifie l'égalité `REGLES_FATALES === new Set(REGLES_BLOQUANTES)` (ou la divergence acceptée explicite).
4. Lancer une comparaison shadow sur un échantillon de simulations historiques pour quantifier l'impact (changements de scénarios, agents précédemment proposés qui disparaissent ou apparaissent).
5. Une fois l'impact validé par le métier, positionner `UNIFIED_PRIMARY_ALIGNMENT_DONE=1` dans `.env.local` du VPS, redémarrer PM2.

## Vérification post-activation

Au démarrage avec `FEATURE_UNIFIED_PRIMARY=1` mais sans `UNIFIED_PRIMARY_ALIGNMENT_DONE=1`, le serveur émet (une fois par process) un warning :

```
[unified] FEATURE_UNIFIED_PRIMARY=1 ignored — divergences C1/C2 not yet arbitrated.
Set UNIFIED_PRIMARY_ALIGNMENT_DONE=1 once REGLES_FATALES is aligned with REGLES_BLOQUANTES
(see docs/unified-solver-divergences.md).
```

L'absence de ce warning dans les logs après redémarrage confirme que la bascule a pris effet.
