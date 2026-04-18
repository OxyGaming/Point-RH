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
3. Passer les `PlanningLigne` sur une logique d'upsert par clé métier stable.

---

## 1. Bandeau "Données disponibles"

### Données affichées
- **Nombre d'agents** : `prisma.agent.count({ where: { deletedAt: null } })` — source de vérité indépendante du planning
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
  prisma.agent.count({ where: { deletedAt: null } }),
])
```

### Composant
`src/components/import/ActiveDataBanner.tsx` — Server Component, pas de props, fetch interne.

---

## 2. Upsert des PlanningLigne par clé métier

### Motivation
Actuellement `importerPlanning()` fait un `createMany` systématique : chaque import produit
de nouvelles lignes sans jamais écraser les existantes. Pour avoir de vrais compteurs métier
(lignes créées vs mises à jour), les lignes doivent être upsertées sur une clé stable.

### Clé métier (contrainte unique)
```
matricule + dateDebutPop + heureDebutPop
```
Un agent ne peut pas avoir deux créneaux démarrant à la même heure le même jour.
Cette triplet est stable entre deux imports du même fichier ou d'un fichier couvrant
la même période.

### Migration Prisma
Ajouter sur `PlanningLigne` :
```prisma
@@unique([matricule, dateDebutPop, heureDebutPop])
```
Et supprimer `importId` comme seul lien structurant (la ligne garde son `importId` pour
traçabilité, mais l'unicité ne dépend plus de lui).

### Stratégie d'upsert dans le service
Prisma ne supporte pas le `createMany` avec update des doublons. Stratégie en deux passes :

1. **Pré-chargement** : récupérer les clés existantes `(matricule, dateDebutPop, heureDebutPop)`
   pour toutes les lignes du fichier courant (une seule requête `findMany` avec `select` minimal).
2. **Partition** : séparer les lignes normalisées en deux ensembles :
   - `toCreate` : clé absente en base
   - `toUpdate` : clé présente en base
3. **Écriture** :
   - `prisma.planningLigne.createMany({ data: toCreate })` — batch
   - Pour `toUpdate` : `prisma.planningLigne.updateMany` n'accepte pas de valeurs différentes
     par ligne ; utiliser `prisma.$transaction([...toUpdate.map(l => prisma.planningLigne.update(...))])`.
     Si le volume est important, envisager un `upsert` natif Prisma par ligne dans la transaction.

### Performance
Les lignes d'un fichier de planning sont typiquement < 5 000. La transaction individuelle
par ligne mise à jour reste acceptable. Si un fichier dépasse 10 000 lignes, passer à du
SQL brut (`INSERT OR REPLACE` sur SQLite).

---

## 3. Message de résultat post-import

### Données affichées
- Lignes créées
- Lignes mises à jour
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
  lignesCreees: number
  lignesMisesAJour: number
  agentsCreated: number
  agentsUpdated: number
  erreurs: string[]
}
```

### Tracking dans le service
- **Agents** : avant l'upsert, récupérer les matricules déjà présents → comparer avec ceux du fichier.
- **Lignes** : résulte directement de la partition `toCreate` / `toUpdate` décrite ci-dessus.

### Composant
`src/components/import/ImportResultMessage.tsx` — Client Component recevant `ImportResult` en prop,
affiché dans `ImportForm.tsx` après la réponse de l'API.

### Évolution de la réponse API
`POST /api/import` retourne déjà un JSON — propager tous les nouveaux champs de `ImportResult`.

---

## 4. Nettoyage

- Supprimer le fetch des 5 derniers imports dans `src/app/import/page.tsx`
- Vérifier si la route `GET /api/import` est utilisée ailleurs ; si non, la supprimer
- Retirer le champ `isActive` de l'affichage (il reste en base pour compatibilité)

---

## Fichiers modifiés

| Fichier | Action |
|---|---|
| `prisma/schema.prisma` | Ajouter `@@unique([matricule, dateDebutPop, heureDebutPop])` sur `PlanningLigne` |
| `src/services/import.service.ts` | Remplacer `createMany` par upsert en deux passes + enrichir `ImportResult` |
| `src/app/api/import/route.ts` | Propager tous les nouveaux champs dans la réponse POST |
| `src/app/import/page.tsx` | Remplacer liste imports par `<ActiveDataBanner />` |
| `src/components/import/ImportForm.tsx` | Afficher `<ImportResultMessage />` après import |
| `src/components/import/ActiveDataBanner.tsx` | Nouveau composant (bandeau global) |
| `src/components/import/ImportResultMessage.tsx` | Nouveau composant (résultat détaillé) |

---

## Hors périmètre

- Modification de la logique de cleanup (déjà implémentée)
- Suppression du champ `isActive` du schéma Prisma
- Pagination ou historique des imports
