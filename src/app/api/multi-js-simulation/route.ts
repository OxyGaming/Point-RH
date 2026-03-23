/**
 * POST /api/multi-js-simulation
 *
 * Lance une simulation de remplacement sur plusieurs JS simultanément.
 * Retourne plusieurs scénarios avec couverture globale, affectations par agent,
 * JS non couvertes et conflits détectés.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAuth } from "@/lib/session";
import { combineDateTime } from "@/lib/utils";
import type { AgentContext, PlanningEvent } from "@/engine/rules";
import type { MultiJsSimulationRequest } from "@/types/multi-js-simulation";
import { executerSimulationMultiJs } from "@/lib/simulation/multiJs";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json()) as MultiJsSimulationRequest;
    const {
      importId,
      jsSelectionnees,
      candidateScope,
      deplacement = false,
      remplacement = true,
      autoriserFigeage = false,
    } = body;

    if (!importId || !jsSelectionnees?.length || !candidateScope) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    // ─── Charger tous les agents + leur planning pour cet import ─────────────────
    const lignes = await prisma.planningLigne.findMany({
      where: { importId },
      include: { agent: true },
      orderBy: { dateDebutPop: "asc" },
    });

    const agentsMap = new Map<
      string,
      { context: AgentContext; events: PlanningEvent[] }
    >();

    for (const ligne of lignes) {
      if (!ligne.agent) continue;
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

      agentsMap.get(key)!.events.push({
        dateDebut,
        dateFin,
        heureDebut: ligne.heureDebutPop,
        heureFin: ligne.heureFinPop,
        amplitudeMin: Math.max(
          0,
          Math.round((dateFin.getTime() - dateDebut.getTime()) / 60000)
        ),
        dureeEffectiveMin: ligne.dureeEffectiveCent
          ? Math.round(ligne.dureeEffectiveCent * 0.6)
          : null,
        jsNpo: ligne.jsNpo as "JS" | "NPO",
        codeJs: ligne.codeJs,
        typeJs: ligne.typeJs,
      });
    }

    const agents = Array.from(agentsMap.values());

    const resultat = await executerSimulationMultiJs(
      jsSelectionnees,
      agents,
      candidateScope,
      remplacement,
      deplacement,
      autoriserFigeage
    );

    return NextResponse.json(resultat, { status: 200 });
  } catch (err) {
    console.error("[API/multi-js-simulation]", err);
    return NextResponse.json(
      { error: "Erreur lors de la simulation multi-JS" },
      { status: 500 }
    );
  }
}
