import { NextResponse } from "next/server";
import { getItemById, updateItem } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { generateId, nowISO } from "@/lib/utils";
import {
  dossierTrust,
  isDossierItemKey,
  postTrustSummary,
} from "@/lib/trust";
import type {
  CarPost,
  DossierItemKey,
  PostDossier,
  ServiceEntry,
} from "@/lib/types";

const MAX_SERVICE_ENTRIES = 20;

/**
 * Owner-only updates of a vehicle dossier.
 *
 * Three actions share the endpoint because they all mutate the same embedded
 * object and all require the same ownership check:
 *  - toggle      { item, checked }  → confirm/undo one item
 *  - addService  { entry }          → append a service-history entry
 *  - removeService { entryId }      → remove a mistyped entry
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const post = getItemById<CarPost>("posts", id);
  if (!post) {
    return NextResponse.json(
      { error: "Anúncio não encontrado" },
      { status: 404 }
    );
  }
  if (post.userId !== user.id) {
    return NextResponse.json(
      { error: "Você só pode confirmar o dossiê dos seus próprios anúncios" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;
  const action = payload.action ?? "toggle";

  const dossier: PostDossier = { ...(post.dossier ?? {}) };
  const confirmedAt = { ...(dossier.confirmedAt ?? {}) };

  if (action === "toggle") {
    if (!isDossierItemKey(payload.item)) {
      return NextResponse.json(
        { error: "Item de dossiê desconhecido" },
        { status: 400 }
      );
    }
    if (typeof payload.checked !== "boolean") {
      return NextResponse.json(
        { error: "checked deve ser true ou false" },
        { status: 400 }
      );
    }

    const item: DossierItemKey = payload.item;
    const checked = payload.checked;

    // Switch instead of a computed write: TypeScript cannot prove that every
    // member of the key union maps to a boolean property, and this list is
    // small enough that an explicit exhaustive write is clearer.
    switch (item) {
      case "ownership":
        dossier.ownership = checked;
        break;
      case "fines":
        dossier.fines = checked;
        break;
      case "liens":
        dossier.liens = checked;
        break;
      case "recall":
        dossier.recall = checked;
        break;
      case "inspection":
        dossier.inspection = checked;
        break;
      case "serviceHistory":
        dossier.serviceHistory = checked;
        break;
      case "singleOwner":
        dossier.singleOwner = checked;
        break;
    }

    if (checked) confirmedAt[item] = nowISO();
    else delete confirmedAt[item];
  } else if (action === "addService") {
    const rawEntry =
      payload.entry && typeof payload.entry === "object" && !Array.isArray(payload.entry)
        ? (payload.entry as Record<string, unknown>)
        : {};

    const description =
      typeof rawEntry.description === "string"
        ? rawEntry.description.trim()
        : "";
    if (description.length < 3 || description.length > 280) {
      return NextResponse.json(
        { error: "Descreva o serviço em 3 a 280 caracteres." },
        { status: 400 }
      );
    }

    const date = typeof rawEntry.date === "string" ? rawEntry.date.trim() : "";
    // Date.parse("2025-02-31") silently rolls over to March, so verify the
    // round-trip instead of trusting the parser.
    const parts = date.split("-").map(Number);
    const [year, month, day] = parts;
    const parsed = new Date(Date.UTC(year, month - 1, day));
    const validDate =
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day;
    if (!validDate) {
      return NextResponse.json(
        { error: "Data inválida (use AAAA-MM-DD)." },
        { status: 400 }
      );
    }
    if (parsed.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      return NextResponse.json(
        { error: "A data do serviço não pode estar no futuro." },
        { status: 400 }
      );
    }

    const kmRaw = rawEntry.km;
    const km =
      kmRaw === undefined || kmRaw === null || kmRaw === ""
        ? undefined
        : Number(kmRaw);
    if (
      km !== undefined &&
      (!Number.isFinite(km) || km < 0 || km > 2_000_000)
    ) {
      return NextResponse.json(
        { error: "Quilometragem inválida." },
        { status: 400 }
      );
    }

    const entries = [...(dossier.serviceEntries ?? [])];
    if (entries.length >= MAX_SERVICE_ENTRIES) {
      return NextResponse.json(
        { error: `Limite de ${MAX_SERVICE_ENTRIES} revisões por anúncio.` },
        { status: 400 }
      );
    }

    const entry: ServiceEntry = { id: generateId(), date, description };
    if (km !== undefined) entry.km = km;
    entries.push(entry);
    entries.sort((a, b) => b.date.localeCompare(a.date));
    dossier.serviceEntries = entries;
  } else if (action === "removeService") {
    if (typeof payload.entryId !== "string") {
      return NextResponse.json(
        { error: "Informe o id da revisão." },
        { status: 400 }
      );
    }
    const current = dossier.serviceEntries ?? [];
    const entries = current.filter((e) => e.id !== payload.entryId);
    if (entries.length === current.length) {
      return NextResponse.json(
        { error: "Revisão não encontrada" },
        { status: 404 }
      );
    }
    dossier.serviceEntries = entries;
  } else {
    return NextResponse.json({ error: "Ação desconhecida" }, { status: 400 });
  }

  dossier.confirmedAt = confirmedAt;

  const updated = updateItem<CarPost>("posts", id, { dossier });
  if (!updated) {
    return NextResponse.json(
      { error: "Anúncio não encontrado" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    post: { ...updated, trust: postTrustSummary(updated, user) },
    dossier: dossierTrust(updated),
  });
}
