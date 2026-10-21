// One-off: pulls the data arrays out of the legacy compiled React bundle (no code is executed except literal data).
import ts from "typescript";
import vm from "node:vm";
import fs from "node:fs";

const src = fs.readFileSync(process.argv[2], "utf8");
const sf = ts.createSourceFile("bundle.js", src, ts.ScriptTarget.ES2022, true);
const want = { za: "sections", oc: "ratios", ip: "cheatSheet", ap: "decisionTree", op: "sectors", sp: "roadmap" };
const out = {};
(function walk(n) {
  if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && want[n.name.text] && n.initializer && !out[want[n.name.text]]) {
    const lit = ts.isArrayLiteralExpression(n.initializer) || ts.isObjectLiteralExpression(n.initializer) || ts.isNoSubstitutionTemplateLiteral(n.initializer) || ts.isStringLiteral(n.initializer);
    if (lit) out[want[n.name.text]] = vm.runInNewContext("(" + n.initializer.getText(sf) + ")", Object.create(null), { timeout: 2000 });
  }
  ts.forEachChild(n, walk);
})(sf);
for (const k of Object.values(want)) if (!(k in out)) console.error("MISSING", k);
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
console.log(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Array.isArray(v) ? `${v.length} items` : typeof v === "string" ? `${v.length} chars` : typeof v])));
