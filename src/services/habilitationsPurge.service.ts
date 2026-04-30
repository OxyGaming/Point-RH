/**
 * Service de purge des habilitations agents.
 *
 * Réinitialise le champ `Agent.habilitations` à `"[]"` (tableau JSON vide)
 * pour soit la totalité des agents actifs, soit ceux d'une UCH donnée.
 *
 * Sécurité :
 *   - Les agents soft-deleted (deletedAt non null) sont toujours préservés.
 *   - Les agents déjà sans habilitations ne sont pas comptés (filtre SQL).
 *   - Idempotent : rejouer la purge sur un scope déjà vidé renvoie 0.
 *
 * Note : aucune sauvegarde des valeurs antérieures côté table dédiée — l'audit
 * log enregistre le scope et le compte, mais pas l'inverse permettant une
 * restauration ligne à ligne. La sauvegarde DB (via deploy-rh.sh) reste le
 * seul filet de sécurité granulaire.
 */
import { prisma } from "@/lib/prisma";

export type PurgeScope = { type: "all" } | { type: "uch"; uch: string };

export interface UchSummary {
  uch: string;
  totalAgents: number;
  agentsWithHabilitations: number;
}

export interface PurgeResult {
  agentsUpdated: number;
  scope: PurgeScope;
}

/**
 * Liste des UCH distinctes (agents actifs) avec compteurs.
 * Trié par UCH croissante. Les agents sans UCH (uch null) sont exclus.
 */
export async function listUchsWithHabilitationStats(): Promise<UchSummary[]> {
  const rows = await prisma.agent.findMany({
    where: { deletedAt: null, uch: { not: null } },
    select: { uch: true, habilitations: true },
  });

  const map = new Map<string, { total: number; withHab: number }>();
  for (const row of rows) {
    if (!row.uch) continue;
    const entry = map.get(row.uch) ?? { total: 0, withHab: 0 };
    entry.total += 1;
    if (row.habilitations && row.habilitations !== "[]" && row.habilitations.trim() !== "") {
      entry.withHab += 1;
    }
    map.set(row.uch, entry);
  }

  const result: UchSummary[] = Array.from(map.entries()).map(([uch, e]) => ({
    uch,
    totalAgents: e.total,
    agentsWithHabilitations: e.withHab,
  }));

  result.sort((a, b) => a.uch.localeCompare(b.uch));
  return result;
}

/**
 * Compteur global des agents actifs ayant au moins une habilitation.
 * Utilisé pour le preview du scope "toute la base".
 */
export async function countAgentsWithHabilitations(): Promise<{ totalAgents: number; agentsWithHabilitations: number }> {
  const totalAgents = await prisma.agent.count({ where: { deletedAt: null } });
  const agentsWithHabilitations = await prisma.agent.count({
    where: { deletedAt: null, NOT: { habilitations: "[]" } },
  });
  return { totalAgents, agentsWithHabilitations };
}

/**
 * Purge les habilitations selon le scope demandé. Retourne le nombre d'agents
 * réellement impactés (ceux qui avaient au moins une habilitation).
 *
 * Validation : si scope="uch", `uch` doit être non vide après trim.
 */
export async function purgeHabilitations(scope: PurgeScope): Promise<PurgeResult> {
  if (scope.type === "uch") {
    const uch = scope.uch.trim();
    if (uch.length === 0) {
      throw new Error("UCH requise pour la purge ciblée.");
    }
    const res = await prisma.agent.updateMany({
      where: {
        deletedAt: null,
        uch,
        NOT: { habilitations: "[]" },
      },
      data: { habilitations: "[]" },
    });
    return { agentsUpdated: res.count, scope: { type: "uch", uch } };
  }

  const res = await prisma.agent.updateMany({
    where: {
      deletedAt: null,
      NOT: { habilitations: "[]" },
    },
    data: { habilitations: "[]" },
  });
  return { agentsUpdated: res.count, scope: { type: "all" } };
}
