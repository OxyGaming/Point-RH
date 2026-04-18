# Import Page Refactor — Design Spec
Date: 2026-04-19

## Contexte

La section "Imports récents" affichait les 5 derniers imports avec notion d'import "actif".
Ce modèle est incorrect : les imports sont cumulatifs (les `PlanningLigne` de tous les imports
coexistent dans la base). La notion d'import actif n'a donc pas de sens.

De plus, un nettoyage automatique supprime les `PlanningLigne` où `dateFinPop < aujourd'hui − 3 mois`
(déclenché après chaque import et via cron hebdomadaire).

## Objectifs

1. Remplacer "Imports récents" par un bandeau "Données disponibles" reflétant l'état global du dataset.
2. Afficher un message de résultat détaillé après chaque import réussi.

---

## 1. Bandeau "Données disponibles"

### Données affichées
- **Nombre d'agents** : `COUNT(DISTINCT agentId)` sur toutes les `PlanningLigne`
- **Nombre de lignes** : `COUNT` total sur toutes les `PlanningLigne` (live, post-cleanup)
- **Plage de dates** : `MIN(dateDebutPop)` → `MAX(dateFinPop)` sur toutes les `PlanningLigne`
- **Mention fixe** : "Seuil de rétention : 3 mois"

### État vide
Si aucune `PlanningLigne` en base : message "Aucune donnée — importez un fichier de planning."

### Requêtes Prisma (parallèles)
```ts
const [stats, agentCount] = await Promise.all([
  prisma.planningLigne.aggregate({
    _min: { dateDebutPop: true },
    _max: { dateFinPop: true },
    _count: { id: true },
  }),
  // Compte les agents non supprimés — source de vérité indépendante du planning
  prisma.agent.count({ where: { deletedAt: null } }),
])
```

### Composant
`src/components/import/ActiveDataBanner.tsx` — Server Component, pas de props, fetch interne.

---

## 2. Message de résultat post-import

### Données affichées
- Lignes créées (toujours des créations, les lignes ne sont jamais mises à jour)
- Agents créés (nouveau matricule)
- Agents mis à jour (matricule existant)
- Erreurs ignorées (si > 0)

### Évolution de `ImportResult`
```ts
// Avant
type ImportResult = {
  success: boolean
  importId: string
  nbLignes: number
  nbAgents: number
  erreurs: string[]
}

// Après
type ImportResult = {
  success: boolean
  importId: string
  nbLignes: number        // total lignes insérées
  agentsCreated: number   // nouveaux matricules
  agentsUpdated: number   // matricules existants mis à jour
  erreurs: string[]
}
```

### Tracking dans le service
Dans `importerPlanning()`, lors de l'upsert des agents, compter séparément :
- agents dont le matricule n'existait pas → `agentsCreated`
- agents dont le matricule existait déjà → `agentsUpdated`

Stratégie : avant l'upsert, récupérer les matricules déjà présents en base, puis comparer.

### Composant
`src/components/import/ImportResultMessage.tsx` — Client Component recevant `ImportResult` en prop,
affiché dans `ImportForm.tsx` après la réponse de l'API.

### Évolution de la réponse API
`POST /api/import` retourne déjà un JSON — enrichir avec `agentsCreated` et `agentsUpdated`.

---

## 3. Nettoyage

- Supprimer le fetch des 5 derniers imports dans `src/app/import/page.tsx`
- Vérifier si la route `GET /api/import` est utilisée ailleurs ; si non, la supprimer
- Retirer le champ `isActive` de l'affichage (il reste en base pour compatibilité)

---

## Fichiers modifiés

| Fichier | Action |
|---|---|
| `src/app/import/page.tsx` | Remplacer liste imports par `<ActiveDataBanner />` |
| `src/services/import.service.ts` | Enrichir `ImportResult` + tracking agents créés/mis à jour |
| `src/app/api/import/route.ts` | Propager `agentsCreated` / `agentsUpdated` dans la réponse POST |
| `src/components/import/ImportForm.tsx` | Afficher `<ImportResultMessage />` après import |
| `src/components/import/ActiveDataBanner.tsx` | Nouveau composant (bandeau global) |
| `src/components/import/ImportResultMessage.tsx` | Nouveau composant (résultat détaillé) |

---

## Hors périmètre

- Modification de la logique de cleanup (déjà implémentée)
- Suppression du champ `isActive` du schéma Prisma
- Pagination ou historique des imports
