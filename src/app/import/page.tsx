import ImportForm from "@/components/import/ImportForm";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";

async function getRecentImports() {
  return prisma.planningImport.findMany({
    orderBy: { importedAt: "desc" },
    take: 5,
  });
}

export default async function ImportPage() {
  const imports = await getRecentImports();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Import du planning</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Importez un fichier Excel ou TXT tabulé de planning agents (format SNCF standard).
        </p>
      </div>

      {/* Info persistance */}
      <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-800">
        <strong>Règle de gestion :</strong> L'import crée ou met à jour les agents, mais ne supprime
        jamais un agent existant. Les agents sont <strong>rémanents</strong>.
      </div>

      <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-800">Nouveau fichier</h2>
          </CardHeader>
          <CardBody>
            <ImportForm />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-800">Imports récents</h2>
          </CardHeader>
          <CardBody>
            {imports.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">Aucun import encore effectué</p>
            ) : (
              <div className="space-y-3">
                {imports.map((imp) => (
                  <div key={imp.id} className="flex items-start justify-between py-2 border-b border-gray-100 last:border-0 gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-800 truncate max-w-[180px]">{imp.filename}</p>
                        {imp.isActive && (
                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium shrink-0">actif</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(imp.importedAt).toLocaleDateString("fr-FR", {
                          day: "numeric", month: "short", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="text-right text-xs text-gray-500 shrink-0">
                      <p>{imp.nbLignes} lignes</p>
                      <p>{imp.nbAgents} agents</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Format info */}
      <Card className="mt-4 sm:mt-8">
        <CardHeader>
          <h2 className="font-semibold text-gray-800">Colonnes attendues (Excel et TXT)</h2>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {[
              "UCH", "CODE UCH", "NOM", "PRENOM", "CODE IMMATRICULATION",
              "CODE APES", "CODE SYMBOLE GRADE", "CODE COLLEGE GRADE",
              "DATE DEBUT POP / NPO", "HEURE DEBUT POP / NPO",
              "HEURE FIN POP / NPO", "DATE FIN POP / NPO",
              "AMPLITUDE POP / NPO (100E/HEURE)", "AMPLITUDE POP / NPO (HH:MM)",
              "DUREE EFFECTIVE POP (100E/HEURE)", "DUREE EFFECTIVE POP (HH:MM)",
              "JS / NPO", "CODE JS / CODE NPO", "TYPE JS / FAM. NPO",
              "VALEUR NPO", "UCH JS", "CODE UCH JS", "CODE ROULEMENT JS", "NUMERO JS",
            ].map((col) => (
              <span key={col} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded font-mono truncate">
                {col}
              </span>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
