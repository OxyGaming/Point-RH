/**
 * POST /api/habilitations/propositions/valider
 * Valide un lot de propositions d'habilitations (admin only, rate-limité).
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/session";
import { rateLimit } from "@/lib/rateLimit";
import {
  validerPropositions,
  type ValidationInput,
} from "@/services/habilitation-proposals.service";

export const runtime = "nodejs";

const HABILITATION_RATE_LIMIT = { max: 10, windowMs: 60 * 1000 };

interface Body {
  validations?: unknown;
}

export async function POST(req: NextRequest) {
  const auth = checkAdmin(req);
  if (!auth.ok) return auth.response;

  const rl = rateLimit("habilitationValidation", auth.user.id, HABILITATION_RATE_LIMIT);
  if (!rl.ok) {
    const retryAfterSec = Math.ceil((rl.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: "Trop de validations lancées. Réessayez dans une minute." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const validations = parseValidations(body.validations);
  if (validations === null) {
    return NextResponse.json(
      { error: "Format invalide : `validations` doit être un tableau de { agentId, prefixesAAjouter[], prefixesARetirer?[] }." },
      { status: 400 },
    );
  }

  try {
    const result = await validerPropositions(validations, auth.user);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[API/habilitations/propositions/valider]", err);
    return NextResponse.json(
      { error: "Erreur lors de la validation des propositions." },
      { status: 500 },
    );
  }
}

function parseValidations(raw: unknown): ValidationInput[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ValidationInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const { agentId, prefixesAAjouter, prefixesARetirer } = item as Record<string, unknown>;
    if (typeof agentId !== "string" || agentId.length === 0) return null;
    if (!Array.isArray(prefixesAAjouter)) return null;
    if (!prefixesAAjouter.every((p) => typeof p === "string")) return null;
    // prefixesARetirer optionnel pour rétro-compat ; si présent doit être string[]
    let retraits: string[] | undefined;
    if (prefixesARetirer !== undefined) {
      if (!Array.isArray(prefixesARetirer)) return null;
      if (!prefixesARetirer.every((p) => typeof p === "string")) return null;
      retraits = prefixesARetirer as string[];
    }
    out.push({ agentId, prefixesAAjouter: prefixesAAjouter as string[], ...(retraits ? { prefixesARetirer: retraits } : {}) });
  }
  return out;
}
