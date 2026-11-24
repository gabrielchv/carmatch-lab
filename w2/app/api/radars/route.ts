import { NextResponse } from "next/server";
import { addItem, readData } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { generateId, nowISO } from "@/lib/utils";
import {
  evaluateRadar,
  MAX_RADARS_PER_USER,
  validateRadarDraft,
  type Radar,
} from "@/lib/radar";
import type { CarPost } from "@/lib/types";

/**
 * My radars, with the live hit count for each one.
 *
 * The count is computed here rather than stored: an alert is only useful if it
 * reflects the listings that exist *now*. Every hit is evaluated with the same
 * rules as the onboarding preview (`evaluateRadar`).
 *
 * The navbar badge uses `totalHits`, so this stays the single source of truth
 * for "is there anything waiting for me?".
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const posts = readData<CarPost>("posts");
  const radars = readData<Radar>("radars")
    .filter((radar) => radar.userId === user.id)
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .map((radar) => {
      const { hits, total } = evaluateRadar(radar, posts);
      return { ...radar, hitCount: total, best: hits[0] ?? null };
    });

  return NextResponse.json({
    radars,
    totalHits: radars.reduce((sum, radar) => sum + radar.hitCount, 0),
    // The alert link needs the user's own number: the message is a WhatsApp
    // note to themselves because there is no Business API to send from.
    whatsappAvailable: Boolean(user.whatsapp),
  });
}

/** Create a radar for the signed-in user. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Entre para criar um alerta." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const parsed = validateRadarDraft(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const existing = readData<Radar>("radars").filter(
    (radar) => radar.userId === user.id
  );
  if (existing.length >= MAX_RADARS_PER_USER) {
    return NextResponse.json(
      {
        error: `Você já tem ${MAX_RADARS_PER_USER} alertas. Apague um para criar outro.`,
        code: "radar-limit",
      },
      { status: 409 }
    );
  }

  const radar: Radar = {
    id: generateId(),
    userId: user.id,
    ...parsed.value,
    createdAt: nowISO(),
  };
  addItem("radars", radar);

  // Answer with today's hits so the UI can say "já encontramos 2" right away.
  const { hits, total } = evaluateRadar(radar, readData<CarPost>("posts"));

  return NextResponse.json(
    { radar, hitCount: total, best: hits[0] ?? null },
    { status: 201 }
  );
}
