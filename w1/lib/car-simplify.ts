/**
 * Collapsing the FIPE catalogue into something a human can pick from.
 *
 * FIPE lists every trim as its own model. Chevrolet TRACKER has 20 entries,
 * but the distinctions that change the car are three engines and two
 * transmissions; the rest is LT / LTZ / Premier / Midnight / RS — marketing
 * names that a swap does not care about. Fiat CRONOS has 12 entries that are
 * really 5 cars. A 20-row select is not "precise", it is a wall.
 *
 * This module reduces each list to (family, displacement, aspiration, fuel,
 * drivetrain, transmission) — and gives the matcher the same decomposition, so
 * picking "Tracker 1.8 Flex · Aut." matches a listing of "TRACKER LTZ 1.8 16V
 * Flex 4x2 Aut.". They are the same car; the listing just spelled the trim.
 *
 * Three rules keep it safe:
 *
 *  1. **Only merge what is provably cosmetic.** A name this module cannot
 *     decompose is never merged — it becomes its own option. A missed merge is
 *     a slightly longer list; a wrong merge is a listing that disappears.
 *  2. **Conflicting facts split the group.** If two members disagree on valve
 *     count or power, they are different engines and stay apart. An *absent*
 *     fact is a wildcard, which is how "1.2 Turbo 12V Flex" and "1.2 Turbo
 *     Flex" end up together: absence of a claim is not a claim.
 *  3. **Selection and matching share one definition.** `sameCar` uses the same
 *     keys as `simplifyModels`, so the shorter list cannot invent matches.
 *
 * Pure module — no filesystem, importable by client components.
 */

/* ─── Vocabulary ───────────────────────────────────────────────── */

/**
 * Tokens that describe equipment or marketing position, never the car.
 * Removed before a family is formed.
 *
 * Deliberately conservative: "cross" is absent on purpose — Corolla Cross and
 * Corolla are different vehicles — as are "fire" and "evo", which name Fiat
 * engine families rather than trims.
 */
const TRIM_WORDS = new Set([
  // GM / Chevrolet
  "lt", "ltz", "lts", "premier", "midnight", "rs", "joy", "ls", "advantage",
  "black", "bow", "tie", "effect", "maxx", "life",
  // Fiat
  "drive", "hgt", "precision", "trekking", "essence", "attractive", "sporting",
  "way", "audace", "endurance", "freedom", "like", "longitude", "cult",
  // VW
  "highline", "comfortline", "track", "trendline", "allstar",
  // Hyundai
  "comfort", "vision", "premium", "pulse", "limited", "unique", "plus",
  // Renault
  "stepway", "zen", "intense", "iconic", "dynamique", "privilege",
  // Nissan
  "sv", "sl", "advance", "sense", "sano", "active",
  // Jeep
  "sport", "limited", "trailhawk", "sahara", "rubicon",
  // misc equipment grades
  "ex", "exl", "lx", "lxi", "dx", "sle", "slt", "se", "sel", "set",
  "gsr", "freeride", "xei", "xli", "gli", "altis", "xrs", "xle", "se-g",
  "upper", "r-line", "gt", "gls", "gl", "xr", "xse", "hlx", "slx", "club",
  // mined from the catalogue: grades that were splitting families in two
  "elx", "s", "sl", "sr", "adv", "luxe", "celeb", "griffe", "city",
  "super", "dlx", "ext", "working", "xs", "feline", "mille", "le",
  "srv", "gr-s", "gti", "gts", "xls", "xlt", "top", "high", "trend",
  "blackmotion", "b.edit", "allure", "comfort", "st", "sx", "line", "motion",
  "wt", "boss", "xre", "xrx", "conquest", "rallye", "sunset",
]);

/** Marks a special edition ("100 Anos", "Black Edition") — not a car family. */
const EDITION_WORDS = new Set([
  "anos", "ano", "edition", "edicao", "series", "serie", "special", "rock",
  "sunset", "summer", "winter", "atlanta", "season", "millenium", "milenium",
]);

/**
 * Tokens that never change which car it is: injection systems, engine-brand
 * marketing, body-style words. Dropped from the key; their *reading* is still
 * used for the label (valve count) and for splitting groups where two members
 * disagree (valve, power).
 */
const NOISE_WORDS = new Set([
  // injection / engine plumbing
  "mpfi", "mpf", "mpi", "mi", "efi", "mfi", "fsi", "spi", "sfi", "ms", "msi",
  "i", "ie", "e", "e6", "cdi", "spfi", "vhc", "thp", "electronic",
  // flex-fuel marketing
  "total", "flexpower", "flexp", "flexone", "flexstart", "econoflex",
  "econof", "flexstar", "tot", "power", "pow", "eco", "econ", "economy",
  "energy", "dual", "f",
  // pickups' cabin wording; body style is read separately via BODY_WORDS
  "cd", "cs", "ce", "std", "custom",
  // the same pickup written two ways (S10 P-Up vs S10 Pick-Up)
  "pick-up", "p-up", "p.up",
]);

/**
 * Body styles, canonicalised — and treated as a *fact that separates cars*.
 *
 * These were noise once, and that was wrong: FIPE does not put the body in the
 * family. "ONIX HATCH" and "ONIX SEDAN Plus" are different cars with different
 * prices, and merging them meant a sedan owner published a listing named after
 * the hatchback, valued from the hatchback's FIPE price. 47 real groups did
 * this before the split.
 *
 * "plus" is a sedan in Chevrolet's naming (Onix Plus), not an equipment level.
 */
const BODY_WORDS: Record<string, string> = {
  hatch: "hatch",
  hatchback: "hatch",
  sedan: "sedan",
  sed: "sedan",
  plus: "sedan",
  sw: "wagon",
  wagon: "wagon",
  perua: "wagon",
  weekend: "wagon",
  coupe: "coupe",
  conv: "convertible",
  conversivel: "convertible",
  cabriolet: "convertible",
  cabrio: "convertible",
  targa: "convertible",
  roadster: "convertible",
  van: "van",
  furgao: "van",
  minibus: "van",
  cargo: "van",
  suv: "suv",
  jipe: "suv",
  buggy: "buggy",
};

/** How the body reads in a label. Absent bodies add nothing. */
const BODY_LABEL: Record<string, string> = {
  hatch: "Hatch",
  sedan: "Sedan",
  wagon: "Perua",
  coupe: "Coupé",
  convertible: "Conversível",
  van: "Van",
  suv: "SUV",
  buggy: "Buggy",
};

/** Tokens that name the engine's forced induction. */
const ASPIRATION_WORDS = new Set([
  "turbo", "turbo16v", "tb", "tsi", "tdi", "tdies", "tbi", "gdi", "biturbo",
  "bi-turbo", "turb", "d4-d",
]);

/**
 * FIPE writes the same fact two ways — "BiTurbo" and "Bi-Turbo". Left alone,
 * they split a group in two and then the round-trip through the picker fails to
 * find the car it just showed. One spelling, decided here.
 */
function canonicalAspiration(token: string): string {
  if (token === "bi-turbo" || token === "biturbo") return "biturbo";
  return token;
}

/** Fuel — part of the key when declared. */
const FUEL_WORDS: Record<string, string> = {
  flex: "flex",
  gasolina: "gasolina",
  gas: "gasolina",
  alcool: "alcool",
  etanol: "alcool",
  diesel: "diesel",
  dies: "diesel",
  die: "diesel",
  gnv: "gnv",
  hibrido: "hibrido",
  hib: "hibrido",
  hybrid: "hibrido",
  eletrico: "eletrico",
  electrico: "eletrico",
  el: "eletrico",
};

/** FIPE spells drivetrain half a dozen ways; they are two facts, not six. */
const DRIVETRAIN: Record<string, "4wd" | "2wd"> = {
  "4x4": "4wd", "4wd": "4wd", awd: "4wd", "4motion": "4wd", motion: "4wd",
  "4x2": "2wd", "2wd": "2wd", fwd: "2wd",
};

/** Engine family names — real mechanical differences, kept in the key. */
const ENGINE_FAMILY_WORDS = new Set(["fire", "evo", "v6", "v8", "v10", "v12"]);

const ENGINE_TOKEN = /^\d\.\d$/;
const VALVE_TOKEN = /^\d{1,2}v$/;
const POWER_TOKEN = /^\d{2,4}cv$/;
const DOOR_TOKEN = /^\d{1,2}p$/;

/* ─── Normalisation ────────────────────────────────────────────── */

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[()·]/g, " ")
    .replace(/[.,]+$/g, "")
    .trim();

/**
 * Split "Dies.Aut." into ["dies","aut"] and "aut.4p" into ["aut","4p"], while
 * leaving decimals alone: "1.0" is the engine, and splitting it in two made
 * every signature unparseable.
 *
 * A slash separates tokens, but a slash that splits an engine ("2.0 8V/ CD
 * 2.0 8V") is flagged by `signatureOf` rather than silently scored as one of
 * the two cars.
 */
export function tokenize(name: string): string[] {
  const out: string[] = [];
  for (const raw of strip(name).replace(/\//g, " / ").split(/\s+/)) {
    if (!raw || raw === "/") continue;

    // "1.8Mi", "1.6i", "1.0T" — a displacement with a suffix glued on. Split
    // the suffix off but keep the displacement whole; otherwise "1.8mi" broke
    // into "1" and "8mi" and the name stopped being readable at all.
    const suffixed = raw.match(/^(\d+\.\d+)([a-z].*)$/);
    if (suffixed) {
      out.push(suffixed[1]);
      out.push(...suffixed[2].split(".").filter(Boolean));
      continue;
    }

    const parts = /^\d+\.\d+$/.test(raw) ? [raw] : raw.split(".");
    for (const part of parts) {
      const token = part.replace(/[.,]+$/g, "");
      if (token) out.push(token);
    }
  }
  return out;
}

/* ─── Signature ────────────────────────────────────────────────── */

export type Transmission = "auto" | "manual";

export interface CarSignature {
  /** Families compare as a whole string: "tracker", "corolla cross". */
  family: string;
  /** First family word — FIPE's general model: "tracker", "corolla". */
  line: string;
  /** "1.0", "2.0". Required — a series has one displacement. */
  displacement: string;
  /** Sorted aspiration words: "", "turbo", "tdi turbo". */
  aspiration: string;
  /** Sorted fuel words: "", "flex", "diesel". */
  fuel: string;
  /** "4wd" | "2wd" | "" (not stated, which is 2wd in practice). */
  drivetrain: string;
  /** Declared valve count — "16v" — or "" when the name omits it. */
  valve: string;
  /** Declared power in cv — "128cv" — or "". */
  power: string;
  /** Body style — "hatch", "sedan", "wagon"… or "" when not stated. */
  body: string;
  /** Manual/automatic. FIPE omits it for manual, the prevailing convention. */
  transmission: Transmission;
  /** Everything the signature considered, for debugging. */
  tokens: string[];
}

/**
 * Decompose a FIPE model name.
 *
 * Returns null when the name has no recognisable displacement — a name this
 * module cannot reason about must never be merged with another.
 */
export function signatureOf(name: string): CarSignature | null {
  const tokens = tokenize(name);
  if (tokens.length === 0) return null;

  const engineAt = tokens.findIndex((t) => ENGINE_TOKEN.test(t));
  if (engineAt === -1) return null;

  /*
   * "1.0/ Super 1.0" and "2.0 8V/ CD 2.0 8V" name two cars in one string.
   * Guessing which half the listing means would be worse than leaving the
   * option long, so these stay unmerged and undecomposable.
   *
   * A slash only means that when *both* sides carry a displacement:
   * "FlexPower/EconoFlex" is one car with two marketing names.
   */
  const sides = name.split("/");
  const sidesWithEngine = sides.filter((side) =>
    tokenize(side).some((t) => ENGINE_TOKEN.test(t))
  ).length;
  if (sidesWithEngine >= 2) return null;

  // Two displacements in one name ("2.0 8V CD 2.0 8V") — same problem.
  if (tokens.filter((t) => ENGINE_TOKEN.test(t)).length > 1) return null;

  const isTransmission = (t: string) =>
    t.startsWith("aut") ||
    t.startsWith("mec") ||
    t === "tiptronic" ||
    t === "tipt" ||
    t === "dualogic";

  /*
   * FIPE puts real engine facts *before* the displacement as often as after it:
   * "Gol TSi 1.8", "Hilux 4x2 2.4 Diesel", "500 Cabrio Dualogic Flex 1.4".
   * Reading only the tail dropped the drivetrain and the aspiration on those,
   * so the same car appeared twice and four-wheel-drive matched two-wheel-drive.
   * Every token is classified; only the leftovers form the family.
   */
  const aspiration = new Set<string>();
  const fuel = new Set<string>();
  let drivetrain = "";
  let valve = "";
  let power = "";
  const familyTokens: string[] = [];
  let body = "";

  // "TRACKER 100 Anos" — the number belongs to the edition name, not the car,
  // and leaving it in produces a "Tracker 100" that does not exist.
  const hasEditionWord = tokens.some((t) => EDITION_WORDS.has(t));

  /*
   * Two *different* body styles in one name means the name covers two cars —
   * "500 Cabrio/500 Coupe Gucci" is a Cabrio AND a Coupé, at different prices.
   * Picking one would publish the wrong body, so the name is left whole.
   * (Repeats are fine: "Cargo Furgão" is one van written twice.)
   */
  const declaredBodies = new Set(
    tokens.map((t) => BODY_WORDS[t]).filter((b): b is string => Boolean(b))
  );
  if (declaredBodies.size > 1) return null;

  for (let i = 0; i < tokens.length; i++) {
    if (i === engineAt) continue;
    const t = tokens[i];
    const inHead = i < engineAt;

    /*
     * FIPE's first word is always the model — that is the catalogue's own
     * convention, and trimming it produced real damage: "city" was a trim on
     * our list, so Honda CITY became 12 unreadable raw options, and "joy" /
     * "pulse" / "stepway" opened phantom lines named after a grade.
     * No word is a trim when it is the first thing the catalogue says.
     */
    const isFirstWord = i === 0;

    if (isTransmission(t)) continue;
    if (VALVE_TOKEN.test(t)) {
      valve = valve || t;
      continue;
    }
    if (POWER_TOKEN.test(t)) {
      power = power || t;
      continue;
    }
    if (DOOR_TOKEN.test(t)) continue;

    if (isFirstWord) {
      familyTokens.push(t);
      continue;
    }

    const bodyStyle = BODY_WORDS[t];
    if (bodyStyle) {
      // "plus" is a sedan only in Chevrolet's naming; elsewhere it can be a
      // grade, and a body misread would split a real car in two.
      if (t !== "plus" || familyTokens[0] === "onix") body ||= bodyStyle;
      continue;
    }

    if (NOISE_WORDS.has(t) || TRIM_WORDS.has(t) || EDITION_WORDS.has(t)) continue;

    const drive = DRIVETRAIN[t];
    if (drive) {
      drivetrain = drive;
      continue;
    }

    const fuelName = FUEL_WORDS[t];
    if (fuelName) {
      fuel.add(fuelName);
      continue;
    }

    if (ASPIRATION_WORDS.has(t) || ENGINE_FAMILY_WORDS.has(t)) {
      aspiration.add(canonicalAspiration(t));
      continue;
    }

    if (inHead) {
      if (hasEditionWord && /^\d+$/.test(t)) continue;
      familyTokens.push(t);
    }
    // A bare number in the tail ("200", "250") is probably power with the
    // unit dropped. Keep it: separating is cheap, merging wrongly is not.
    else aspiration.add(t);
  }

  // Nothing left before the engine means the name started with the spec:
  // unparseable, so leave it alone.
  if (familyTokens.length === 0) return null;

  /*
   * A transmissão pode aparecer antes da cilindrada ("500 Cabrio Dualogic Flex
   * 1.4"), então ela é procurada no nome inteiro — não só na cauda, que a
   * classificava como manual e escondia automáticos.
   */
  const declaresManual = tokens.some((t) => t.startsWith("mec"));
  const declaresAuto = tokens.some(
    (t) =>
      t.startsWith("aut") || t === "tiptronic" || t === "tipt" || t === "dualogic"
  );
  const transmission: Transmission = declaresManual
    ? "manual"
    : declaresAuto
      ? "auto"
      : "manual";

  return {
    family: familyTokens.join(" "),
    line: familyTokens[0],
    displacement: tokens[engineAt],
    aspiration: [...aspiration].sort().join(" "),
    fuel: [...fuel].sort().join(" "),
    drivetrain,
    valve,
    power,
    body,
    transmission,
    tokens,
  };
}

/** The facts that decide whether two names are the same car. */
function baseKey(sig: CarSignature, ignoreTransmission = false): string {
  return [
    sig.family,
    sig.displacement,
    sig.aspiration,
    // 2wd and "not stated" are the same thing on a Brazilian listing.
    sig.drivetrain === "4wd" ? "4wd" : "2wd",
    // A declared body separates; an undeclared one forms its own bucket, since
    // it cannot be assigned to either side of a disagreement without guessing.
    sig.body,
    ignoreTransmission ? "" : sig.transmission,
  ].join("|");
}

/**
 * Is the body style a reason to say these are different cars?
 *
 * Only when both names state one and they differ. FIPE omits the body all the
 * time, and reading an omission as "not a sedan" would both fragment the list
 * and reject listings that never excluded anything.
 */
function bodiesConflict(a: string, b: string): boolean {
  return Boolean(a) && Boolean(b) && a !== b;
}

export interface SameCarOptions {
  /**
   * Treat an undeclared transmission as compatible with either one.
   *
   * Used when a listing states a model and version but no transmission: the
   * FIPE convention (no marker means manual) is a fact about FIPE names, not
   * about what the person meant, so demanding "manual" would hide automatics
   * the listing never excluded.
   */
  ignoreTransmission?: boolean;
}

/**
 * Are these two FIPE names the same car, ignoring trim?
 *
 * Family, displacement, aspiration, drivetrain and transmission must all agree.
 * Fuel, valve count and power only disqualify when *both* names state them and
 * disagree — FIPE routinely omits "Flex" from one trim of the same car, and an
 * omission is not a contradiction.
 *
 * This is narrower than the old "prefix/substring" rule for fully specified
 * names, so it cannot invent matches; for names that differ only by trim it is
 * exactly what makes the swap sensible.
 */
export function sameCar(a: string, b: string, options: SameCarOptions = {}): boolean {
  const sa = signatureOf(a);
  const sb = signatureOf(b);
  if (!sa || !sb) return false;
  if (baseKey(sa, options.ignoreTransmission) !== baseKey(sb, options.ignoreTransmission)) {
    return false;
  }
  const agree = (x: string, y: string) => !x || !y || x === y;
  return (
    agree(sa.fuel, sb.fuel) &&
    agree(sa.valve, sb.valve) &&
    agree(sa.power, sb.power) &&
    !bodiesConflict(sa.body, sb.body)
  );
}

/* ─── Grouping ─────────────────────────────────────────────────── */

export interface FipeModelLike {
  codigo: number | string;
  nome: string;
}

export interface SimplifiedModel {
  /** Stable key — the base signature plus any splitting fact. */
  key: string;
  /** What the user reads: family + engine, no trim. */
  label: string;
  /** FIPE general model — the first family word — used for navigation. */
  line: string;
  /** Family, un-prettified, used to group and to match. */
  family: string;
  /**
   * Manual/automatic, or null when the name could not be decomposed.
   *
   * Null is not "manual": for an unparsed name we know nothing, and inventing
   * a direction makes the matcher reject listings that were never excluded.
   */
  transmission: Transmission | null;
  /** FIPE codes collapsed into this option. */
  codes: string[];
  /** FIPE names collapsed into this option. */
  members: string[];
  /**
   * The code to use for year/price lookups.
   *
   * Each trim has its own year coverage, so this is a representative — the
   * first member, which is the base trim in FIPE's ordering.
   */
  code: string;
  /** Full FIPE name of the representative member — what gets stored. */
  fullName: string;
}

/** "12v" → "12V", "mpfi" → "MPFI", "4motion" → "4Motion", "1.0" stays. */
function prettyToken(token: string): string {
  if (/^\d+\.\d+$/.test(token)) return token;
  if (/^\d+[vV]$/.test(token)) return token.toUpperCase();
  if (/^\d+cv$/.test(token)) return token.toUpperCase();
  if (/^(tsi|gdi|mpfi|efi|mfi|tdi|tb|gnv|awd|2wd|4wd|thp|vhc)$/.test(token)) {
    return token.toUpperCase();
  }
  if (token === "4motion") return "4Motion";
  return token.charAt(0).toUpperCase() + token.slice(1);
}

const PRETTY: Record<string, string> = {
  flex: "Flex",
  gasolina: "Gasolina",
  alcool: "Álcool",
  diesel: "Diesel",
  gnv: "GNV",
  hibrido: "Híbrido",
  eletrico: "Elétrico",
  turbo: "Turbo",
  tsi: "TSI",
  tdi: "TDI",
  tb: "TB",
  fire: "Fire",
  evo: "Evo",
  v6: "V6",
  v8: "V8",
  v10: "V10",
  v12: "V12",
  biturbo: "Bi-Turbo",
  "bi-turbo": "Bi-Turbo",
};

const pretty = (t: string) => PRETTY[t] ?? prettyToken(t);

/**
 * "Tracker 1.8 Flex · Aut." — family, then the specs that change the car.
 * Valve count appears only when every member states it, so the label never
 * invents a fact.
 */
function labelFor(sig: CarSignature, valveUnanimous: boolean, powerNote = ""): string {
  const family = sig.family.split(" ").map(pretty).join(" ");
  const parts = [sig.displacement];
  if (sig.aspiration) parts.push(sig.aspiration.split(" ").map(pretty).join(" "));
  if (sig.fuel) parts.push(sig.fuel.split(" ").map(pretty).join(" "));
  // The body is a different car with a different price, so it belongs in the
  // name the user reads — and in the one the listing stores.
  if (sig.body && BODY_LABEL[sig.body]) parts.push(BODY_LABEL[sig.body]);
  if (sig.drivetrain === "4wd") parts.push("4x4");
  if (valveUnanimous && sig.valve) parts.push(sig.valve.toUpperCase());
  // Power only appears when it is the reason two otherwise identical options
  // exist — "Civic 1.7 16V 115CV" vs "…130CV". Everywhere else it is noise.
  if (powerNote) parts.push(powerNote.toUpperCase());
  const suffix = sig.transmission === "auto" ? "Aut." : "Mec.";
  return `${family} ${parts.join(" ")} · ${suffix}`.replace(/\s+/g, " ").trim();
}

interface Group {
  sig: CarSignature;
  members: FipeModelLike[];
}

/**
 * Merge what the members *collectively* state into one signature, so the label
 * never claims more than the group knows or less than it can prove.
 */
function mergeFacts(members: FipeModelLike[], base: CarSignature): CarSignature {
  const sigs = members
    .map((m) => signatureOf(m.nome))
    .filter((s): s is CarSignature => s !== null);
  if (sigs.length === 0) return base;

  const fuels = [...new Set(sigs.flatMap((s) => s.fuel.split(" ").filter(Boolean)))].sort();
  const valves = new Set(sigs.map((s) => s.valve));
  const bodies = new Set(sigs.map((s) => s.body).filter(Boolean));

  return {
    ...base,
    // A single declared value is a fact about the group; several never reach
    // here, because they would have been split apart.
    fuel: fuels.join(" "),
    drivetrain: sigs.some((s) => s.drivetrain === "4wd") ? "4wd" : base.drivetrain,
    // Only unanimous valve counts are shown — otherwise the label would pick a
    // side in a disagreement the group does not actually have.
    valve: valves.size === 1 ? [...valves][0] : "",
    // Same for the body: shown only when every member agrees on it.
    body: bodies.size === 1 ? [...bodies][0] : "",
  };
}

/**
 * Split a group when members disagree on a fact we do not merge over.
 *
 * Valve count and power are only sometimes stated; a member that omits one is
 * compatible with any value. When two members *do* disagree they cannot share
 * an option — that would show one engine and match another.
 */
function splitOnConflict(group: Group, fact: "valve" | "power" | "fuel"): Group[] {
  const declared = new Set(
    group.members.map((m) => signatureOf(m.nome)?.[fact] ?? "").filter(Boolean)
  );
  if (declared.size <= 1) return [group];

  const buckets = new Map<string, Group>();
  for (const member of group.members) {
    const sig = signatureOf(member.nome);
    if (!sig) continue;
    // An undeclared fact gets its own bucket: it cannot be assigned to either
    // side of a genuine disagreement without guessing.
    const bucketKey = sig[fact] || "?";
    const bucket = buckets.get(bucketKey);
    if (bucket) bucket.members.push(member);
    else
      buckets.set(bucketKey, {
        sig: { ...sig, [fact]: bucketKey === "?" ? "" : bucketKey },
        members: [member],
      });
  }
  return [...buckets.values()];
}

/**
 * Collapse a FIPE model list into one option per
 * (family, displacement, aspiration, fuel, drivetrain, transmission), splitting
 * further only where members state facts that contradict each other.
 */
export function simplifyModels(models: FipeModelLike[]): SimplifiedModel[] {
  const groups = new Map<string, Group>();
  const unparsed: SimplifiedModel[] = [];

  for (const model of models) {
    const sig = signatureOf(model.nome);
    if (!sig) {
      const name = model.nome.trim();
      // Lower-case the navigation key: the parsed path produces lower-case
      // tokens, so leaving "ASTRA …" capitalised would open a *second* Astra
      // line beside the real one.
      const firstWord = (name.split(" ")[0] ?? name).toLowerCase();
      unparsed.push({
        key: `raw:${model.codigo}`,
        label: name,
        family: firstWord,
        line: firstWord,
        transmission: null,
        codes: [String(model.codigo)],
        members: [name],
        code: String(model.codigo),
        fullName: name,
      });
      continue;
    }
    const key = baseKey(sig);
    const existing = groups.get(key);
    if (existing) existing.members.push(model);
    else groups.set(key, { sig, members: [model] });
  }

  const simplified: SimplifiedModel[] = [];
  for (const [key, group] of groups) {
    const afterValve = splitOnConflict(group, "valve");
    const afterPower = afterValve.flatMap((g) => splitOnConflict(g, "power"));
    const afterFuel = afterPower.flatMap((g) => splitOnConflict(g, "fuel"));

    for (const g of afterFuel) {
      const names = g.members.map((m) => m.nome.trim());
      const merged = mergeFacts(g.members, g.sig);
      // Power is only worth showing when the split is what created this option.
      const powerNote = afterPower.length > 1 && merged.power ? merged.power : "";
      simplified.push({
        // Key from the *final* facts: a group split by power or fuel would
        // otherwise reuse the base key and collide in React lists.
        key: `${key}|${merged.fuel}|${merged.valve}|${merged.power}`,
        label: labelFor(merged, Boolean(merged.valve), powerNote),
        family: merged.family,
        line: merged.line,
        transmission: merged.transmission,
        codes: g.members.map((m) => String(m.codigo)),
        members: names,
        code: String(g.members[0].codigo),
        fullName: names[0],
      });
    }
  }

  return [...simplified, ...unparsed].sort((a, b) =>
    a.label.localeCompare(b.label, "pt-BR")
  );
}

export interface LineGroup {
  /** Line as the user reads it — "Tracker", "Corolla". */
  name: string;
  /** Stable key for React and for URL round-trips. */
  key: string;
  /** Every simplified variant under this line, including sub-models. */
  versions: SimplifiedModel[];
}

/**
 * Turn the flat simplified list into the three-level shape the picker needs:
 * brand → line → version.
 *
 * The line is FIPE's own general model — the first word of the model name —
 * because that is how people talk about their car ("um Corolla"), and it is
 * the same convention the listing form already uses. Sub-models stay visible in
 * the version label ("Corolla Cross 2.0 Flex · Aut."), so "Corolla" opens a
 * short, searchable list instead of one flat 38-row wall.
 *
 * Lines are ordered by option count so the models people actually own surface
 * above one-offs, then alphabetically so the list is stable between requests.
 */
export function groupByLine(simplified: SimplifiedModel[]): LineGroup[] {
  const lines = new Map<string, LineGroup>();
  for (const option of simplified) {
    const existing = lines.get(option.line);
    if (existing) existing.versions.push(option);
    else
      lines.set(option.line, {
        name: option.line.split(" ").map(pretty).join(" "),
        key: option.line,
        versions: [option],
      });
  }
  return [...lines.values()].sort((a, b) => {
    const size = b.versions.length - a.versions.length;
    return size !== 0 ? size : a.name.localeCompare(b.name, "pt-BR");
  });
}

/**
 * How much did simplification save? Shown in the UI ("20 versões → 5") and used
 * by the tests.
 */
export function simplifyStats(models: FipeModelLike[]): {
  before: number;
  after: number;
  lines: number;
  reducedBy: number;
} {
  const simplified = simplifyModels(models);
  return {
    before: models.length,
    after: simplified.length,
    lines: groupByLine(simplified).length,
    reducedBy: models.length - simplified.length,
  };
}
