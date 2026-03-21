/**
 * GET /api/auth/me
 * Retourne l'utilisateur courant depuis le token JWT.
 * Utilisé par le client pour hydrater le contexte auth.
 */
import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifyToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  try {
    const user = verifyToken(token);
    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch {
    return NextResponse.json({ user: null }, { status: 200 });
  }
}
