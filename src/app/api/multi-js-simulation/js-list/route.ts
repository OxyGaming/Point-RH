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
    const [lignes, jsTypes] = await Promise.all([
      prisma.planningLigne.findMany({
        where: {
          importId,
          jsNpo: "JS",
        },
        include: { agent: true },
        orderBy: [{ dateDebutPop: "asc" }, { heureDebutPop: "asc" }],
      }),
      // Charger tous les JsTypes actifs pour résoudre les horaires standard
      prisma.jsType.findMany({ where: { actif: true } }),
    ]);

    /**
     * Résout le JsType correspondant à une ligne de planning.
     * On cherche d'abord par `typeJs` exact, puis par préfixe du `codeJs`.
     */
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

      // Horaires standard et flexibilité du JsType (indépendants du trajet de l'agent initial)
      const jsType = resolveJsType(ligne.codeJs, ligne.typeJs);
      const heureDebutJsType = jsType?.heureDebutStandard ?? undefined;
      const heureFinJsType = jsType?.heureFinStandard ?? undefined;

      return {
        planningLigneId: ligne.id,
        importId: ligne.importId,
        date,
        heureDebut,
        heureFin,
        heureDebutJsType,
        heureFinJsType,
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
        flexibilite: jsType?.flexibilite ?? "OBLIGATOIRE",
      };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("[API/multi-js-simulation/js-list]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
