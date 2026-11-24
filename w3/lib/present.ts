/**
 * Presentation helpers shared by the card and the detail page.
 */

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * True when the listing title already spells out the car, which is the usual
 * case because the form pre-fills the title from the FIPE name.
 *
 * Without this, every card and detail page printed the model twice, directly
 * under itself — the most obvious visual defect in the v0 interface.
 */
export function titleAlreadyNamesCar(
  title: string,
  brand: string,
  model: string
): boolean {
  const t = normalize(title);
  const m = normalize(model);
  if (!m) return false;
  if (t.includes(m)) return true;

  // Titles often abbreviate to the model's first word ("Honda Fit" for
  // "Fit EX/S 1.5 Flex/Flexone 16V 5p Aut.").
  const firstWord = m.split(" ")[0];
  return firstWord.length >= 3 && t.includes(firstWord) && t.includes(normalize(brand));
}

/**
 * Short label for what the owner will accept, used in badges and cards.
 */
export function wantedShortLabel(vehicleType?: string, brand?: string, model?: string): string {
  if (vehicleType) return `${vehicleType} (qualquer)`;
  if (!brand) return "Qualquer carro";
  return model ? `${brand} ${model}` : brand;
}
