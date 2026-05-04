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
 * Agents écartés par défaut : aucun.
 *
 * Avec les vraies données du dataset sur la JS Poncet 03/05 :
 *  - Belabbas (libre) prend la JS en Direct → recommandé
 *  - Ollier (sur GIV006R DERNIER_RECOURS) apparaît comme **alternative chaîne**
 *    avec sa cascade Brouillat → Bouziges (plan B documenté)
 *
 * Pour forcer la cascade en couverture principale, passer ?exclus=NOM1,NOM2.
 */
const AGENTS_INDISPONIBLES_DEFAUT: string[] = [];

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
      jourPlanning: ligne.jourPlanning,
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
        {AGENTS_INDISPONIBLES.size > 0 && (
          <p className="text-[11px] text-slate-600 mt-2">
            <strong>Contrainte démo :</strong> {Array.from(AGENTS_INDISPONIBLES).join(" et ")} sont
            marqués indisponibles (en plus de Poncet absent), pour saturer les
            candidats Direct et forcer l'algo à explorer une chaîne.
          </p>
        )}
        {chaineTrouvee ? (
          <p className="text-[11px] text-emerald-700 mt-1">
            ✓ Chaîne de remplacement trouvée — profondeur {chaineTrouvee.profondeur} —
            agent affecté : {cascadeAff!.agentPrenom} {cascadeAff!.agentNom}
          </p>
        ) : (
          <p className="text-[11px] text-slate-600 mt-1">
            Sur les vraies données sans exclusion, des candidats Direct
            couvrent la JS. Les chaînes possibles apparaissent dans l'onglet{" "}
            <strong>Alternatives</strong> du scénario <strong>Tous agents — Cascade</strong>{" "}
            comme plans B documentés.
          </p>
        )}
      </div>

      <MultiJsResultsPanel resultat={resultatPlain} />
    </div>
  );
}
