/**
 * CarMatch Seed Script
 * Usage: npx tsx scripts/seed.ts
 *
 * Clears all data and populates the database with mock users and posts
 * for testing the matching algorithm.
 */

import fs from "node:fs";
import path from "node:path";
import { seedDatabase } from "../lib/seed-data";
import type { CarPost, Match } from "../lib/types";

async function main() {
  console.log("🌱 CarMatch Seed Script");
  console.log("========================");

  try {
    const result = await seedDatabase();

    console.log(`\n✅ Database seeded successfully!\n`);
    console.log(`   Users created:  ${result.users.length}`);
    console.log(`   Posts created:  ${result.posts.length}`);
    console.log(`   Matches found:  ${result.matchCount}`);

    if (result.matchCount > 0) {
      console.log(`\n📊 Match Summary:`);
      // Load matches to show details
      const matchesPath = path.join(process.cwd(), "data", "matches.json");
      const postsPath = path.join(process.cwd(), "data", "posts.json");

      if (fs.existsSync(matchesPath)) {
        const matches = JSON.parse(fs.readFileSync(matchesPath, "utf-8")) as Match[];
        const posts = JSON.parse(fs.readFileSync(postsPath, "utf-8")) as CarPost[];

        for (const match of matches) {
          const postA = posts.find((p) => p.id === match.postAId);
          const postB = posts.find((p) => p.id === match.postBId);
          if (postA && postB) {
            const cashDir =
              match.suggestedCashFromA > 0
                ? `${postA.title} pays R$ ${Math.abs(match.suggestedCashFromA).toLocaleString("pt-BR")}`
                : match.suggestedCashFromA < 0
                ? `${postB.title} pays R$ ${Math.abs(match.suggestedCashFromA).toLocaleString("pt-BR")}`
                : "No cash adjustment";

            console.log(
              `   • "${postA.title}" ↔ "${postB.title}"  [Score: ${match.score}/100]  ${cashDir}`
            );
          }
        }
      }
    }

    console.log(`\n🚀 Start the app with: npm run dev`);
    console.log(`🔧 Visit /debug for the testing dashboard\n`);
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  }
}

main();
