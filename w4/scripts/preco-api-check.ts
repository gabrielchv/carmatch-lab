/**
 * Preço API self-check (read-only).
 *
 * Imports the real route handlers and calls them with real `Request` objects
 * against the real JSON store, so the response status and body shape are the
 * ones the HTTP server would produce — without starting a server (which needs
 * write access to `.next`).
 *
 * Run with:  node_modules/.bin/jiti scripts/preco-api-check.ts
 */
import { readData } from "../lib/db";
import type { CarPost } from "../lib/types";
import { GET as precoGet } from "../app/api/preco/[postId]/route";
import { GET as postGet } from "../app/api/posts/[id]/route";

const BASE = "http://localhost:3604";

async function json(res: Response) {
  return { status: res.status, body: await res.json() };
}

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL ${name} ${detail}`);
  }
}

const posts = readData<CarPost>("posts");
console.log(`posts in store: ${posts.length}`);
if (posts.length === 0) {
  console.log("FAIL no posts in the store");
  process.exit(1);
}

const target = posts[0];
console.log(`target post: ${target.id} — ${target.title}`);

/* ── 1. The valuation endpoint ── */
const ok = await json(
  await precoGet(new Request(`${BASE}/api/preco/${target.id}`), {
    params: Promise.resolve({ postId: target.id }),
  })
);

console.log(`\nGET /api/preco/${target.id} → ${ok.status}`);
console.log(JSON.stringify(ok.body, null, 2));

check("status 200", ok.status === 200, String(ok.status));
check("has valuation.fairValue", typeof ok.body?.valuation?.fairValue === "number");
check("has a breakdown array", Array.isArray(ok.body?.valuation?.breakdown));
check(
  "breakdown sums to fairValue",
  ok.body.valuation.breakdown.reduce(
    (s: number, l: { impactBRL: number }) => s + l.impactBRL,
    0
  ) === ok.body.valuation.fairValue
);
check("has disclaimer", typeof ok.body?.disclaimer === "string");
check("postId echoes", ok.body?.postId === target.id);

/* ── 2. Extras param ── */
const withExtras = await json(
  await precoGet(
    new Request(
      `${BASE}/api/preco/${target.id}?extras=singleOwner,fullServiceHistory,recentlyServiced,newTyres,neverCrashed`
    ),
    { params: Promise.resolve({ postId: target.id }) }
  )
);
check(
  "extras change the fair value",
  withExtras.body.valuation.fairValue !== ok.body.valuation.fairValue,
  `${withExtras.body.valuation.fairValue} vs ${ok.body.valuation.fairValue}`
);

/* ── 3. against= comparison ── */
if (posts.length > 1) {
  const other = posts[1];
  const cmp = await json(
    await precoGet(
      new Request(`${BASE}/api/preco/${target.id}?against=${other.id}`),
      { params: Promise.resolve({ postId: target.id }) }
    )
  );
  console.log(`\nGET /api/preco/${target.id}?against=${other.id} → ${cmp.status}`);
  console.log(JSON.stringify(cmp.body.against, null, 2));
  check("against present", Boolean(cmp.body?.against));
  check(
    "fromFirstToSecond = B - A",
    cmp.body.against.fromFirstToSecond ===
      cmp.body.against.valuation.fairValue - cmp.body.valuation.fairValue
  );
}

/* ── 4. 404 for an unknown post ── */
const missing = await json(
  await precoGet(new Request(`${BASE}/api/preco/does-not-exist`), {
    params: Promise.resolve({ postId: "does-not-exist" }),
  })
);
check("404 for unknown post", missing.status === 404, String(missing.status));

/* ── 5. The listing endpoint the detail page uses ── */
const detail = await json(
  await postGet(new Request(`${BASE}/api/posts/${target.id}`), {
    params: Promise.resolve({ id: target.id }),
  })
);
check("GET /api/posts/[id] still 200", detail.status === 200, String(detail.status));
check("listing still returns post.car", Boolean(detail.body?.post?.car));

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
