export interface FipeModelRaw {
  codigo: number | string;
  nome: string;
}

/** One option from `/api/fipe/models?brandId=…&simplified=1`. */
export interface SimplifiedVersionPayload {
  key: string;
  /** Rótulo pronto, ex: "Tracker 1.8 Flex · Aut." */
  label: string;
  /** Linha FIPE, ex: "tracker". */
  line: string;
  /** Família completa, ex: "corolla cross". */
  family: string;
  transmission: "auto" | "manual" | null;
  /** Códigos FIPE agrupados nesta opção. */
  codes: string[];
  /** Nomes FIPE agrupados nesta opção. */
  members: string[];
  /** Código representativo, para anos e preço. */
  code: string;
  /** Nome FIPE completo representativo — é o que se grava no anúncio. */
  fullName: string;
}

export interface SimplifiedModelsPayload {
  brandId: string;
  stats: { before: number; after: number; lines: number };
  /** True when the catalogue came from the saved copy, not the live service. */
  stale?: boolean;
  /** ISO date of the fetch that produced that copy. */
  fetchedAt?: string;
  lines: {
    key: string;
    name: string;
    versions: SimplifiedVersionPayload[];
  }[];
}

export interface VersionOption {
  /** Versão sem a transmissão, ex: "CX 1.4 Flex 16V 5p" */
  version: string;
  /** Transmissão inferida ("Automático" | "Manual") ou null se indeterminado */
  transmission: string | null;
  /** Nome completo FIPE, ex: "Fit CX 1.4 Flex 16V 5p Aut." */
  fullName: string;
  /** Código do modelo na FIPE */
  modelCode: string;
  /**
   * Todos os códigos FIPE que esta opção representa.
   *
   * Ausente na lista crua, onde cada opção é um único modelo.
   */
  codes?: string[];
  /**
   * Todos os nomes FIPE que esta opção representa.
   *
   * É por aqui que um anúncio antigo (gravado com o acabamento exato, "Ka SEL
   * 1.5") é reencontrado na lista simplificada.
   */
  members?: string[];
}

export interface ParsedFipeModels {
  /** Lista de modelos gerais (primeira palavra) unique e ordenada */
  generalModels: string[];
  /** Versões agrupadas por modelo geral */
  versionsByGeneralModel: Record<string, VersionOption[]>;
}

/**
 * Parseia os nomes dos modelos da FIPE para extrair:
 * - modelo geral (primeira palavra, ex: "Fit")
 * - versão (restante, sem "Aut."/"Mec.")
 * - transmissão ("Automático" | "Manual" | null)
 *
 * Padrão: `<ModeloGeral> <Versão> [Aut.|Mec.]`
 */
export function parseFipeModels(models: FipeModelRaw[]): ParsedFipeModels {
  const versionsByGeneralModel: Record<string, VersionOption[]> = {};
  const modelSet = new Set<string>();

  for (const m of models) {
    const name = m.nome.trim();
    const spaceIdx = name.indexOf(" ");
    const generalModel =
      spaceIdx > 0 ? name.substring(0, spaceIdx).trim() : name;
    let rest = spaceIdx > 0 ? name.substring(spaceIdx + 1).trim() : "";

    // Extrai transmissão
    let transmission: string | null = null;
    if (/Aut\.?$/i.test(rest)) {
      transmission = "Automático";
      rest = rest.replace(/\s*Aut\.?\s*$/i, "").trim();
    } else if (/Mec\.?$/i.test(rest)) {
      transmission = "Manual";
      rest = rest.replace(/\s*Mec\.?\s*$/i, "").trim();
    }

    const version = rest;

    modelSet.add(generalModel);
    if (!versionsByGeneralModel[generalModel]) {
      versionsByGeneralModel[generalModel] = [];
    }

    // Deduplica: a FIPE pode retornar o mesmo nome de versão com códigos diferentes
    // (ex: mesmo modelo para faixas de ano distintas). Como são indistinguíveis
    // para o usuário, mantemos apenas a primeira ocorrência.
    const dupKey = `${version}::${transmission ?? ""}`;
    const alreadyExists = versionsByGeneralModel[generalModel].some(
      (existing) => `${existing.version}::${existing.transmission ?? ""}` === dupKey
    );
    if (!alreadyExists) {
      versionsByGeneralModel[generalModel].push({
        version,
        transmission,
        fullName: name,
        modelCode: String(m.codigo),
      });
    }
  }

  const generalModels = [...modelSet].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );

  return { generalModels, versionsByGeneralModel };
}

/**
 * Normaliza string para comparação: lowercase + trim
 */
export function normalizeStr(s: string): string {
  return s.toLowerCase().trim();
}

/**
 * Adapta a resposta simplificada ao mesmo formato que o formulário de anúncio
 * já consome, para que os três seletores do app (anúncio, filtro, onboarding)
 * falem do mesmo catálogo com o mesmo código.
 *
 * O rótulo simplificado já traz a família ("Tracker 1.8 Flex") porque foi feito
 * para ficar sozinho num select; aqui ela é removida, já que a linhaaparece no
 * campo anterior — a versão fica "1.8 Flex", e um sub-modelo continua visível
 * ("Cross 2.0 Flex" sob a linha Corolla).
 */
export function parseSimplifiedPayload(
  payload: SimplifiedModelsPayload
): ParsedFipeModels {
  const versionsByGeneralModel: Record<string, VersionOption[]> = {};
  const generalModels: string[] = [];

  for (const line of payload.lines ?? []) {
    const lineName = (line.name || line.key).trim();
    generalModels.push(lineName);
    versionsByGeneralModel[lineName] = (line.versions ?? []).map((v) => {
      const withoutSuffix = v.label.split(" · ")[0].trim();
      const prefix = new RegExp(`^${lineName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i");
      const version = withoutSuffix.replace(prefix, "").trim() || withoutSuffix;
      return {
        version,
        transmission:
          v.transmission === "auto"
            ? "Automático"
            : v.transmission === "manual"
              ? "Manual"
              : null,
        fullName: v.fullName,
        modelCode: v.code,
        codes: v.codes,
        members: v.members,
      };
    });
  }

  generalModels.sort((a, b) => a.localeCompare(b, "pt-BR"));

  return { generalModels, versionsByGeneralModel };
}

/**
 * Find the option that contains a stored FIPE model code.
 *
 * A simplified option collapses several trims, and its `modelCode` is only the
 * representative. Checking `codes` as well is what keeps an existing listing
 * pointing at the car it was actually created with.
 */
export function findVersionByCode(
  parsed: ParsedFipeModels,
  code: string
): VersionOption | undefined {
  const target = String(code);
  for (const versions of Object.values(parsed.versionsByGeneralModel)) {
    const hit = versions.find(
      (v) => v.modelCode === target || (v.codes ?? []).includes(target)
    );
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Find the option that contains a stored FIPE model name.
 *
 * Prefers an exact match — a listing saved as "Ka SEL 1.5 16V Flex 5p" must
 * reopen as the option that contains that trim, not as whichever option happens
 * to share the family. Case and whitespace differences are ignored because FIPE
 * itself is inconsistent about both ("Aut" vs "Aut.", trailing spaces).
 *
 * Deliberately no fallback on a version label alone: "1.8 Flex 16V" exists in
 * many lines, and guessing one would reopen a listing as a different car.
 * Returning undefined makes the caller keep the line and ask for the version.
 */
export function findVersionByName(
  parsed: ParsedFipeModels,
  name: string
): VersionOption | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const target = norm(name ?? "");
  if (!target) return undefined;

  const all = Object.values(parsed.versionsByGeneralModel).flat();

  // 1. O nome exato, entre os membros do grupo.
  const byMember = all.find((v) =>
    (v.members ?? [v.fullName]).some((m) => norm(m) === target)
  );
  if (byMember) return byMember;

  // 2. O nome representativo.
  return all.find((v) => norm(v.fullName) === target);
}

/**
 * Versions of a line, tolerating case and extra spaces.
 *
 * A listing saved before this change stores the raw FIPE word ("TRACKER"),
 * while the simplified payload keys lines in a readable form ("Tracker"). An
 * exact lookup returned nothing, so editing the listing showed empty selects.
 */
export function versionsForLine(
  parsed: ParsedFipeModels | null | undefined,
  line: string
): VersionOption[] {
  if (!parsed || !line) return [];
  const direct = parsed.versionsByGeneralModel[line];
  if (direct) return direct;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const target = norm(line);
  const key = Object.keys(parsed.versionsByGeneralModel).find((k) => norm(k) === target);
  return key ? parsed.versionsByGeneralModel[key] : [];
}

/** The canonical line name for a stored one. */
export function lineKeyOf(
  parsed: ParsedFipeModels | null | undefined,
  line: string
): string {
  if (!parsed || !line) return line;
  if (parsed.versionsByGeneralModel[line]) return line;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const target = norm(line);
  return (
    Object.keys(parsed.versionsByGeneralModel).find((k) => norm(k) === target) ?? line
  );
}

/**
 * "GOL 1.0 Plus 8v 2p" sob a linha "Gol" → "1.0 Plus 8v 2p".
 *
 * O formulário grava modelo e versão em campos separados e o matcher recompõe os
 * dois. Repetir o nome da linha dentro da versão criaria "Gol Gol …", cuja
 * família deixa de casar com o carro real.
 */
export function memberVersionLabel(member: string, line: string): string {
  if (!member) return member;
  const safe = line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stripped = member.replace(new RegExp(`^${safe}\\s+`, "i"), "").trim();
  return stripped || member;
}
