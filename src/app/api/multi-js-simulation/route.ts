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
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const SIMULATION_RATE_LIMIT = { max: 30, windowMs: 60 * 1000 };

export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  const rl = rateLimit("multi-js-simulation", auth.user.id, SIMULATION_RATE_LIMIT);
  if (!rl.ok) {
    const retryAfterSec = Math.ceil((rl.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: "Trop de simulations lancées. Réessayez dans une minute." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  try {
    const body = (await req.json()) as MultiJsSimulationRequest;
    const {
      importId,
      jsSelectionnees,
      deplacement = false,
      remplacement = true,
    } = body;

    if (!importId || !jsSelectionnees?.length) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    // ─── Charger tous les agents + leur planning pour cet import ─────────────────
    const [lignes, jsTypes] = await Promise.all([
      prisma.planningLigne.findMany({
        where: { importId },
        include: { agent: true },
        orderBy: { dateDebutPop: "asc" },
      }),
      prisma.jsType.findMany({ select: { code: true, heureDebutStandard: true, heureFinStandard: true } }),
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
        planningLigneId: ligne.id,
        // Rustine option 2 : référence canonique pour reconstruire le créneau
        // sans dépendre de dateDebutPop/dateFinPop décalés (cf. utils.getEventInterval)
        jourPlanning: ligne.jourPlanning,
        ...(() => {
          const jt = resolveJsType(ligne.codeJs, ligne.typeJs);
          return jt ? { heureDebutJsType: jt.heureDebutStandard, heureFinJsType: jt.heureFinStandard } : {};
        })(),
      });
    }

    const agents = Array.from(agentsMap.values());

    const resultat = await executerSimulationMultiJs(
      jsSelectionnees,
      agents,
      "reserve_only",
      remplacement,
      deplacement
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
