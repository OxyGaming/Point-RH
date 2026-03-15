import { prisma } from "@/lib/prisma";
import { evaluerMobilisabilite, AgentContext, PlanningEvent } from "@/engine/rules";
import { combineDateTime } from "@/lib/utils";
import { loadWorkRules } from "@/lib/rules/workRulesLoader";
import type { SimulationInput, SimulationResultat, ResultatAgentDetail } from "@/types/simulation";

export async function lancerSimulation(input: SimulationInput): Promise<SimulationResultat> {
  const { importId } = input;

  // Charger les règles dynamiques (fallback sur défauts si base vide)
  const rules = await loadWorkRules();

  // Récupérer tous les agents liés à cet import
  const lignes = await prisma.planningLigne.findMany({
    where: { importId },
    include: { agent: true },
    orderBy: { dateDebutPop: "asc" },
  });

  // Récupérer tous les agents distincts
  const agentsMap = new Map<string, { agent: NonNullable<(typeof lignes)[0]["agent"]>; events: PlanningEvent[] }>();

  for (const ligne of lignes) {
    if (!ligne.agent) continue;
    const key = ligne.agent.id;

    if (!agentsMap.has(key)) {
      agentsMap.set(key, { agent: ligne.agent, events: [] });
    }

    const dateDebut = combineDateTime(ligne.dateDebutPop, ligne.heureDebutPop);
    const dateFin = combineDateTime(ligne.dateFinPop, ligne.heureFinPop);
    const amplitudeMin = Math.round((dateFin.getTime() - dateDebut.getTime()) / 60000);

    agentsMap.get(key)!.events.push({
      dateDebut,
      dateFin,
      heureDebut: ligne.heureDebutPop,
      heureFin: ligne.heureFinPop,
      amplitudeMin: Math.max(0, amplitudeMin),
      dureeEffectiveMin: ligne.dureeEffectiveCent
        ? Math.round(ligne.dureeEffectiveCent * 0.6)
        : null,
      jsNpo: ligne.jsNpo as "JS" | "NPO",
      codeJs: ligne.codeJs,
      typeJs: ligne.typeJs,
    });
  }

  // Créer la simulation en base
  const simulation = await prisma.simulation.create({
    data: {
      importId,
      dateDebut: new Date(input.dateDebut),
      dateFin: new Date(input.dateFin),
      heureDebut: input.heureDebut,
      heureFin: input.heureFin,
      poste: input.poste,
      remplacement: input.remplacement,
      deplacement: input.deplacement,
      posteNuit: input.posteNuit,
      commentaire: input.commentaire ?? null,
    },
  });

  // Évaluer chaque agent
  const resultats: ResultatAgentDetail[] = [];

  for (const [, { agent, events }] of agentsMap.entries()) {
    const ctx: AgentContext = {
      id: agent.id,
      nom: agent.nom,
      prenom: agent.prenom,
      matricule: agent.matricule,
      posteAffectation: agent.posteAffectation,
      agentReserve: agent.agentReserve,
      peutFaireNuit: agent.peutFaireNuit,
      peutEtreDeplace: agent.peutEtreDeplace,
      regimeB: agent.regimeB,
      regimeC: agent.regimeC,
      prefixesJs: JSON.parse(agent.habilitations) as string[],
    };

    const resultat = evaluerMobilisabilite(ctx, events, input, rules);
    resultats.push(resultat);

    // Sauvegarder en base
    await prisma.resultatAgent.create({
      data: {
        simulationId: simulation.id,
        agentId: agent.id,
        statut: resultat.statut,
        scorePertinence: resultat.scorePertinence,
        motifPrincipal: resultat.motifPrincipal,
        detail: JSON.stringify(resultat.detail),
      },
    });
  }

  // Trier par score de pertinence décroissant
  resultats.sort((a, b) => b.scorePertinence - a.scorePertinence);

  return {
    simulationId: simulation.id,
    conformes: resultats.filter((r) => r.statut === "CONFORME"),
    vigilance: resultats.filter((r) => r.statut === "VIGILANCE"),
    nonConformes: resultats.filter((r) => r.statut === "NON_CONFORME"),
  };
}
