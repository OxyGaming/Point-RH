import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executerSimulationJS } from "@/lib/simulation";
import { combineDateTime } from "@/lib/utils";
import type { AgentContext, PlanningEvent } from "@/engine/rules";
import type { JsSimulationRequest, JsSimulationResultatDouble } from "@/types/js-simulation";
import { checkAuth } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json()) as JsSimulationRequest;
    const { jsCible, imprevu } = body;

    if (!jsCible?.importId || !jsCible?.agentId || !imprevu) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    // Charger tous les agents liés à cet import
    const [lignes, jsTypes] = await Promise.all([
      prisma.planningLigne.findMany({
        where: { importId: jsCible.importId },
        include: { agent: true },
        orderBy: { dateDebutPop: "asc" },
      }),
      prisma.jsType.findMany({ select: { code: true, heureDebutStandard: true, heureFinStandard: true } }),
    ]);
    // Résolution JsType : match exact sur typeJs, fallback préfixe sur codeJs (même logique que multi-JS)
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

    // Grouper par agent
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
      const amplitudeMin = Math.max(0, Math.round((dateFin.getTime() - dateDebut.getTime()) / 60000));

      agentsMap.get(key)!.events.push({
        dateDebut,
        dateFin,
        heureDebut: ligne.heureDebutPop,
        heureFin: ligne.heureFinPop,
        amplitudeMin,
        dureeEffectiveMin: ligne.dureeEffectiveCent
          ? Math.round(ligne.dureeEffectiveCent * 0.6)
          : null,
        jsNpo: ligne.jsNpo as "JS" | "NPO",
        codeJs: ligne.codeJs,
        typeJs: ligne.typeJs,
        planningLigneId: ligne.id,
        ...(() => {
          const jt = resolveJsType(ligne.codeJs, ligne.typeJs);
          return jt ? { heureDebutJsType: jt.heureDebutStandard, heureFinJsType: jt.heureFinStandard } : {};
        })(),
      });
    }

    const agents = Array.from(agentsMap.values());

    const resultat: JsSimulationResultatDouble = await executerSimulationJS(body, agents);

    return NextResponse.json(resultat, { status: 200 });
  } catch (err) {
    console.error("[API/js-simulation]", err);
    return NextResponse.json(
      { error: "Erreur lors de la simulation" },
      { status: 500 }
    );
  }
}
