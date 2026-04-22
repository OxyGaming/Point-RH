/**
 * Suivi de l'utilisation des réservistes.
 *
 * Pour chaque agent `agentReserve = true` et chaque préfixe d'habilitation,
 * calcule la date de dernière affectation (jourPlanning MAX sur PlanningLigne
 * où `jsNpo = "JS"` et `codeJs.startsWith(préfixe)`), puis le nombre de jours
 * d'inactivité jusqu'à aujourd'hui.
 *
 * Respecte le filtre d'agents utilisateur (UserAgentFilter) : si actif, seuls
 * les agents sélectionnés sont considérés, y compris pour le compteur d'alerte.
 */
import { prisma } from "@/lib/prisma";

export const SEUIL_ALERTE_JOURS = 120; // ≈ 4 mois

export interface CelluleInactivite {
  /** ISO (YYYY-MM-DD) de la dernière affectation sur ce préfixe, ou null si jamais. */
  dernierJour: string | null;
  /** Jours d'inactivité depuis la dernière affectation, ou null si jamais affecté. */
  joursInactivite: number | null;
}

export interface ReservisteRow {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  uch: string | null;
  /** Clé = préfixe d'habilitation. */
  cellules: Record<string, CelluleInactivite>;
}

export interface ReservistesInactiviteData {
  reservistes: ReservisteRow[];
  /** Union triée de tous les préfixes présents chez les réservistes affichés. */
  prefixes: string[];
  seuilAlerteJours: number;
  /** Nombre d'agents ayant au moins une cellule > seuil (hors "jamais"). */
  alerteCount: number;
  filterActive: boolean;
}

function parseHabilitations(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}

export async function getReservistesInactivite(userId: string): Promise<ReservistesInactiviteData> {
  // 1. Filtre utilisateur (éventuel)
  const filter = await prisma.userAgentFilter.findUnique({
    where: { userId },
    include: { items: { select: { agentId: true } } },
  });
  const filterActive = filter?.isActive ?? false;
  const filteredIds = filterActive ? filter!.items.map((i) => i.agentId) : null;

  // 2. Réservistes actifs (respecte le filtre)
  const agentsRaw = await prisma.agent.findMany({
    where: {
      agentReserve: true,
      deletedAt: null,
      ...(filteredIds ? { id: { in: filteredIds } } : {}),
    },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    select: {
      id: true,
      matricule: true,
      nom: true,
      prenom: true,
      uch: true,
      habilitations: true,
    },
  });

  const agents = agentsRaw.map((a) => ({
    ...a,
    habilitations: parseHabilitations(a.habilitations),
  }));

  // 3. Toutes les lignes JS pour ces agents en une requête
  const agentIds = agents.map((a) => a.id);
  const lignes = agentIds.length
    ? await prisma.planningLigne.findMany({
        where: {
          agentId: { in: agentIds },
          jsNpo: "JS",
        },
        select: { agentId: true, codeJs: true, jourPlanning: true },
      })
    : [];

  // 4. Index lignes par agent (on ignore les lignes sans codeJs : ne peuvent
  //    matcher aucun préfixe — ne devrait pas arriver sur des lignes JS, mais
  //    le schéma autorise codeJs nullable).
  const lignesByAgent = new Map<string, { codeJs: string; jourPlanning: Date }[]>();
  for (const l of lignes) {
    if (!l.agentId || !l.codeJs) continue;
    const entry = { codeJs: l.codeJs, jourPlanning: l.jourPlanning };
    const arr = lignesByAgent.get(l.agentId);
    if (arr) arr.push(entry);
    else lignesByAgent.set(l.agentId, [entry]);
  }

  // 5. Agrégation par (agent, préfixe)
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  const allPrefixes = new Set<string>();
  const reservistes: ReservisteRow[] = [];
  let alerteCount = 0;

  for (const a of agents) {
    const cellules: Record<string, CelluleInactivite> = {};
    const agentLignes = lignesByAgent.get(a.id) ?? [];
    let agentHasAlerte = false;

    for (const prefixe of a.habilitations) {
      allPrefixes.add(prefixe);
      let maxDate: Date | null = null;
      for (const l of agentLignes) {
        if (l.codeJs.startsWith(prefixe)) {
          if (!maxDate || l.jourPlanning > maxDate) maxDate = l.jourPlanning;
        }
      }
      if (maxDate) {
        const jours = Math.max(0, Math.floor((todayMs - maxDate.getTime()) / MS_PER_DAY));
        cellules[prefixe] = {
          dernierJour: maxDate.toISOString().slice(0, 10),
          joursInactivite: jours,
        };
        if (jours > SEUIL_ALERTE_JOURS) agentHasAlerte = true;
      } else {
        cellules[prefixe] = { dernierJour: null, joursInactivite: null };
      }
    }

    if (agentHasAlerte) alerteCount++;
    reservistes.push({
      id: a.id,
      matricule: a.matricule,
      nom: a.nom,
      prenom: a.prenom,
      uch: a.uch,
      cellules,
    });
  }

  return {
    reservistes,
    prefixes: [...allPrefixes].sort(),
    seuilAlerteJours: SEUIL_ALERTE_JOURS,
    alerteCount,
    filterActive,
  };
}
