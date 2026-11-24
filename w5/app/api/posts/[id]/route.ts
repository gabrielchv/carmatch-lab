import { NextResponse } from "next/server";
import { getItemById, deleteItem, readData, writeData } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { runMatching } from "@/lib/matching";
import type { CarPost, Match, DesiredVehicle } from "@/lib/types";
import { saveImages, deleteUpload, UploadError } from "@/lib/upload";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const post = getItemById<CarPost>("posts", id);
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  return NextResponse.json({ post });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const post = getItemById<CarPost>("posts", id);
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  if (post.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Delete associated images
  for (const image of post.images) {
    deleteUpload(image);
  }

  // Delete post
  deleteItem<CarPost>("posts", id);

  // Remove related matches
  const matches = readData<Match>("matches").filter(
    (m) => m.postAId !== id && m.postBId !== id
  );
  writeData("matches", matches);

  // Re-run matching for remaining posts
  runMatching();

  return NextResponse.json({ success: true });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  if (!user.whatsapp) {
    return NextResponse.json(
      { error: "Cadastre seu WhatsApp antes de editar anúncios.", code: "whatsapp_required" },
      { status: 403 }
    );
  }

  const post = getItemById<CarPost>("posts", id);
  if (!post) {
    return NextResponse.json({ error: "Anúncio não encontrado" }, { status: 404 });
  }
  if (post.userId !== user.id) {
    return NextResponse.json({ error: "Proibido" }, { status: 403 });
  }

  try {
    const formData = await request.formData();

    const title = (formData.get("title") as string)?.trim();
    const description = ((formData.get("description") as string) || "").trim();
    const brand = (formData.get("brand") as string)?.trim();
    const model = (formData.get("model") as string)?.trim();
    const year = Number(formData.get("year"));
    const estimatedValue = Number(formData.get("estimatedValue"));
    const fipeBrandId = (formData.get("fipeBrandId") as string) || undefined;
    const fipeModelCode = (formData.get("fipeModelCode") as string) || undefined;
    const fipeYearCode = (formData.get("fipeYearCode") as string) || undefined;
    const email = (formData.get("email") as string) || undefined;

    // Informações adicionais do carro
    const mileage = formData.get("mileage") ? Number(formData.get("mileage")) : undefined;
    const color = (formData.get("color") as string) || undefined;
    const localization = (formData.get("localization") as string) || undefined;

    // Distância máxima geral (opcional)
    const maxDistance = formData.get("maxDistance") ? Number(formData.get("maxDistance")) : undefined;

    // Same validation as POST — the original PUT accepted anything.
    const fieldErrors: Record<string, string> = {};
    if (!title) fieldErrors.title = "Informe um título.";
    if (!brand) fieldErrors.brand = "Informe a marca.";
    if (!model) fieldErrors.model = "Informe o modelo.";
    if (!Number.isFinite(year) || year < 1950 || year > new Date().getFullYear() + 1) {
      fieldErrors.year = "Ano inválido.";
    }
    if (!Number.isFinite(estimatedValue) || estimatedValue <= 0) {
      fieldErrors.estimatedValue = "Valor estimado inválido.";
    }
    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json(
        { error: "Verifique os campos destacados.", fields: fieldErrors },
        { status: 400 }
      );
    }

    // Vehicle rows
    const vehicleVehicleTypes = formData.getAll("vVehicleType") as string[];
    const vehicleBrands = formData.getAll("vBrand") as string[];
    const vehicleModels = formData.getAll("vModel") as string[];
    const vehicleVersions = formData.getAll("vVersion") as string[];
    const vehicleTransmissions = formData.getAll("vTransmission") as string[];
    const vehicleYearMin = formData.getAll("vYearMin") as string[];
    const vehicleYearMax = formData.getAll("vYearMax") as string[];
    const vehicleMileageMin = formData.getAll("vMileageMin") as string[];
    const vehicleMileageMax = formData.getAll("vMileageMax") as string[];
    const vehicleCashAdj = formData.getAll("vCashAdj") as string[];
    const vehicleTolerance = formData.getAll("vTolerance") as string[];
    const vehicleFipeBrandId = formData.getAll("vFipeBrandId") as string[];
    const vehicleFipeVersionCode = formData.getAll("vFipeVersionCode") as string[];

    const vehicles: DesiredVehicle[] = [];
    for (let i = 0; i < vehicleBrands.length; i++) {
      const vt = vehicleVehicleTypes[i]?.trim();
      const vb = vehicleBrands[i]?.trim();

      // Vehicle type mode
      if (vt) {
        vehicles.push({
          brand: "",
          model: "",
          cashAdjustment: Number(vehicleCashAdj[i]) || 0,
          cashAdjustmentTolerance: Number(vehicleTolerance[i]) || 0,
          yearMin: vehicleYearMin[i] ? Number(vehicleYearMin[i]) : undefined,
          yearMax: vehicleYearMax[i] ? Number(vehicleYearMax[i]) : undefined,
          mileageMin: vehicleMileageMin[i] ? Number(vehicleMileageMin[i]) : undefined,
          mileageMax: vehicleMileageMax[i] ? Number(vehicleMileageMax[i]) : undefined,
          vehicleType: vt as DesiredVehicle["vehicleType"],
        });
        continue;
      }

      // Specific vehicle mode: skip rows without brand
      if (!vb) continue;
      vehicles.push({
        brand: vb,
        model: vehicleModels[i]?.trim() || "",
        version: vehicleVersions[i]?.trim() || undefined,
        transmission: vehicleTransmissions[i]?.trim() || undefined,
        yearMin: vehicleYearMin[i] ? Number(vehicleYearMin[i]) : undefined,
        yearMax: vehicleYearMax[i] ? Number(vehicleYearMax[i]) : undefined,
        mileageMin: vehicleMileageMin[i] ? Number(vehicleMileageMin[i]) : undefined,
        mileageMax: vehicleMileageMax[i] ? Number(vehicleMileageMax[i]) : undefined,
        cashAdjustment: Number(vehicleCashAdj[i]) || 0,
        cashAdjustmentTolerance: Number(vehicleTolerance[i]) || 0,
        fipeBrandId: vehicleFipeBrandId[i]?.trim() || undefined,
        fipeVersionCode: vehicleFipeVersionCode[i]?.trim() || undefined,
      });
    }

    // ── Handle images ──
    //
    // `keepImages` comes from the client, so it must not be trusted as-is.
    // It is meant to say "of MY existing photos, keep these". Without the
    // intersection below, a user could send someone else's filename, have it
    // stored on their own post, then delete their post — and the DELETE
    // handler would unlink the other user's file from the shared uploads
    // directory. Proven exploitable: the victim's image returned 404 while
    // their listing still pointed at it.
    const keepImagesRaw = formData.get("keepImages") as string | null;
    let requestedKeep: string[] | null = null;
    if (keepImagesRaw) {
      try {
        const parsed = JSON.parse(keepImagesRaw);
        if (Array.isArray(parsed)) {
          requestedKeep = parsed.filter((v): v is string => typeof v === "string");
        }
      } catch {
        requestedKeep = null; // malformed -> treat as "keep everything"
      }
    }

    const keepImages: string[] =
      requestedKeep === null
        ? post.images // not sent / unparseable: keep all existing
        : post.images.filter((img) => requestedKeep!.includes(img));

    // Delete images no longer referenced
    for (const img of post.images) {
      if (!keepImages.includes(img)) {
        deleteUpload(img);
      }
    }

    // Save new uploaded images
    const imageFiles = formData.getAll("images") as File[];
    const newImages = (await saveImages(imageFiles)).map((s) => s.filename);

    // ── Build updated post ──
    const updated: CarPost = {
      ...post,
      title,
      description,
      car: { brand, model, year, estimatedValue, mileage, color, localization, fipeBrandId, fipeModelCode, fipeYearCode },
      desiredTrade: { vehicles, maxDistance },
      contactInfo: { whatsapp: user.whatsapp, email },
      images: [...keepImages, ...newImages],
    };

    // Write update
    const allPosts = readData<CarPost>("posts");
    const idx = allPosts.findIndex((p) => p.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: "Anúncio não encontrado" }, { status: 404 });
    }
    allPosts[idx] = updated;
    writeData("posts", allPosts);

    // Re-run matching
    runMatching();

    return NextResponse.json({ post: updated });
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Erro ao atualizar anúncio:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar anúncio" },
      { status: 500 }
    );
  }
}
