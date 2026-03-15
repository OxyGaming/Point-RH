"use client";

/**
 * Actions admin sur la fiche agent — visible uniquement pour les ADMIN.
 * Rendu conditionnel côté client via le contexte auth.
 */
import { useAuth } from "@/components/auth/AuthProvider";
import DeleteAgentModal from "./DeleteAgentModal";

interface Props {
  agentId: string;
  agentNom: string;
  agentPrenom: string;
  agentMatricule: string;
}

export default function AdminAgentActions(props: Props) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return null;

  return (
    <div className="border border-red-200 rounded-xl p-4 bg-red-50/30">
      <p className="text-xs font-semibold uppercase tracking-wide text-red-500 mb-2">
        Zone administration
      </p>
      <DeleteAgentModal {...props} />
    </div>
  );
}
