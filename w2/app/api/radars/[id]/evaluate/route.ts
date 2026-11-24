import { NextResponse } from "next/server";
import { getItemById, readData, updateItem } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { nowISO } from "@/lib/utils";
import { whatsappLink } from "@/lib/whatsapp";
import { buildAlertMessage, evaluateRadar, type Radar } from "@/lib/radar";
import type { CarPost } from "@/lib/types";

/**
 * Evaluate one radar and produce the WhatsApp alert — without sending it.
 *
 * This is an honest limitation, not a stub: the deployment has no WhatsApp
 * Business API, no sender number and no opt-in registry, so nothing here can
 * legally or technically deliver a message on its own. What it can do is
 * compute the hits and write the exact text the user *would* receive. The UI
 * opens that text in the user's own WhatsApp (a note to themselves), and says
 * so plainly.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const radar = getItemById<Radar>("radars", id);
  if (!radar) {
    return NextResponse.json({ error: "Alerta não encontrado." }, { status: 404 });
  }
  if (radar.userId !== user.id) {
    return NextResponse.json({ error: "Este alerta não é seu." }, { status: 403 });
  }

  const { hits, total } = evaluateRadar(
    radar,
    readData<CarPost>("posts")
  );
  const origin = new URL(request.url).origin;
  const message = buildAlertMessage(radar, hits, origin);
  const href = user.whatsapp ? whatsappLink(user.whatsapp, message) : null;

  // Records that an alert was generated, not that WhatsApp delivered it.
  const updated =
    updateItem<Radar>("radars", radar.id, { lastNotifiedAt: nowISO() }) ?? radar;

  return NextResponse.json({
    radar: updated,
    hits,
    total,
    message,
    href,
    whatsappAvailable: Boolean(user.whatsapp),
    delivery: "manual",
    note: "Nada é enviado automaticamente: não há integração com a API do WhatsApp Business. O link abre a mensagem pronta no seu WhatsApp.",
  });
}
