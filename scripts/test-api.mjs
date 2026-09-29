import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL || "http://localhost:5173";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))
  throw new Error("Integration tests run against local preview only.");
const sign = await fetch(base + "/signin-with-chatgpt?return_to=/", {
  redirect: "manual",
});
const cookie = sign.headers
  .getSetCookie()
  .map((x) => x.split(";")[0])
  .join("; ");
async function call(path, body) {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      Cookie: cookie,
      Origin: base,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let v;
  try {
    v = await r.json();
  } catch {
    v = null;
  }
  return { status: r.status, value: v };
}
const initial = await call("/api/backup");
assert.equal(initial.status, 200);
const original = initial.value;
const originalView = (await call("/api/data")).value.savedView;
await call("/api/settings", {
  autoOnOpen: false,
  provider: "openai-responses",
  model: "",
  endpoint: "https://api.openai.com/v1",
});
let rev = (await call("/api/data")).value.revision;
try {
  const [a, b] = await Promise.all([
    call("/api/spaces", {
      title: "QA space A",
      description: "Temporary local integration test",
      revision: rev,
    }),
    call("/api/spaces", {
      title: "QA space B",
      description: "Temporary local integration test",
      revision: rev,
    }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const created = (a.status === 200 ? a : b).value;
  rev = created.revision;
  const input = {
    spaceId: created.space.id,
    name: "QA metric",
    unit: "%",
    region: "QA",
    frequency: "M",
    sourceUrl: "https://example.com/source",
    definition: "Temporary test only",
    dateColumn: "date",
    valueColumn: "value",
    csv: "date,value\n2025-01,4\n2025-02,0.04\n2025-03,",
    filename: "QA.csv",
    revision: rev,
  };
  const preview = await call("/api/import", input);
  assert.equal(preview.status, 200);
  assert.equal(preview.value.count, 2);
  assert.equal(preview.value.missing, 1);
  const saved = await call("/api/import", { ...input, commit: true });
  assert.equal(saved.status, 200);
  rev = saved.value.revision;
  const duplicate = await call("/api/import", { ...input, commit: true });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.value.unchanged, true);
  assert.equal(duplicate.value.revision, rev);
  const before = (await call("/api/data")).value;
  const invalid = await call("/api/import", {
    ...input,
    csv: "date,value\n2025-01,1\n2025-01,2",
    revision: rev,
    commit: true,
  });
  assert.equal(invalid.status, 400);
  const after = (await call("/api/data")).value;
  assert.equal(after.revision, rev);
  assert.deepEqual(after.data, before.data);
  const exported = (await call("/api/backup")).value;
  assert.equal(exported.data.spaces.length, original.data.spaces.length + 1);
  const restore = await call("/api/backup", {
    backup: exported,
    confirm: "RESTORE",
    revision: rev,
  });
  assert.equal(restore.status, 200);
  rev = restore.value.revision;
  assert.deepEqual((await call("/api/data")).value.data, exported.data);
  const src = exported.data.indicators.find((i) => i.id === saved.value.id)
    .source[0];
  const source = await fetch(base + "/api/source?id=" + src, {
    headers: { Cookie: cookie },
  });
  assert.equal(source.status, 200);
  assert.equal(await source.text(), input.csv);
  const unauth = await fetch(base + "/api/data");
  assert.equal(unauth.status, 401);
  const csrf = await fetch(base + "/api/spaces", {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      Origin: "https://other.example",
    },
    body: JSON.stringify({ title: "bad", description: "", revision: rev }),
  });
  assert.equal(csrf.status, 403);
  const combo = {
    space: "sovereign-rates",
    ids: ["us.yield_10y", "us.m2_level"],
    start: "2000-01-01",
    end: "2026-08-01",
    frequency: "M",
    transform: "level",
    seriesOptions: { "us.m2_level": { transform: "index" } },
  };
  assert.equal((await call("/api/view", combo)).status, 200);
  assert.deepEqual((await call("/api/data")).value.savedView, combo);
  assert.equal(
    (await call("/api/view", { ...combo, ids: ["missing.metric"] })).status,
    400,
  );
  assert.equal(
    (
      await call("/api/view", {
        ...combo,
        start: "2026-12-01",
        end: "2000-01-01",
      })
    ).status,
    400,
  );
  const ai = await call("/api/analyze", {
    question: "test",
    view: {
      space: "sovereign-rates",
      ids: ["us.yield_10y"],
      start: "2020-01-01",
      end: "2026-08-01",
      frequency: "M",
      transform: "level",
    },
  });
  assert.equal(ai.status, 400);
  assert.match(ai.value.error, /尚未配置/);
  console.log(
    "PASS: concurrent CAS, import preview + idempotency, invalid import rollback, backup restore, original file retrieval, auth, CSRF, missing model credential.",
  );
} finally {
  const latest = (await call("/api/data")).value;
  const cleanup = await call("/api/backup", {
    backup: original,
    confirm: "RESTORE",
    revision: latest.revision,
  });
  assert.equal(cleanup.status, 200);
  const resetView = originalView || {
    space: "sovereign-rates",
    ids: ["us.yield_10y", "us.m2_level"],
    start: "2000-01-01",
    end: "2026-12-01",
    frequency: "M",
    transform: "level",
  };
  assert.equal((await call("/api/view", resetView)).status, 200);
  console.log("Local test data and view restored.");
}
