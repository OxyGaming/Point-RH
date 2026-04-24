import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executerSimulationJS } from "@/lib/simulation";
import { combineDateTime } from "@/lib/utils";
import type { AgentContext, PlanningEvent } from "@/engine/rules";
import type { JsSimulationRequest, JsSimulationResultatDouble } from "@/types/js-simulation";
import { checkAuth } from "@/lib/session";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const SIMULATION_RATE_LIMIT = { max: 30, windowMs: 60 * 1000 };

// Garde-fous volume : l'analyse d'imprévu est 100 % synchrone côté Node
// (voir `executerSimulationJS`). Un import trop gros bloque l'event loop
// jusqu'à la fin du calcul → nginx timeout → 504 pour tous les utilisateurs.
// Valeurs configurables via env pour pouvoir les ajuster sans rebuild.
const MAX_LIGNES_SIMULATION = Number(process.env.SIM_MAX_LIGNES ?? 40000);
const MAX_AGENTS_SIMULATION = Number(process.env.SIM_MAX_AGENTS ?? 1500);
const SIM_SLOW_WARN_MS = Number(process.env.SIM_SLOW_WARN_MS ?? 10000);

export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  const rl = rateLimit("js-simulation", auth.user.id, SIMULATION_RATE_LIMIT);
  if (!rl.ok) {
    const retryAfterSec = Math.ceil((rl.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: "Trop de simulations lancées. Réessayez dans une minute." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

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

    // Refuser les imports trop gros avant de lancer le calcul synchrone.
    // Sans ce garde-fou, un import massif peut bloquer Node ~1 min → 504 pour tous.
    if (lignes.length > MAX_LIGNES_SIMULATION) {
      return NextResponse.json(
        {
          error:
            `Import trop volumineux (${lignes.length.toLocaleString("fr-FR")} lignes) ` +
            `pour une analyse d'imprévu. Maximum autorisé : ${MAX_LIGNES_SIMULATION.toLocaleString("fr-FR")}. ` +
            `Réduisez la période ou le périmètre lors de l'import.`,
        },
        { status: 413 }
      );
    }
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

    if (agents.length > MAX_AGENTS_SIMULATION) {
      return NextResponse.json(
        {
          error:
            `Trop d'agents dans cet import (${agents.length}) pour une analyse d'imprévu. ` +
            `Maximum autorisé : ${MAX_AGENTS_SIMULATION}. ` +
            `Filtrez le périmètre ou la période avant analyse.`,
        },
        { status: 413 }
      );
    }

    const simStart = Date.now();
    const resultat: JsSimulationResultatDouble = await executerSimulationJS(body, agents);
    const simDuration = Date.now() - simStart;

    // Télémétrie : log systématique + alerte sur analyses lentes pour identifier les cas pathologiques.
    const logLine = `[js-simulation] user=${auth.user.id} agents=${agents.length} lignes=${lignes.length} duration=${simDuration}ms`;
    if (simDuration > SIM_SLOW_WARN_MS) {
      console.warn(`${logLine} SLOW`);
    } else {
      console.log(logLine);
    }

    return NextResponse.json(resultat, { status: 200 });
  } catch (err) {
    console.error("[API/js-simulation]", err);
    return NextResponse.json(
      { error: "Erreur lors de la simulation" },
      { status: 500 }
    );
  }
}
