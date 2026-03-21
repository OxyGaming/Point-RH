/**
 * GET /api/multi-js-simulation/js-list?importId=xxx
 *
 * Retourne toutes les lignes JS (jsNpo = "JS") d'un import,
 * enrichies des infos agent, pour alimenter la timeline de la vue multi-JS.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAuth } from "@/lib/session";
import { isJsDeNuit } from "@/lib/utils";
import { isZeroLoadJs } from "@/lib/simulation/jsUtils";
import type { JsTimeline } from "@/types/multi-js-simulation";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  const importId = req.nextUrl.searchParams.get("importId");
  if (!importId) {
    return NextResponse.json({ error: "importId manquant" }, { status: 400 });
  }

  try {
    const lignes = await prisma.planningLigne.findMany({
      where: {
        importId,
        jsNpo: "JS",
      },
      include: { agent: true },
      orderBy: [{ dateDebutPop: "asc" }, { heureDebutPop: "asc" }],
    });

    const result: JsTimeline[] = lignes.map((ligne) => {
      const date = ligne.dateDebutPop.toISOString().slice(0, 10);
      const heureDebut = ligne.heureDebutPop;
      const heureFin = ligne.heureFinPop;
      const amplitudeMin = Math.max(
        0,
        Math.round(
          (ligne.dateFinPop.getTime() - ligne.dateDebutPop.getTime()) / 60000
        )
      );

      const prefixeJs = ligne.codeJs
        ? ligne.codeJs.trim().split(" ")[0] ?? null
        : null;

      return {
        planningLigneId: ligne.id,
        importId: ligne.importId,
        date,
        heureDebut,
        heureFin,
        amplitudeMin,
        codeJs: ligne.codeJs,
        typeJs: ligne.typeJs,
        isNuit: isJsDeNuit(heureDebut, heureFin),
        isZ: isZeroLoadJs(ligne.codeJs),
        agentId: ligne.agentId,
        agentNom: ligne.agent?.nom ?? ligne.nom,
        agentPrenom: ligne.agent?.prenom ?? ligne.prenom,
        agentMatricule: ligne.agent?.matricule ?? ligne.matricule,
        posteAffectation: ligne.agent?.posteAffectation ?? null,
        uch: ligne.uch,
        numeroJs: ligne.numeroJs,
        prefixeJs,
      };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("[API/multi-js-simulation/js-list]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
