import Badge from "./Badge";
import type { StatutAgent } from "@/types/simulation";

const MAP: Record<StatutAgent, { variant: "green" | "yellow" | "red"; label: string }> = {
  CONFORME: { variant: "green", label: "Conforme" },
  VIGILANCE: { variant: "yellow", label: "Vigilance" },
  NON_CONFORME: { variant: "red", label: "Non conforme" },
};

export default function StatutBadge({ statut }: { statut: StatutAgent }) {
  const { variant, label } = MAP[statut] ?? { variant: "gray", label: statut };
  return <Badge variant={variant}>{label}</Badge>;
}
