"use client";

/**
 * Composant partagé — nom/prénom d'un agent cliquable vers sa fiche.
 * Utilisé dans toute l'application pour garantir une navigation cohérente.
 *
 * - Si agentId est null/undefined : affichage texte simple (pas de lien)
 * - stopPropagation : évite de déclencher les handlers du parent (timeline, cartes cliquables…)
 */

import Link from "next/link";
import { cn } from "@/lib/utils";

interface AgentLinkProps {
  agentId: string | null | undefined;
  nom: string;
  prenom: string;
  className?: string;
}

export default function AgentLink({ agentId, nom, prenom, className }: AgentLinkProps) {
  const fullName = `${prenom} ${nom}`;

  if (!agentId) {
    return <span className={className}>{fullName}</span>;
  }

  return (
    <Link
      href={`/agents/${agentId}`}
      className={cn(
        "hover:underline hover:text-blue-600 transition-colors",
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {fullName}
    </Link>
  );
}
