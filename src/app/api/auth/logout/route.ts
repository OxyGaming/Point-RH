/**
 * POST /api/auth/logout
 * Supprime le cookie de session.
 */
import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifyToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;

  if (token) {
    try {
      const user = verifyToken(token);
      await logAudit("LOGOUT", "User", {
        user,
        entityId: user.id,
      });
    } catch {
      // Token invalide, on déconnecte quand même
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete(COOKIE_NAME);
  return response;
}
