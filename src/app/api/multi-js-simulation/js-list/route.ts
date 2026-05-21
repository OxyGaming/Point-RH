/**
 * GET /api/multi-js-simulation/js-list?importId=xxx
 *
 * Retourne les lignes JS (jsNpo = "JS") enrichies des infos agent, pour
 * alimenter la timeline de la vue multi-JS.
 *
 * Phase 1 du correctif d'import : `importId` ne sert plus qu'à délimiter la
 * PÉRIODE affichée. Les lignes chargées couvrent tous les agents de cette
 * période, quel que soit l'import qui les a écrites — PlanningLigne est
 * consolidé par la contrainte @@unique([matricule, jourPlanning]).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAuth } from "@/lib/session";
import { isJsDeNuit } from "@/lib/utils";
import { isZeroLoadJs } from "@/lib/simulation/jsUtils";
import { loadZeroLoadPrefixes } from "@/lib/simulation/zeroLoadPrefixLoader";
import { logFenetrePlanning } from "@/lib/simulation/planningWindow";
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
    // Délimiter la période à partir de l'import demandé, puis charger TOUTES
    // les lignes de cette période (lecture consolidée, sans filtre importId).
    const bornes = await prisma.planningLigne.aggregate({
      where: { importId },
      _min: { jourPlanning: true },
      _max: { jourPlanning: true },
    });
    const gte = bornes._min.jourPlanning;
    const lte = bornes._max.jourPlanning;
    if (!gte || !lte) {
      // Import sans ligne (vide, ou lignes purgées par la rétention).
      return NextResponse.json([], { status: 200 });
    }

    const [lignes, jsTypes, zeroLoadPrefixes] = await Promise.all([
      prisma.planningLigne.findMany({
        where: {
          jsNpo: "JS",
          jourPlanning: { gte, lte },
        },
        include: { agent: true },
        orderBy: [{ dateDebutPop: "asc" }, { heureDebutPop: "asc" }],
      }),
      // Charger tous les JsTypes actifs pour résoudre les horaires standard
      prisma.jsType.findMany({ where: { actif: true } }),
      loadZeroLoadPrefixes(),
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
        isZ: isZeroLoadJs(ligne.codeJs, ligne.typeJs, zeroLoadPrefixes),
        agentId: ligne.agentId,
        agentNom: ligne.agent?.nom ?? ligne.nom,
        agentPrenom: ligne.agent?.prenom ?? ligne.prenom,
        agentMatricule: ligne.agent?.matricule ?? ligne.matricule,
        posteAffectation: ligne.agent?.posteAffectation ?? null,
        uch: ligne.uch,
        numeroJs: ligne.numeroJs,
        prefixeJs,
        flexibilite: jsType?.flexibilite ?? "OBLIGATOIRE",
        libelle: jsType?.libelle ?? null,
      };
    });

    logFenetrePlanning({
      source: "js-list",
      fenetre: { gte, lte },
      loadedAgents: new Set(lignes.map((l) => l.agentId).filter(Boolean)).size,
      loadedLines: lignes.length,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("[API/multi-js-simulation/js-list]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
