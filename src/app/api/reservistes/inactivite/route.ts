/**
 * GET /api/reservistes/inactivite
 *
 * Retourne le tableau d'inactivité des réservistes, filtré par le
 * UserAgentFilter de l'utilisateur courant. Accessible à tout utilisateur
 * authentifié (pas seulement admin).
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/session";
import { getReservistesInactivite } from "@/services/reservistesInactivite.service";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const data = await getReservistesInactivite(auth.user.id);
    return NextResponse.json(data);
  } catch (e) {
    console.error("[/api/reservistes/inactivite]", e);
    return NextResponse.json(
      { error: "Erreur lors du calcul de l'inactivité." },
      { status: 500 }
    );
  }
}
