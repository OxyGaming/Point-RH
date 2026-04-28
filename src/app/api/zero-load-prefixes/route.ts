/**
 * GET /api/zero-load-prefixes — Liste les préfixes JS Z actifs (auth user).
 *
 * Endpoint léger pour les composants client (PlanningTimeline, etc.) qui
 * doivent qualifier visuellement les JS Z. Retourne uniquement les codes en
 * MAJUSCULES, sans métadonnées (libellé, état actif, dates).
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/session";
import { loadZeroLoadPrefixes } from "@/lib/simulation/zeroLoadPrefixLoader";

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  const prefixes = await loadZeroLoadPrefixes();
  return NextResponse.json(prefixes);
}
