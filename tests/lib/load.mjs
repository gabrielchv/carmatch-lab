/**
 * Resolves the library under test.
 *
 * Every suite is version-parametrised so the same assertions can prove that a
 * shared behaviour is identical across versions — which is the thing most
 * likely to drift when ten forks exist.
 */

import path from "node:path";
import { LAB } from "../lib/harness.mjs";

export const VERSION = process.env.CARMATCH_TEST_VERSION ?? "w1";
export const LIB = path.join(LAB, VERSION, "lib");

export const load = (name) => import(path.join(LIB, `${name}.ts`));

/**
 * Load the compatibility helpers wherever a given version keeps them.
 *
 * v3 split them into lib/compat.ts so the chain engine could be client-safe;
 * the other forks keep them in lib/matching.ts. Tests should not care which.
 */
export async function loadMatching() {
  const tryLoad = async (name) => {
    try {
      return await import(path.join(LIB, `${name}.ts`));
    } catch {
      return null;
    }
  };

  const matching = await tryLoad("matching");
  if (matching?.vehicleMatchesCar) return matching;

  const compat = await tryLoad("compat");
  if (compat?.vehicleMatchesCar) return compat;

  throw new Error(`nenhum módulo de compatibilidade encontrado em ${LIB}`);
}
