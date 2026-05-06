/**
 * POST /api/admin/habilitations/strip-prefix
 *      Body: { prefix: string }
 *      → Retire ce préfixe d'habilitation chez TOUS les agents actifs qui le
 *        possèdent. Retourne le nombre d'agents impactés.
 *
 * Sécurité : JWT administrateur requis (checkAdmin).
 * Audit : action STRIP_HABILITATION_PREFIX.
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { stripPrefixFromAllAgents } from "@/services/habilitationsPurge.service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const prefix =
    body && typeof body === "object" && typeof (body as Record<string, unknown>).prefix === "string"
      ? ((body as Record<string, unknown>).prefix as string)
      : "";

  if (prefix.trim().length === 0) {
    return NextResponse.json({ error: "Préfixe requis." }, { status: 400 });
  }

  try {
    const result = await stripPrefixFromAllAgents(prefix);

    await logAudit("STRIP_HABILITATION_PREFIX", "Agent", {
      user: auth.user,
      details: { prefix: result.prefix, agentsUpdated: result.agentsUpdated },
    });

    return NextResponse.json({
      success: true,
      prefix: result.prefix,
      agentsUpdated: result.agentsUpdated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur lors du retrait du préfixe.";
    console.error("[API/admin/habilitations/strip-prefix POST]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
