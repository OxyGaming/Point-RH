/**
 * Page de démonstration du mode Cascade — sur les VRAIES données du dataset.
 *
 * Charge l'import actif depuis Prisma, identifie la JS Poncet GIC006R 03 mai
 * (cas terrain), et lance la simulation. Pour rendre la cascade observable
 * sur des données réelles, on simule **l'indisponibilité supplémentaire**
 * des candidats prioritaires (Belabbas, Ollier) afin de saturer les options
 * Direct/Figeage et forcer le moteur à explorer une chaîne de remplacement.
 *
 * Aucune écriture DB. La page filtre simplement le pool d'agents passé au
 * moteur — les données restent intactes.
 */

import { prisma } from "@/lib/prisma";
import { combineDateTime } from "@/lib/utils";
import { executerSimulationMultiJs } from "@/lib/simulation/multiJs";
import type { AgentContext, PlanningEvent } from "@/engine/rules";
import type { JsCible } from "@/types/js-simulation";
import MultiJsResultsPanel from "@/components/multi-js/MultiJsResultsPanel";

export const dynamic = "force-dynamic";

/**
 * Agents écartés par défaut pour saturer les candidats Direct.
 *
 * On garde OLLIER dans le pool : il est en CONFLIT_HORAIRE strict
 * (sur GIV006R 20:30→04:30 le 03/05) → c'est lui qui déclenchera la
 * passe Cascade, en tentant de libérer sa GIV006R via un autre agent.
 *
 * On exclut CHENNOUF aussi : il est en CONFLIT_HORAIRE souple (BAD015R
 * 13:00→21:00 ne chevauche pas la cible évaluée sur l'horaire standard
 * GIC006R 20:30 = pile à la jointure), donc le moteur le considère Direct.
 */
const AGENTS_INDISPONIBLES_DEFAUT = [
  "BELABBAS",      // libre 03/05 → prendrait Direct
  "CHENNOUF",      // évalué Direct car BAD015R termine à 21:00 = jointure GIC006R
  "ACHILLE",       // libre → prendrait Direct
  "MENDI",         // libre → prendrait Direct
  "EL JAID",       // libre → prendrait Direct
  "LEGUAY",        // sur JS Z → assimilé libre
  "BARTHOMEUF",    // libre → prendrait Direct
  "PINQUE",        // libre → prendrait Direct
  "SEFOUHI",       // libre → prendrait Direct
];

interface PageProps {
  searchParams: Promise<{ exclus?: string }>;
}

export default async function DemoCascadeRealPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const exclusList = params.exclus
    ? params.exclus.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    : AGENTS_INDISPONIBLES_DEFAUT;
  const AGENTS_INDISPONIBLES = new Set(exclusList);
  // ─── 1. Récupérer l'import actif et sa JS cible Poncet GIC006R 03 mai ─────────
  const importActif = await prisma.planningImport.findFirst({
    where: { isActive: true },
    orderBy: { importedAt: "desc" },
  });

  if (!importActif) {
    return (
      <div className="p-6">
        <p className="text-red-600 font-semibold">
          Aucun import actif trouvé. Importer un planning depuis /import.
        </p>
      </div>
    );
  }

  const ligneCible = await prisma.planningLigne.findFirst({
    where: {
      importId: importActif.id,
      codeJs: "GIC006R",
      jsNpo: "JS",
      // Date du début de la nuit du 03 mai (la JS commence à 20:30 le 03/05).
      dateDebutPop: {
        gte: new Date("2026-05-03T00:00:00.000Z"),
        lt:  new Date("2026-05-04T00:00:00.000Z"),
      },
      heureDebutPop: { startsWith: "20" },
    },
    include: { agent: true },
  });

  if (!ligneCible || !ligneCible.agent) {
    return (
      <div className="p-6">
        <p className="text-red-600 font-semibold">
          JS GIC006R nuit du 03 mai introuvable dans l'import actif.
        </p>
      </div>
    );
  }

  // ─── 2. Charger tous les agents + plannings ─────────────────────────────────
  const [lignes, jsTypes] = await Promise.all([
    prisma.planningLigne.findMany({
      where: { importId: importActif.id },
      include: { agent: true },
      orderBy: { dateDebutPop: "asc" },
    }),
    prisma.jsType.findMany({
      select: { code: true, heureDebutStandard: true, heureFinStandard: true },
    }),
  ]);

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

  const agentsMap = new Map<string, { context: AgentContext; events: PlanningEvent[] }>();

  for (const ligne of lignes) {
    if (!ligne.agent) continue;
    if (AGENTS_INDISPONIBLES.has(ligne.agent.nom)) continue; // Filtrage démo

    const key = ligne.agent.id;
    if (!agentsMap.has(key)) {
      agentsMap.set(key, {
        context: {
          id: ligne.agent.id,
          nom: ligne.agent.nom,
          prenom: ligne.agent.prenom,
          matricule: ligne.agent.matricule,
          posteAffectation: ligne.agent.posteAffectation,
          agentReserve: ligne.agent.agentReserve,
          peutFaireNuit: ligne.agent.peutFaireNuit,
          peutEtreDeplace: ligne.agent.peutEtreDeplace,
          regimeB: ligne.agent.regimeB,
          regimeC: ligne.agent.regimeC,
          prefixesJs: JSON.parse(ligne.agent.habilitations) as string[],
          lpaBaseId: ligne.agent.lpaBaseId,
        },
        events: [],
      });
    }

    const dateDebut = combineDateTime(ligne.dateDebutPop, ligne.heureDebutPop);
    const dateFin = combineDateTime(ligne.dateFinPop, ligne.heureFinPop);
    const jt = resolveJsType(ligne.codeJs, ligne.typeJs);

    agentsMap.get(key)!.events.push({
      dateDebut,
      dateFin,
      heureDebut: ligne.heureDebutPop,
      heureFin: ligne.heureFinPop,
      amplitudeMin: Math.max(0, Math.round((dateFin.getTime() - dateDebut.getTime()) / 60000)),
      dureeEffectiveMin: ligne.dureeEffectiveCent ? Math.round(ligne.dureeEffectiveCent * 0.6) : null,
      jsNpo: ligne.jsNpo as "JS" | "NPO",
      codeJs: ligne.codeJs,
      typeJs: ligne.typeJs,
      planningLigneId: ligne.id,
      ...(jt ? { heureDebutJsType: jt.heureDebutStandard, heureFinJsType: jt.heureFinStandard } : {}),
    });
  }

  const agents = Array.from(agentsMap.values());

  // ─── 3. Construire la JS cible (Poncet) ─────────────────────────────────────
  const dateDebutCible = ligneCible.dateDebutPop.toISOString().slice(0, 10);
  const jt = resolveJsType(ligneCible.codeJs, ligneCible.typeJs);

  const jsCible: JsCible = {
    planningLigneId: ligneCible.id,
    agentId: ligneCible.agent.id,
    agentNom: ligneCible.agent.nom,
    agentPrenom: ligneCible.agent.prenom,
    agentMatricule: ligneCible.agent.matricule,
    date: dateDebutCible,
    heureDebut: ligneCible.heureDebutPop,
    heureFin: ligneCible.heureFinPop,
    heureDebutJsType: jt?.heureDebutStandard,
    heureFinJsType: jt?.heureFinStandard,
    amplitudeMin: 480,
    codeJs: ligneCible.codeJs,
    typeJs: ligneCible.typeJs,
    isNuit: true,
    importId: importActif.id,
    flexibilite: "OBLIGATOIRE",
  };

  // ─── 4. Simulation ──────────────────────────────────────────────────────────
  const resultat = await executerSimulationMultiJs(
    [jsCible],
    agents,
    "all_agents"
  );

  const resultatPlain = JSON.parse(JSON.stringify(resultat));

  // ─── 5. Résumé pour l'entête ────────────────────────────────────────────────
  const cascadeAff = resultat.scenarioTousAgentsCascade?.affectations[0] ?? null;
  const chaineTrouvee = cascadeAff?.chaineRemplacement ?? null;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="border-l-4 border-sky-400 bg-sky-50 px-4 py-3 rounded">
        <p className="text-xs font-bold text-sky-700 uppercase tracking-wide mb-1">
          Démo Cascade · données réelles
        </p>
        <h1 className="text-lg font-bold text-slate-800">
          {ligneCible.agent.prenom} {ligneCible.agent.nom} ({ligneCible.agent.matricule})
          —{" "}
          <span className="font-mono">{ligneCible.codeJs}</span>{" "}
          {dateDebutCible} {ligneCible.heureDebutPop}–{ligneCible.heureFinPop}
        </h1>
        <p className="text-xs text-slate-600 mt-1">
          Simulation lancée sur l'import actif{" "}
          <span className="font-mono">{importActif.filename}</span> avec{" "}
          <strong>{agents.length} agents</strong>.
        </p>
        <p className="text-[11px] text-slate-600 mt-2">
          <strong>Contrainte démo :</strong> {Array.from(AGENTS_INDISPONIBLES).join(" et ")} sont
          marqués indisponibles (en plus de Poncet absent), pour saturer les
          candidats Direct/Figeage et forcer l'algo à explorer une chaîne.
        </p>
        {chaineTrouvee ? (
          <p className="text-[11px] text-emerald-700 mt-1">
            ✓ Chaîne de remplacement trouvée — profondeur {chaineTrouvee.profondeur} —
            agent affecté : {cascadeAff!.agentPrenom} {cascadeAff!.agentNom}
          </p>
        ) : (
          <p className="text-[11px] text-amber-700 mt-1">
            ⚠ Aucune chaîne ne couvre cette JS dans l'état actuel du dataset
            (avec ces exclusions). Les autres scénarios montrent les options
            disponibles.
          </p>
        )}
      </div>

      <MultiJsResultsPanel resultat={resultatPlain} />
    </div>
  );
}
