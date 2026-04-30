/**
 * Journalisation des actions sensibles (audit log).
 * Enregistre en base chaque action admin : suppression d'agent,
 * modification des règles RH, gestion des utilisateurs, etc.
 */
import { prisma } from "./prisma";
import type { SessionUser } from "./session";

export type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "CREATE_USER"
  | "UPDATE_USER"
  | "DELETE_USER"
  | "DELETE_AGENT"
  | "UPDATE_AGENT"
  | "UPDATE_WORK_RULES"
  | "RESET_WORK_RULES"
  | "IMPORT_PLANNING"
  | "EXPORT_PARAMETRAGE"
  | "IMPORT_PARAMETRAGE"
  | "PURGE_SIMULATIONS"
  | "REGISTER_REQUEST"
  | "APPROVE_REGISTRATION"
  | "REJECT_REGISTRATION"
  | "RESTORE_AGENT"
  | "CLEANUP_PLANNING"
  | "HABILITATION_AUTO_VALIDATED"
  | "CREATE_ZERO_LOAD_PREFIX"
  | "UPDATE_ZERO_LOAD_PREFIX"
  | "DELETE_ZERO_LOAD_PREFIX"
  | "PURGE_HABILITATIONS";

export async function logAudit(
  action: AuditAction,
  entity: string,
  options?: {
    user?: SessionUser | null;
    entityId?: string;
    details?: Record<string, unknown>;
  }
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: options?.user?.id ?? null,
        userEmail: options?.user?.email ?? null,
        action,
        entity,
        entityId: options?.entityId ?? null,
        details: JSON.stringify(options?.details ?? {}),
      },
    });
  } catch {
    // Ne jamais faire échouer une action métier pour un problème de log
    console.error("[audit] Impossible d'enregistrer l'action", action);
  }
}
