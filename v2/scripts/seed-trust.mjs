/**
 * Adds a realistic spread of verifications and dossiers to the existing JSON
 * store, so the "Só anúncios verificados" filter has something to show on a
 * fresh checkout.
 *
 * Usage: node scripts/seed-trust.mjs
 *
 * Idempotent: only the trust fields are replaced. Posts, users, images,
 * conversations and matches are untouched. Re-running `npm run seed` wipes
 * this data, which is expected — the product works from zero, owners just
 * start at "novo".
 */
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.CARMATCH_DATA_DIR
  ? path.resolve(process.env.CARMATCH_DATA_DIR)
  : path.join(process.cwd(), "data");

function readJson(name) {
  const file = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function writeJson(name, rows) {
  const file = path.join(DATA_DIR, `${name}.json`);
  fs.writeFileSync(file, `${JSON.stringify(rows, null, 2)}\n`, "utf-8");
}

const USER_PROFILES = {
  "carlos@email.com": ["email", "phone", "cpf", "cnh", "selfie", "address"],
  "ana@email.com": ["email", "phone", "cpf", "cnh", "selfie"],
  "roberto@email.com": ["email", "phone", "cpf"],
  "juliana@email.com": ["email", "phone", "selfie", "address"],
  "fernando@email.com": ["email", "phone"],
  "mariana@email.com": ["email"],
};

const TOGGLE_ITEMS = [
  "ownership",
  "fines",
  "liens",
  "recall",
  "inspection",
  "singleOwner",
];

const SERVICE_TEMPLATES = [
  { date: "2026-08-14", km: 45000, description: "Troca de óleo e filtros" },
  { date: "2025-11-03", km: 38000, description: "Revisão dos 40.000 km" },
  { date: "2025-02-19", km: 30000, description: "Pastilhas de freio dianteiras" },
  { date: "2024-07-08", km: 22000, description: "Alinhamento e balanceamento" },
];

// One plan per post index (modulo). The spread is intentional: a fully
// verified car, partial dossiers, and an unverified listing with none.
const DOSSIER_PLANS = [
  { ownership: true, fines: true, liens: true, recall: true, inspection: true, singleOwner: true, entries: 3 },
  { ownership: true, fines: true, liens: true, inspection: true, entries: 2 },
  { ownership: true, fines: true, inspection: true, entries: 0 },
  { ownership: true, liens: true, entries: 2 },
  { fines: true, entries: 0 },
  { entries: 0 },
  { ownership: true, fines: true, liens: true, inspection: true, singleOwner: true, entries: 2 },
  { ownership: true, inspection: true, entries: 2 },
  { ownership: true, fines: true, entries: 0 },
];

function buildDossier(plan, postIndex) {
  const confirmedAt = new Date().toISOString();
  const dossier = {};
  const stamps = {};

  for (const key of TOGGLE_ITEMS) {
    if (plan[key]) {
      dossier[key] = true;
      stamps[key] = confirmedAt;
    }
  }

  if (plan.entries > 0) {
    dossier.serviceEntries = SERVICE_TEMPLATES.slice(0, plan.entries).map(
      (entry, i) => ({
        id: `svc-seed-${postIndex}-${i + 1}`,
        ...entry,
      })
    );
  }

  dossier.confirmedAt = stamps;
  return dossier;
}

const users = readJson("users");
let userUpdates = 0;
for (const user of users) {
  const signals = USER_PROFILES[user.email.toLowerCase()];
  if (!signals) continue; // don't touch real/test accounts

  const confirmedAt = new Date().toISOString();
  user.verifications = {
    ...Object.fromEntries(signals.map((key) => [key, true])),
    confirmedAt: Object.fromEntries(signals.map((key) => [key, confirmedAt])),
  };
  userUpdates += 1;
}
writeJson("users", users);

const posts = readJson("posts");
let postUpdates = 0;
posts.forEach((post, index) => {
  const plan = DOSSIER_PLANS[index % DOSSIER_PLANS.length];
  post.dossier = buildDossier(plan, index);
  postUpdates += 1;
});
writeJson("posts", posts);

console.log(`✅ Confiança semeada em ${userUpdates} usuários e ${postUpdates} anúncios.`);
console.log(
  "   Perfis: completo, quase completo, médio, parcial e sem dossiê — o filtro tem o que mostrar."
);
