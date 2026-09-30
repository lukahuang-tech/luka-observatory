import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL || "http://localhost:5173";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))
  throw new Error("Local integration only.");
const sign = await fetch(base + "/signin-with-chatgpt?return_to=/smart-money", {
  redirect: "manual",
});
const cookie = sign.headers
  .getSetCookie()
  .map((x) => x.split(";")[0])
  .join("; ");
async function get(path) {
  const r = await fetch(base + path, { headers: { Cookie: cookie } });
  return { status: r.status, value: await r.json() };
}
async function post(data, revision, commit = false, origin = base) {
  const r = await fetch(base + "/api/smart-money", {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: origin,
      "Content-Type": "text/plain",
      "x-snapshot-revision": String(revision),
      "x-import-commit": String(commit),
    },
    body: typeof data === "string" ? data : JSON.stringify(data),
  });
  const text = await r.text();
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    value = { error: text };
  }
  return { status: r.status, value };
}
const original = (await get("/api/smart-money")).value;
assert.equal(original.data.fundOrder.length, 20);
assert.equal(original.owner, true);
const macro = (await get("/api/backup")).value;
assert.equal((await fetch(base + "/api/smart-money")).status, 401);
assert.equal(
  (await post(original.data, original.revision, false, "https://other.example"))
    .status,
  403,
);
assert.equal(
  (await post("<script>throw 1</script>", original.revision, true)).status,
  400,
);
assert.equal((await get("/api/smart-money")).value.revision, original.revision);
const preview = await post(original.data, original.revision);
assert.equal(preview.status, 200);
assert.equal(preview.value.summary.quarters, 79);
assert.equal((await get("/api/smart-money")).value.revision, original.revision);
const partial = {
  ...original.data,
  fundOrder: ["brk"],
  defaultKeys: ["brk"],
  funds: {
    brk: {
      ...original.data.funds.brk,
      quarters: [original.data.funds.brk.quarters[0]],
    },
  },
};
const results = await Promise.all([
  post(partial, original.revision, true),
  post(partial, original.revision, true),
]);
assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
const after = (await get("/api/smart-money")).value;
assert.deepEqual(after.data, original.data);
assert.equal(after.revision, original.revision + 1);
assert.deepEqual((await get("/api/backup")).value.data, macro.data);
assert.equal((await get("/api/backup")).value.revision, macro.revision);
const ai = await fetch(base + "/api/analyze", {
  method: "POST",
  headers: { Cookie: cookie, Origin: base, "Content-Type": "application/json" },
  body: JSON.stringify({
    domain: "smart-money",
    period: "2026-06-30",
    question: "test",
  }),
});
assert.equal(ai.status, 400);
assert.match((await ai.json()).error, /尚未配置/);
console.log(
  "Smart-money API passed: authenticated reads, CSRF, invalid import, preview no writes, concurrent CAS, history preserved, macro namespace isolated, honest AI state. Data unchanged.",
);
