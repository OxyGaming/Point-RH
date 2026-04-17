import ImportForm from "@/components/import/ImportForm";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

async function getRecentImports() {
  return prisma.planningImport.findMany({
    orderBy: { importedAt: "desc" },
    take: 5,
  });
}

const COLUMNS = [
  "UCH", "CODE UCH", "NOM", "PRENOM", "CODE IMMATRICULATION",
  "CODE APES", "CODE SYMBOLE GRADE", "CODE COLLEGE GRADE",
  "DATE DEBUT POP / NPO", "HEURE DEBUT POP / NPO",
  "HEURE FIN POP / NPO", "DATE FIN POP / NPO",
  "AMPLITUDE POP / NPO (100E/HEURE)", "AMPLITUDE POP / NPO (HH:MM)",
  "DUREE EFFECTIVE POP (100E/HEURE)", "DUREE EFFECTIVE POP (HH:MM)",
  "JS / NPO", "CODE JS / CODE NPO", "TYPE JS / FAM. NPO",
  "VALEUR NPO", "UCH JS", "CODE UCH JS", "CODE ROULEMENT JS", "NUMERO JS",
];

export default async function ImportPage() {
  const imports = await getRecentImports();

  return (
    <div className="p-5 sm:p-7 lg:p-8 max-w-5xl">

      {/* Page header */}
      <div className="mb-7">
        <p className="text-[10px] font-[700] uppercase tracking-[0.12em] text-[#2563eb] mb-1">Planning</p>
        <h1 className="text-[26px] font-[800] text-[#0f1b4c] tracking-tight leading-none">Import du planning</h1>
        <p className="text-[13px] text-[#4a5580] mt-2">
          Importez un fichier Excel ou TXT tabulé de planning agents (format SNCF standard).
        </p>
      </div>

      {/* Règle de gestion */}
      <div className="mb-6 flex items-start gap-2.5 bg-[#eff6ff] border border-[#bfdbfe] rounded-xl px-4 py-3">
        <svg className="w-4 h-4 text-[#2563eb] shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p className="text-[12px] text-[#1e40af] font-[500]">
          L'import crée ou met à jour les agents, mais ne supprime jamais un agent existant. Les agents sont <strong>rémanents</strong>.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 mb-5">
        {/* Drop zone */}
        <Card>
          <CardHeader>
            <CardTitle>Nouveau fichier</CardTitle>
            <CardSubtitle>Glissez ou cliquez pour sélectionner</CardSubtitle>
          </CardHeader>
          <CardBody>
            <ImportForm />
          </CardBody>
        </Card>

        {/* Imports récents */}
        <Card>
          <CardHeader>
            <CardTitle>Imports récents</CardTitle>
            <CardSubtitle>{imports.length} fichier{imports.length !== 1 ? "s" : ""} importé{imports.length !== 1 ? "s" : ""}</CardSubtitle>
          </CardHeader>
          <CardBody className="py-2">
            {imports.length === 0 ? (
              <p className="text-[#8b93b8] text-[13px] text-center py-8">Aucun import encore effectué</p>
            ) : (
              <div>
                {imports.map((imp) => (
                  <div key={imp.id} className="flex items-center gap-3 py-3 border-b border-[#e2e8f5] last:border-0">
                    <div className="w-8 h-8 rounded-lg bg-[#1a3070] flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-[600] text-[#0f1b4c] truncate">{imp.filename}</p>
                        {imp.isActive && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-[700] bg-[#ecfdf5] text-[#065f46] px-2 py-0.5 rounded-full shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#059669] inline-block" />
                            actif
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#8b93b8] mt-0.5 font-mono">
                        {new Date(imp.importedAt).toLocaleDateString("fr-FR", {
                          day: "numeric", month: "short", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[13px] font-[700] text-[#0f1b4c] font-mono">{imp.nbLignes}</p>
                      <p className="text-[11px] text-[#8b93b8]">{imp.nbAgents} agents</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Colonnes attendues */}
      <Card>
        <CardHeader>
          <CardTitle>Colonnes attendues (Excel et TXT)</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 divide-x-0 divide-y-0" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1px", background: "#e2e8f5" }}>
            {COLUMNS.map((col) => (
              <span key={col} className="bg-white px-3 py-2 text-[11px] font-mono text-[#4a5580] truncate">
                {col}
              </span>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
