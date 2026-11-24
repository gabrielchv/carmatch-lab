export interface FipeModelRaw {
  codigo: number | string;
  nome: string;
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
