# Habilitations — Auto-proposition après import

Date: 2026-04-22

## Contexte

Les **habilitations** d'un agent sont une liste de **préfixes de codes JS** stockée dans `Agent.habilitations` (JSON string). Elles conditionnent l'éligibilité de l'agent en simulation : un agent avec `["GIC"]` peut couvrir toute JS dont `codeJs` commence par `"GIC"`.

Aujourd'hui, ces habilitations sont **saisies manuellement** sur `/admin/habilitations`. Ce processus est chronophage et sujet aux oublis : un agent récemment arrivé sans habilitation est exclu silencieusement de toutes les simulations.

Le planning importé contient pourtant l'information utile : **les `codeJs` effectivement tenus par chaque agent** révèlent de facto ses habilitations.

## Objectif

Après un import de planning réussi, proposer automatiquement à l'admin d'enrichir les habilitations des agents à partir des JS qu'ils ont tenues, avec une **validation case par case avant toute écriture en base**.

---

## 1. Algorithme de proposition

### Entrées
- Liste des agents présents dans le planning importé (déduplication par `agentId`).
- Pour chaque agent : ses habilitations actuelles (`Agent.habilitations`), son historique complet de `PlanningLigne`.

### Règle de proposition

Pour chaque agent :

1. Collecter l'ensemble des `codeJs` distincts depuis **tout l'historique** de `PlanningLigne` de l'agent, en filtrant :
   - `jsNpo = "JS"` (exclut les NPO — absences, congés)
   - `codeJs IS NOT NULL AND codeJs != ""`
2. Pour chaque `code` de cet ensemble :
   - Si **aucun** préfixe actuel `p ∈ habilitations` ne vérifie `code.startsWith(p)` → le proposer.
   - Sinon, le code est déjà couvert, on ignore.
3. Enrichir chaque proposition avec :
   - `nbJoursTenus` = nombre de `PlanningLigne` avec ce `codeJs` pour cet agent
   - `dernierJour` = `MAX(jourPlanning)` pour ce (`agentId`, `codeJs`)

### Exemples

| Habilitations actuelles | `codeJs` tenus | Propositions |
|---|---|---|
| `["GIC"]` | `GIC015`, `GIC020` | aucune (couvert par `GIC`) |
| `[]` | `GIC015`, `BAD020` | `GIC015`, `BAD020` |
| `["BAD"]` | `BAD020`, `GIC015` | `GIC015` |
| `["GIC015"]` | `GIC020` | `GIC020` (`GIC015` ne couvre pas `GIC020`) |

### Exclusions
- **Agents soft-deleted** (`deletedAt != null`) → non analysés.
- **Lignes NPO** (absences) → non comptabilisées.
- **`codeJs` vides ou nuls** → ignorés.

### Idempotence

L'algorithme est idempotent : une proposition validée (préfixe ajouté aux habilitations) ne réapparaîtra pas à l'import suivant, car elle couvre désormais ses propres `codeJs`. Pas de persistance d'état intermédiaire nécessaire.

### Performance

Volume typique : ~2500 lignes de planning × ~250 agents par import. La requête `groupBy (agentId, codeJs)` avec `WHERE jsNpo = 'JS' AND codeJs IS NOT NULL`, couverte par l'index `[agentId]` existant sur `PlanningLigne`, doit rester sous les 200 ms.

---

## 2. UI — Panneau "Habilitations proposées"

Affiché **sous** le composant `ImportResultMessage` sur la page `/import`, uniquement pour les utilisateurs admin et uniquement si l'import précédent a réussi. Le panneau appelle `GET /api/habilitations/propositions` au montage, dès qu'un résultat d'import positif lui est passé en prop, pour récupérer les propositions.

### Structure

```
┌─ Habilitations proposées (12 agents, 28 préfixes) ──────────────┐
│  [Tout sélectionner]  [Tout désélectionner]  [Valider (0)]      │
│                                                                 │
│  DUPONT Jean  —  matricule 8006331J                             │
│  Actuelles : GIC, BAD                                           │
│  ☑ GIC015   12 jours, dernier le 15/04/2026                     │
│  ☑ BAD020    3 jours, dernier le 08/03/2026                     │
│                                                                 │
│  MARTIN Luc  —  matricule 9410129B                              │
│  Actuelles : (aucune)                                           │
│  ☑ GIC045   20 jours, dernier le 18/04/2026                     │
│                                                                 │
│  …                                                              │
└─────────────────────────────────────────────────────────────────┘
```

### Comportement

- Cases cochées par défaut (optimiste — la majorité des propositions seront validées).
- Le compteur du bouton "Valider (N)" = nombre total de cases cochées.
- "Tout sélectionner / Tout désélectionner" agit sur toutes les propositions visibles.
- Agents triés par `nom, prenom`.
- Champ de recherche (nom / matricule) si ≥ 20 agents.
- État en cours de validation : spinner sur le bouton "Valider", boutons désactivés.
- Erreurs de l'API : affichées inline en tête du panneau ; les propositions non traitées restent cochées pour relance.

### État vide

Si aucune proposition (toutes les JS tenues sont déjà couvertes), le panneau est remplacé par un message discret :

> ✓ Aucune habilitation à ajuster — toutes les JS tenues sont déjà couvertes.

### Non-admin

Le panneau n'est pas rendu. L'API `GET /api/habilitations/propositions` renvoie 403 pour les non-admins.

### Composant principal

`src/components/import/HabilitationsProposalsPanel.tsx` — Client Component, reçoit les propositions via fetch, gère l'état local des cases à cocher, appelle l'API de validation.

---

## 3. API

### `GET /api/habilitations/propositions`

**Auth** : admin uniquement.

**Réponse 200** :
```ts
{
  agents: Array<{
    agentId: string,
    matricule: string,
    nom: string,
    prenom: string,
    habilitationsActuelles: string[],
    propositions: Array<{
      codeJs: string,
      nbJoursTenus: number,
      dernierJour: string, // ISO date
    }>,
  }>,
  totalAgents: number,
  totalPropositions: number,
}
```

**Réponses d'erreur** : 401 (non authentifié), 403 (non admin), 500 (erreur serveur).

Appel déclenché côté client **après** un import réussi.

### `POST /api/habilitations/propositions/valider`

**Auth** : admin uniquement.
**Rate limit** : 10 requêtes / minute / utilisateur (aligné sur les autres endpoints sensibles).

**Requête** :
```ts
{
  validations: Array<{
    agentId: string,
    prefixesAAjouter: string[],
  }>,
}
```

**Traitement** (transaction Prisma) :
1. Pour chaque `agentId` : relire `habilitations` depuis la base (évite l'écrasement d'une modification manuelle concurrente).
2. Merger : `nouveau = [...new Set([...actuel, ...prefixesAAjouter])]`.
3. Sauvegarder.
4. Logger l'audit : `HABILITATION_AUTO_VALIDATED` par agent, avec détail des préfixes ajoutés et identifiant de l'utilisateur.

**Réponse 200** :
```ts
{
  success: boolean,
  agentsMisAJour: number,
  prefixesAjoutes: number, // total cumulé
  erreurs?: Array<{ agentId: string, message: string }>,
}
```

---

## 4. Service métier

**`src/services/habilitation-proposals.service.ts`** — logique pure, sans dépendance HTTP.

### API

```ts
export interface HabilitationProposal {
  codeJs: string;
  nbJoursTenus: number;
  dernierJour: Date;
}

export interface AgentProposals {
  agentId: string;
  matricule: string;
  nom: string;
  prenom: string;
  habilitationsActuelles: string[];
  propositions: HabilitationProposal[];
}

export async function calculerPropositionsHabilitations(): Promise<AgentProposals[]>;

export async function validerPropositions(
  validations: Array<{ agentId: string; prefixesAAjouter: string[] }>,
  actorEmail: string,
): Promise<{ agentsMisAJour: number; prefixesAjoutes: number; erreurs: Array<{ agentId: string; message: string }> }>;
```

### Helpers internes

- `estCouvert(code: string, prefixes: string[]): boolean` — `prefixes.some(p => code.startsWith(p))`.
- `mergerHabilitations(actuel: string[], ajouts: string[]): string[]` — union, dédoublonnage, ordre alphabétique préservé.

---

## 5. Edge cases

| Situation | Comportement |
|---|---|
| Agent sans habilitation + aucun codeJs tenu | N'apparaît pas dans les propositions. |
| Agent soft-deleted | Exclu dès la requête SQL. |
| codeJs contenant uniquement des espaces | Normalisé via `trim()` ; ignoré si vide après. |
| Propositions chevauchantes (deux `codeJs` dont un préfixe de l'autre, ex: `GIC` et `GIC015`) | Les deux sont proposés indépendamment. L'admin décide. |
| Admin valide pendant qu'un autre admin modifie les habilitations manuellement | Le merge côté serveur repart de la valeur fraîche en base → aucune perte. |
| Liste de `validations` vide en POST | 200 avec `agentsMisAJour: 0`, pas d'erreur. |
| `agentId` inconnu ou soft-deleted en POST | Ignoré, ajouté dans `erreurs` avec message explicite. |
| Préfixe vide après `trim()` dans `prefixesAAjouter` | Filtré silencieusement avant merge (sans erreur remontée). |
| `prefixesAAjouter` entièrement vide après filtrage pour un agent | L'agent est ignoré ; `agentsMisAJour` ne l'incrémente pas. |

---

## 6. Audit

Chaque validation réussie génère une entrée `AuditLog` par agent :

- `action`: `"HABILITATION_AUTO_VALIDATED"`
- `entity`: `"Agent"`
- `entityId`: `agent.id`
- `userEmail`: admin ayant validé
- `details`: `{ prefixesAjoutes: string[], habilitationsApres: string[], source: "import-proposal" }`

---

## 7. Tests

### Unitaires — `habilitation-proposals.service.test.ts`

- Agent sans habilitation, a tenu `GIC015` → propose `GIC015`
- Agent avec `["GIC"]`, a tenu `GIC015` → aucune proposition
- Agent avec `["BAD"]`, a tenu `GIC015` et `BAD020` → propose `GIC015` seul
- Agent avec `["GIC015"]`, a tenu `GIC020` → propose `GIC020`
- Exclusion NPO : agent a tenu uniquement des lignes `jsNpo = "NPO"` → aucune proposition
- Exclusion soft-delete : agent avec `deletedAt != null` → non retourné
- `codeJs` null/vide → ignoré
- `nbJoursTenus` et `dernierJour` correctement calculés
- `mergerHabilitations` : dédoublonnage + ordre préservé

### Intégration — API

- `GET /propositions` sans auth → 401
- `GET /propositions` non-admin → 403
- `GET /propositions` admin → 200 avec structure conforme
- `POST /valider` sans auth → 401
- `POST /valider` non-admin → 403
- `POST /valider` avec validations valides → habilitations mises à jour en DB + `AuditLog` créé
- `POST /valider` avec `agentId` inconnu → 200 avec erreur dans la réponse
- Race condition : écrire manuellement entre GET et POST → le POST merge avec la valeur fraîche

---

## 8. Hors-scope

- **File d'attente persistante de propositions** (non retenue : idempotence suffit).
- **Historique des propositions refusées** (pas de mémoire du "non" — la proposition revient si le code est re-tenu).
- **Validation automatique sans confirmation** (trop risqué — l'admin doit rester dans la boucle).
- **Propositions sur les NPO** (hors périmètre métier : une absence n'est pas une habilitation).

---

## 9. Impact sur le code existant

| Fichier | Modification |
|---|---|
| `src/services/habilitation-proposals.service.ts` | **Nouveau** — logique métier. |
| `src/app/api/habilitations/propositions/route.ts` | **Nouveau** — endpoint GET. |
| `src/app/api/habilitations/propositions/valider/route.ts` | **Nouveau** — endpoint POST. |
| `src/components/import/HabilitationsProposalsPanel.tsx` | **Nouveau** — UI du panneau. |
| `src/components/import/ImportForm.tsx` ou la page `/import` | Intégration du panneau après import réussi. |
| `src/__tests__/habilitationProposals.test.ts` | **Nouveau** — tests unitaires. |

Aucune migration Prisma nécessaire (les champs `Agent.habilitations`, `PlanningLigne.codeJs`, `jsNpo` existent déjà).
