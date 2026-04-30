/**
 * GET  /api/admin/habilitations/purge
 *      → Liste les UCH (avec compteurs) + total global, pour preview avant purge.
 *
 * POST /api/admin/habilitations/purge
 *      Body: { scope: "all" } | { scope: "uch", uch: string }
 *      → Réinitialise les habilitations des agents concernés. Retourne le
 *        nombre d'agents impactés (ceux qui avaient au moins une habilitation).
 *
 * Sécurité : JWT administrateur requis (checkAdmin) sur les deux verbes.
 * Audit : action PURGE_HABILITATIONS sur POST.
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import {
  countAgentsWithHabilitations,
  listUchsWithHabilitationStats,
  purgeHabilitations,
  type PurgeScope,
} from "@/services/habilitationsPurge.service";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const [global, uchs] = await Promise.all([
      countAgentsWithHabilitations(),
      listUchsWithHabilitationStats(),
    ]);

    return NextResponse.json({
      global,
      uchs,
    });
  } catch (err) {
    console.error("[API/admin/habilitations/purge GET]", err);
    return NextResponse.json({ error: "Erreur lors du chargement des compteurs." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const scope = parseScope(body);
  if (!scope) {
    return NextResponse.json(
      { error: 'Scope attendu : { scope: "all" } ou { scope: "uch", uch: string }.' },
      { status: 400 },
    );
  }

  try {
    const result = await purgeHabilitations(scope);

    await logAudit("PURGE_HABILITATIONS", "Agent", {
      user: auth.user,
      details: {
        scope: result.scope,
        agentsUpdated: result.agentsUpdated,
      },
    });

    return NextResponse.json({
      success: true,
      agentsUpdated: result.agentsUpdated,
      scope: result.scope,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur lors de la purge.";
    console.error("[API/admin/habilitations/purge POST]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseScope(body: unknown): PurgeScope | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.scope === "all") return { type: "all" };
  if (b.scope === "uch" && typeof b.uch === "string" && b.uch.trim().length > 0) {
    return { type: "uch", uch: b.uch.trim() };
  }
  return null;
}
