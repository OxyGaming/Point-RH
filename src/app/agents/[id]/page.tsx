import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Link from "next/link";
import AgentEditForm from "./AgentEditForm";
import PlanningWithAnalysis from "./PlanningWithAnalysis";
import AdminAgentActions from "@/components/agents/AdminAgentActions";
import { getSession } from "@/lib/session";

async function getAgent(id: string) {
  const activeImport = await prisma.planningImport.findFirst({
    where: { isActive: true },
    orderBy: { importedAt: "desc" },
  });

  const [agent, jsTypes] = await Promise.all([
    prisma.agent.findUnique({
      where: { id },
      include: {
        planningLignes: {
          where: activeImport ? { importId: activeImport.id } : undefined,
          orderBy: { dateDebutPop: "asc" },
          take: 100,
        },
      },
    }),
    prisma.jsType.findMany({ where: { actif: true } }),
  ]);
  return { agent, jsTypes };
}

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ agent, jsTypes }, session] = await Promise.all([getAgent(id), getSession()]);
  if (!agent) notFound();

  const habilitations = JSON.parse(agent.habilitations) as string[];
  const lignes = agent.planningLignes;
  const importId = lignes[0]?.importId ?? null;

  /** Résout le JsType correspondant à une ligne (même logique que js-list/route.ts). */
  function resolveJsType(codeJs: string | null, typeJs: string | null) {
    if (typeJs) {
      const exact = jsTypes.find((jt) => jt.code === typeJs);
      if (exact) return exact;
    }
    if (codeJs) {
      const prefixe = codeJs.trim().split(" ")[0] ?? "";
      const byPrefix = jsTypes.find(
        (jt) =>
          prefixe.toUpperCase().startsWith(jt.code.toUpperCase()) ||
          jt.code.toUpperCase() === prefixe.toUpperCase()
      );
      if (byPrefix) return byPrefix;
    }
    return null;
  }

  const lignesSerializees = lignes.map((l) => {
    const jsType = resolveJsType(l.codeJs, l.typeJs);
    return {
      id: l.id,
      dateDebutPop: l.dateDebutPop.toISOString(),
      heureDebutPop: l.heureDebutPop,
      heureFinPop: l.heureFinPop,
      heureDebutJsType: jsType?.heureDebutStandard ?? undefined,
      heureFinJsType: jsType?.heureFinStandard ?? undefined,
      jsNpo: l.jsNpo,
      codeJs: l.codeJs,
      amplitudeHHMM: l.amplitudeHHMM,
      typeJs: l.typeJs,
      amplitudeCentesimal: l.amplitudeCentesimal,
      // Propagation depuis JsType — défaut OBLIGATOIRE si aucun JsType résolu
      flexibilite: jsType?.flexibilite ?? "OBLIGATOIRE",
    };
  });

  const nbJs = lignes.filter((l) => l.jsNpo === "JS").length;
  const isAdmin = session?.role === "ADMIN";

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-6 sm:mb-8">
        <Link href="/agents" className="text-gray-500 hover:text-gray-700 text-sm">← Agents</Link>
        <span className="hidden sm:block text-gray-400">/</span>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{agent.nom} {agent.prenom}</h1>
        {agent.deletedAt && (
          <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded font-medium">Supprimé</span>
        )}
      </div>

      <div className="grid lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Colonne gauche — informations */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-gray-800">Informations</h2>
            </CardHeader>
            <CardBody className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Matricule</span>
                <span className="font-mono font-medium text-gray-800">{agent.matricule}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">UCH</span>
                <span className="text-gray-800 text-right max-w-[60%] truncate">{agent.uch ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Grade</span>
                <span className="text-gray-800">{agent.codeSymboleGrade ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Poste</span>
                <span className="text-gray-800 text-right max-w-[60%]">{agent.posteAffectation ?? "—"}</span>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-semibold text-gray-800">Profil RH</h2>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {agent.agentReserve && <Badge variant="blue">Agent de réserve</Badge>}
                {agent.peutFaireNuit && <Badge variant="gray">Peut faire nuit</Badge>}
                {agent.peutEtreDeplace && <Badge variant="green">Peut être déplacé</Badge>}
                {agent.regimeB && <Badge variant="yellow">Régime B</Badge>}
                {agent.regimeC && <Badge variant="yellow">Régime C</Badge>}
              </div>
              {habilitations.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Préfixes JS autorisés</p>
                  <div className="flex flex-wrap gap-1">
                    {habilitations.map((h) => (
                      <Badge key={h} variant="blue">{h}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          <AgentEditForm
            agent={{
              id: agent.id,
              posteAffectation: agent.posteAffectation,
              agentReserve: agent.agentReserve,
              peutFaireNuit: agent.peutFaireNuit,
              peutEtreDeplace: agent.peutEtreDeplace,
              regimeB: agent.regimeB,
              regimeC: agent.regimeC,
              habilitations,
              lpaBaseId: agent.lpaBaseId,
            }}
          />

          {/* Zone admin — suppression */}
          {isAdmin && (
            <AdminAgentActions
              agentId={agent.id}
              agentNom={agent.nom}
              agentPrenom={agent.prenom}
              agentMatricule={agent.matricule}
            />
          )}
        </div>

        {/* Colonne droite — planning */}
        <div className="lg:col-span-3">
          <Card className="overflow-hidden">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h2 className="font-semibold text-gray-800">
                  Planning ({lignes.length} événements · {nbJs} JS)
                </h2>
                {nbJs > 0 && (
                  <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded self-start sm:self-auto">
                    ⚡ Cliquez sur une JS pour analyser
                  </span>
                )}
              </div>
            </CardHeader>
            <CardBody className="p-0">
              {lignes.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-8">Aucune ligne de planning</p>
              ) : (
                <PlanningWithAnalysis
                  lignes={lignesSerializees}
                  agentId={agent.id}
                  agentNom={agent.nom}
                  agentPrenom={agent.prenom}
                  agentMatricule={agent.matricule}
                  importId={importId}
                />
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
