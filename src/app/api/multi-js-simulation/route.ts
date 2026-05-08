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
import type { AgentContext, PlanningEvent } from "@/engine/rules";
import type { MultiJsSimulationRequest } from "@/types/multi-js-simulation";
import { executerSimulationMultiJs } from "@/lib/simulation/multiJs";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const SIMULATION_RATE_LIMIT = { max: 30, windowMs: 60 * 1000 };

// Garde-fous volume : multi-JS produit 8 scénarios (vs 2 pour single-JS) sur
// le même dataset, donc à un coût ~4× supérieur. Un import trop gros bloque
// l'event loop Node ⇒ nginx timeout ⇒ 504 pour tous les utilisateurs.
// Cf. incident encryptionKey 2026-04-24 (mémoire infrastructure pointrh).
// Variables d'env distinctes du single-JS pour pouvoir abaisser la limite
// multi-JS sans rebuild si nécessaire.
//
// Parsing sécurisé : `Number(process.env.X ?? d)` retourne NaN si la variable
// est mal formatée ("foo"), et `42000 > NaN === false` ferait passer toutes
// les requêtes — autrement dit, un typo dans .env.local désactiverait
// silencieusement le garde-fou. parsePositiveIntEnv tombe sur le fallback
// dans ce cas, et un test au démarrage est inutile car les fallbacks sont
// suffisants pour la prod.
function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const MAX_LIGNES_MULTI = parsePositiveIntEnv("MULTI_SIM_MAX_LIGNES", 40000);
const MAX_AGENTS_MULTI = parsePositiveIntEnv("MULTI_SIM_MAX_AGENTS", 1500);
const MULTI_SLOW_WARN_MS = parsePositiveIntEnv("MULTI_SIM_SLOW_WARN_MS", 15000);

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

    // Garde-fou volume — refuser avant lancement du calcul synchrone (8 scénarios)
    if (lignes.length > MAX_LIGNES_MULTI) {
      return NextResponse.json(
        {
          error:
            `Import trop volumineux (${lignes.length.toLocaleString("fr-FR")} lignes) ` +
            `pour une simulation multi-JS. Maximum autorisé : ${MAX_LIGNES_MULTI.toLocaleString("fr-FR")}. ` +
            `Réduisez la période ou le périmètre lors de l'import.`,
        },
        { status: 413 }
      );
    }

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

      // dateDebutPop / dateFinPop sont des UTC absolus depuis la migration
      // (étape 3 option 1) — utilisables tels quels pour les comparaisons.
      const dateDebut = ligne.dateDebutPop;
      const dateFin = ligne.dateFinPop;

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
        ...(() => {
          const jt = resolveJsType(ligne.codeJs, ligne.typeJs);
          return jt ? { heureDebutJsType: jt.heureDebutStandard, heureFinJsType: jt.heureFinStandard } : {};
        })(),
      });
    }

    const agents = Array.from(agentsMap.values());

    if (agents.length > MAX_AGENTS_MULTI) {
      return NextResponse.json(
        {
          error:
            `Trop d'agents dans cet import (${agents.length}) pour une simulation multi-JS. ` +
            `Maximum autorisé : ${MAX_AGENTS_MULTI}. ` +
            `Filtrez le périmètre ou la période avant analyse.`,
        },
        { status: 413 }
      );
    }

    const simStart = Date.now();
    const resultat = await executerSimulationMultiJs(
      jsSelectionnees,
      agents,
      "reserve_only",
      remplacement,
      deplacement
    );
    const simDuration = Date.now() - simStart;

    // Télémétrie : log systématique + alerte sur simulations lentes pour identifier les cas pathologiques.
    const logLine = `[multi-js-simulation] user=${auth.user.id} agents=${agents.length} lignes=${lignes.length} jsCibles=${jsSelectionnees.length} duration=${simDuration}ms`;
    if (simDuration > MULTI_SLOW_WARN_MS) {
      console.warn(`${logLine} SLOW`);
    } else {
      console.log(logLine);
    }

    return NextResponse.json(resultat, { status: 200 });
  } catch (err) {
    console.error("[API/multi-js-simulation]", err);
    return NextResponse.json(
      { error: "Erreur lors de la simulation multi-JS" },
      { status: 500 }
    );
  }
}
