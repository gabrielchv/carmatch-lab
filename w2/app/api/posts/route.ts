import { NextResponse } from "next/server";
import { addItem, readData } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { generateId, nowISO } from "@/lib/utils";
import { runMatching } from "@/lib/matching-run";
import { vehicleMatchesCar } from "@/lib/matching";
import type { CarPost, DesiredVehicle } from "@/lib/types";
import { isInProximity, parseLocalization } from "@/lib/location-utils";
import { saveImages, UploadError } from "@/lib/upload";

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 48;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.toLowerCase();
  const minPrice = searchParams.get("minPrice");
  const maxPrice = searchParams.get("maxPrice");
  const brand = searchParams.get("brand")?.toLowerCase();
  const model = searchParams.get("model")?.toLowerCase();
  const yearMin = searchParams.get("yearMin");
  const yearMax = searchParams.get("yearMax");
  const mileageMin = searchParams.get("mileageMin");
  const mileageMax = searchParams.get("mileageMax");
  const rangeParam = searchParams.get("range");
  const desiredType = searchParams.get("desiredType")?.toLowerCase();
  const sortBy = searchParams.get("sortBy") || "date";
  const sortOrder = searchParams.get("sortOrder") || "desc";

  const page = Math.max(1, Number(searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(
      1,
      Number(searchParams.get("pageSize") || DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE
    )
  );

  let posts = readData<CarPost>("posts").filter((p) => p.isActive);

  // "Meus anúncios" — filtering server-side avoids shipping every post to the
  // client and discarding most of them (which is what the old page did).
  if (searchParams.get("mine") === "1") {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    posts = posts.filter((p) => p.userId === user.id);
  }

  // Busca geral: procura em título, descrição, marca, modelo e localização
  if (q) {
    posts = posts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.car.brand.toLowerCase().includes(q) ||
        p.car.model.toLowerCase().includes(q) ||
        (p.car.localization || "").toLowerCase().includes(q)
    );
  }

  if (minPrice) {
    posts = posts.filter((p) => p.car.estimatedValue >= Number(minPrice));
  }
  if (maxPrice) {
    posts = posts.filter((p) => p.car.estimatedValue <= Number(maxPrice));
  }

  if (brand) {
    posts = posts.filter((p) => p.car.brand.toLowerCase().includes(brand));
  }

  if (model) {
    posts = posts.filter((p) => p.car.model.toLowerCase().includes(model));
  }

  if (yearMin) {
    posts = posts.filter((p) => p.car.year >= Number(yearMin));
  }
  if (yearMax) {
    posts = posts.filter((p) => p.car.year <= Number(yearMax));
  }

  if (mileageMin) {
    posts = posts.filter(
      (p) => p.car.mileage !== undefined && p.car.mileage >= Number(mileageMin)
    );
  }
  if (mileageMax) {
    posts = posts.filter(
      (p) => p.car.mileage !== undefined && p.car.mileage <= Number(mileageMax)
    );
  }

  // Localização com proximidade
  const localizationRaw = searchParams.get("localization");
  const range = rangeParam ? Number(rangeParam) : undefined;
  if (localizationRaw) {
    const parsed = parseLocalization(localizationRaw);
    const filterState = parsed.state;
    const filterCity = parsed.city || null;

    if (filterState) {
      if (range !== undefined && !isNaN(range)) {
        posts = posts.filter((p) => {
          if (!p.car.localization) return false;
          return isInProximity(p.car.localization, filterState, filterCity, range);
        });
      } else {
        posts = posts.filter((p) => {
          if (!p.car.localization) return false;
          const postParsed = parseLocalization(p.car.localization);
          if (!postParsed.state) return false;
          if (postParsed.state !== filterState) return false;
          if (filterCity && postParsed.city) {
            return postParsed.city.toLowerCase() === filterCity.toLowerCase();
          }
          return true;
        });
      }
    } else {
      posts = posts.filter(
        (p) =>
          p.car.localization &&
          p.car.localization.toLowerCase().includes(localizationRaw.toLowerCase())
      );
    }
  }

  // ── "Quem quer meu carro" ──
  //
  // The inverse of every other filter. Instead of "show me cars that satisfy
  // what I want", it answers "show me the people who would accept the car I
  // already have". That listing may not exist yet — which is exactly the point:
  // it tells someone whether publishing is worth it.
  const wantsBrand = searchParams.get("wantsBrand")?.trim();
  const wantsModel = searchParams.get("wantsModel")?.trim();
  // Full FIPE model name when the visitor picked a version
  // ("TRACKER LT 1.8 16V Flex 4x2 Aut."). Preferred over the bare model name
  // because it carries the transmission, which listings often require.
  const wantsVersion = searchParams.get("wantsVersion")?.trim();
  const wantsYearRaw = searchParams.get("wantsYear");
  const wantsYear = wantsYearRaw ? Number(wantsYearRaw) : undefined;

  if (wantsBrand || wantsModel || wantsVersion) {
    const yearKnown = Number.isFinite(wantsYear) && (wantsYear as number) > 0;
    const versionKnown = Boolean(wantsVersion);

    const car = {
      brand: wantsBrand ?? "",
      // With a version, use the full name; otherwise the general model.
      model: versionKnown ? (wantsVersion as string) : (wantsModel ?? ""),
      // A year is only meaningful if the visitor supplied one; otherwise the
      // year bounds are dropped per listing rather than guessed.
      year: yearKnown ? (wantsYear as number) : 2015,
      estimatedValue: 0,
    };

    posts = posts.filter((p) =>
      (p.desiredTrade.vehicles ?? []).some((want) => {
        /*
         * Relax the *listing's* requirement to match what the visitor actually
         * told us. Each relaxation below corresponds to a fact we do not have:
         *
         *  · model — a brand-only search means "anyone who accepts this
         *    brand", so the listing's model constraint drops out.
         *  · year — an unknown year must not be replaced by a guessed one.
         *  · transmission — this was the bug: the listing required
         *    "Automático" and the filter's synthetic car was just "TRACKER",
         *    which never contains "Aut.". Every listing that specified a
         *    transmission was invisible. Without a version we cannot know the
         *    visitor's transmission, so requiring it is wrong.
         */
        const effective: typeof want = {
          ...want,
          model: wantsModel || versionKnown ? want.model : "",
          transmission: versionKnown ? want.transmission : undefined,
          yearMin: yearKnown ? want.yearMin : undefined,
          yearMax: yearKnown ? want.yearMax : undefined,
        };
        return vehicleMatchesCar(car, effective);
      })
    );
  }

  // Tipo de veículo desejado
  if (desiredType) {
    const types = desiredType.split(",");
    posts = posts.filter((p) =>
      p.desiredTrade.vehicles.some(
        (v) => v.vehicleType && types.includes(v.vehicleType.toLowerCase())
      )
    );
  }

  // Ordenação
  if (sortBy === "value") {
    posts.sort((a, b) =>
      sortOrder === "asc"
        ? a.car.estimatedValue - b.car.estimatedValue
        : b.car.estimatedValue - a.car.estimatedValue
    );
  } else if (sortBy === "year") {
    posts.sort((a, b) =>
      sortOrder === "asc" ? a.car.year - b.car.year : b.car.year - a.car.year
    );
  } else if (sortBy === "mileage") {
    posts.sort((a, b) => {
      const ma = a.car.mileage ?? Number.POSITIVE_INFINITY;
      const mb = b.car.mileage ?? Number.POSITIVE_INFINITY;
      return sortOrder === "asc" ? ma - mb : mb - ma;
    });
  } else {
    posts.sort((a, b) =>
      sortOrder === "asc"
        ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  const total = posts.length;
  const start = (page - 1) * pageSize;

  return NextResponse.json({
    posts: posts.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    hasMore: start + pageSize < total,
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // WhatsApp is the only contact channel, so a listing without it is useless to
  // everyone who sees it. Refuse to publish rather than create a dead listing.
  if (!user.whatsapp) {
    return NextResponse.json(
      {
        error: "Cadastre seu WhatsApp antes de publicar.",
        code: "whatsapp_required",
      },
      { status: 403 }
    );
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

    const mileageRaw = formData.get("mileage");
    const mileage = mileageRaw ? Number(mileageRaw) : undefined;
    const color = (formData.get("color") as string) || undefined;
    const localization = (formData.get("localization") as string) || undefined;

    const maxDistanceRaw = formData.get("maxDistance");
    const maxDistance = maxDistanceRaw ? Number(maxDistanceRaw) : undefined;

    // ── Validation ──
    // The original trusted all of these, so a bad year or an empty title
    // produced a broken card instead of an error message.
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
    if (mileage !== undefined && (!Number.isFinite(mileage) || mileage < 0)) {
      fieldErrors.mileage = "Quilometragem inválida.";
    }
    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json(
        { error: "Verifique os campos destacados.", fields: fieldErrors },
        { status: 400 }
      );
    }

    // Monta array de vehicles a partir dos fields do form
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

      if (vt) {
        vehicles.push({
          brand: "",
          model: "",
          cashAdjustment: Number(vehicleCashAdj[i]) || 0,
          cashAdjustmentTolerance: Math.abs(Number(vehicleTolerance[i])) || 0,
          yearMin: vehicleYearMin[i] ? Number(vehicleYearMin[i]) : undefined,
          yearMax: vehicleYearMax[i] ? Number(vehicleYearMax[i]) : undefined,
          mileageMin: vehicleMileageMin[i] ? Number(vehicleMileageMin[i]) : undefined,
          mileageMax: vehicleMileageMax[i] ? Number(vehicleMileageMax[i]) : undefined,
          vehicleType: vt as DesiredVehicle["vehicleType"],
        });
        continue;
      }

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
        cashAdjustmentTolerance: Math.abs(Number(vehicleTolerance[i])) || 0,
        fipeBrandId: vehicleFipeBrandId[i]?.trim() || undefined,
        fipeVersionCode: vehicleFipeVersionCode[i]?.trim() || undefined,
      });
    }

    if (vehicles.length === 0) {
      return NextResponse.json(
        {
          error:
            "Diga pelo menos um carro ou tipo de carro que você aceita na troca.",
          fields: { vehicles: "Sem opção de troca." },
        },
        { status: 400 }
      );
    }

    const imageFiles = formData.getAll("images") as File[];
    const savedImages = await saveImages(imageFiles);

    const post: CarPost = {
      id: generateId(),
      userId: user.id,
      title,
      description,
      car: { brand, model, year, estimatedValue, mileage, color, localization, fipeBrandId, fipeModelCode, fipeYearCode },
      desiredTrade: { vehicles, maxDistance },
      // Always the account's number: it is what the contact endpoint and every
      // WhatsApp button read. A per-listing number would let people publish a
      // phone they do not control.
      contactInfo: { whatsapp: user.whatsapp, email },
      images: savedImages.map((s) => s.filename),
      createdAt: nowISO(),
      isActive: true,
    };

    addItem("posts", post);

    // Roda matching automaticamente
    const newMatches = runMatching();

    return NextResponse.json({ post, newMatches: newMatches.length }, { status: 201 });
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Erro ao criar post:", error);
    return NextResponse.json(
      { error: "Erro ao criar anúncio" },
      { status: 500 }
    );
  }
}
