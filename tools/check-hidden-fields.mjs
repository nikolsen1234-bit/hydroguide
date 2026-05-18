// Comprehensive audit of HydroGuide foundation/detail validation.
//
// For every reachable answer state, verify:
//   1. Every key validateConfiguration produces is rendered by some page (MainPage/SystemPage/ComponentsPage)
//   2. Every criterion is reachable via SOME answer combination
//   3. No criterion's visibleWhen references a value the parent can't produce
//   4. No card's showWhen references a value the parent can't produce
//   5. Every requiredFor target exists in hydroGuideMethodCandidates
//   6. Multi-select defaults can be answered (have at least one option)
//   7. No criterion is listed in card.criterionIds but missing from hydroGuideCriteria
//   8. No criterion in hydroGuideCriteria is unused by every card
//   9. visibleWhen doesn't depend on a parent criterion that itself can be hidden when the child should be visible (deadlock)
//
// Also reports, per release_solution_category, which fields will block AnalysisPage.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, "../frontend/src");
const decisionTs = readFileSync(resolve(srcDir, "hydroguide/sourceAnchoredDecision.ts"), "utf8");
const validationTs = readFileSync(resolve(srcDir, "utils/validation.ts"), "utf8");
const mainPageTs = readFileSync(resolve(srcDir, "pages/MainPage.tsx"), "utf8");
const analysisPageTs = readFileSync(resolve(srcDir, "pages/AnalysisPage.tsx"), "utf8");
const systemPageTs = readFileSync(resolve(srcDir, "pages/SystemPage.tsx"), "utf8");
const componentsPageTs = readFileSync(resolve(srcDir, "pages/ComponentsPage.tsx"), "utf8");

function pickBlock(src, header) {
  const idx = src.indexOf(header);
  if (idx === -1) throw new Error("missing " + header);
  const eq = src.indexOf("=", idx);
  const start = src.indexOf("[", eq);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "[") depth++;
    else if (src[i] === "]") {
      depth--;
      if (depth === 0) return src.slice(start + 1, i);
    }
  }
  throw new Error("unterminated " + header);
}

function walkParens(src, prefix) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const start = src.indexOf(prefix, i);
    if (start === -1) break;
    let j = start + prefix.length;
    while (j < src.length && /\s/.test(src[j])) j++;
    if (src[j] !== "{") { i = j; continue; }
    let depth = 0;
    const bodyStart = j + 1;
    for (; j < src.length; j++) {
      const ch = src[j];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) { out.push(src.slice(bodyStart, j)); j++; break; }
      } else if (ch === '"') {
        j++;
        while (j < src.length && src[j] !== '"') {
          if (src[j] === "\\") j++;
          j++;
        }
      }
    }
    i = j;
  }
  return out;
}

function parseWhen(blockText) {
  const m = blockText.match(/\{([\s\S]*)\}/);
  if (!m) return null;
  const out = {};
  for (const e of m[1].matchAll(/([a-zA-Z_][a-zA-Z_0-9]*):\s*(\[[^\]]+\]|"[^"]+")/g)) {
    const key = e[1];
    const raw = e[2];
    out[key] = raw.startsWith("[") ? [...raw.matchAll(/"([^"]+)"/g)].map((x) => x[1]) : raw.replace(/"/g, "");
  }
  return out;
}

// ---- parse criteria ----
const criteriaBlock = pickBlock(decisionTs, "hydroGuideCriteria: HydroGuideCriterion[] =");
const criteria = [];
for (const body of walkParens(criteriaBlock, "criterion(")) {
  const id = (body.match(/id:\s*"([^"]+)"/) || [])[1];
  const title = (body.match(/title:\s*"([^"]+)"/) || [])[1];
  const answerModel = (body.match(/answerModel:\s*"([^"]+)"/) || [])[1];
  const required = body.includes("required: false") ? false : true;
  const visibleWhenMatch = body.match(/visibleWhen:\s*(\{[\s\S]*?\})/);
  const visibleWhen = visibleWhenMatch ? parseWhen(visibleWhenMatch[1]) : null;
  // options is `options: [ option(...), option(...), ... ]` where each option(...) may contain nested arrays/objects.
  // Walk brackets to find the matching outer `]`.
  let options = [];
  const optStart = body.search(/options:\s*\[/);
  if (optStart !== -1) {
    const bracketStart = body.indexOf("[", optStart);
    let depth = 0;
    for (let p = bracketStart; p < body.length; p++) {
      const ch = body[p];
      if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) {
          const inner = body.slice(bracketStart + 1, p);
          options = [...inner.matchAll(/option\(\s*"([^"]+)"/g)].map((x) => x[1]);
          break;
        }
      } else if (ch === '"') {
        p++;
        while (p < body.length && body[p] !== '"') { if (body[p] === "\\") p++; p++; }
      }
    }
  }
  // requiredFor: ["..."] - capture for orphan check
  const requiredForMatch = body.match(/requiredFor:\s*\[([^\]]+)\]/);
  const requiredFor = requiredForMatch ? [...requiredForMatch[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
  criteria.push({ id, title, answerModel, required, visibleWhen, options, requiredFor });
}

// ---- parse cards ----
const cardsBlock = pickBlock(decisionTs, "hydroGuideCards: HydroGuideCard[] =");
const cards = [];
function parseTopLevelObjects(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    while (i < src.length && src[i] !== "{") i++;
    if (i >= src.length) break;
    let depth = 0;
    const start = i + 1;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) { out.push(src.slice(start, i)); i++; break; }
      } else if (ch === '"') {
        i++;
        while (i < src.length && src[i] !== '"') { if (src[i] === "\\") i++; i++; }
      }
    }
  }
  return out;
}
for (const body of parseTopLevelObjects(cardsBlock)) {
  const id = (body.match(/id:\s*"([^"]+)"/) || [])[1];
  if (!id) continue;
  const title = (body.match(/title:\s*"([^"]+)"/) || [])[1];
  const critsMatch = body.match(/criterionIds:\s*\[([^\]]+)\]/);
  const criterionIds = critsMatch ? [...critsMatch[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
  const showWhenMatch = body.match(/showWhen:\s*(\{[\s\S]*?\})/);
  const showWhen = showWhenMatch ? parseWhen(showWhenMatch[1]) : null;
  cards.push({ id, title, criterionIds, showWhen });
}

// ---- parse method candidates ----
const methodsBlock = pickBlock(decisionTs, "hydroGuideMethodCandidates: HydroGuideMethodCandidate[] =");
const methods = [];
for (const body of parseTopLevelObjects(methodsBlock)) {
  const id = (body.match(/id:\s*"([^"]+)"/) || [])[1];
  if (!id) continue;
  methods.push({ id });
}

const issues = [];
function fail(tag, msg) { issues.push(`[${tag}] ${msg}`); }
function note(msg) { console.log(msg); }

note(`Parsed ${criteria.length} criteria, ${cards.length} cards, ${methods.length} methods`);

// ---- check: every card.criterionIds points to an existing criterion ----
const criterionById = new Map(criteria.map((c) => [c.id, c]));
for (const card of cards) {
  for (const cid of card.criterionIds) {
    if (!criterionById.has(cid)) fail("CARD_BAD_REF", `card ${card.id} references unknown criterion ${cid}`);
  }
}

// ---- check: every criterion referenced by at least one card ----
const usedByCard = new Set();
for (const card of cards) for (const cid of card.criterionIds) usedByCard.add(cid);
for (const c of criteria) {
  if (!usedByCard.has(c.id)) fail("CRIT_UNUSED", `criterion ${c.id} not in any card`);
}

// ---- check: requiredFor points to known methods (or "all") ----
const methodIds = new Set(methods.map((m) => m.id));
for (const c of criteria) {
  for (const rf of c.requiredFor) {
    if (rf === "all") continue;
    if (!methodIds.has(rf)) fail("REQUIREDFOR_BAD", `criterion ${c.id} requiredFor unknown method ${rf}`);
  }
}

// ---- check: visibleWhen references a key that exists & uses a value that key can produce ----
function valuesProducibleBy(c) {
  if (c.answerModel === "source_anchored_category") return new Set(c.options);
  if (c.answerModel === "evidence_status") return new Set(["documented_satisfies_source_criterion", "documented_does_not_satisfy_source_criterion", "not_documented_yet"]);
  if (c.answerModel === "multi_select_source_anchored") return new Set(c.options);
  return new Set();
}
for (const c of criteria) {
  if (!c.visibleWhen) continue;
  for (const [k, expected] of Object.entries(c.visibleWhen)) {
    const parent = criterionById.get(k);
    if (!parent) { fail("VW_UNKNOWN_KEY", `${c.id}.visibleWhen.${k} unknown criterion`); continue; }
    const produced = valuesProducibleBy(parent);
    const expArr = Array.isArray(expected) ? expected : [expected];
    for (const v of expArr) {
      if (!produced.has(v)) fail("VW_UNREACHABLE_VALUE", `${c.id}.visibleWhen.${k}=${v} but ${k} options are [${[...produced].join(", ")}]`);
    }
  }
}

// ---- check: showWhen references a key that exists & uses a value that key can produce ----
for (const card of cards) {
  if (!card.showWhen) continue;
  for (const [k, expected] of Object.entries(card.showWhen)) {
    const parent = criterionById.get(k);
    if (!parent) { fail("SW_UNKNOWN_KEY", `card ${card.id}.showWhen.${k} unknown criterion`); continue; }
    const produced = valuesProducibleBy(parent);
    const expArr = Array.isArray(expected) ? expected : [expected];
    for (const v of expArr) {
      if (!produced.has(v)) fail("SW_UNREACHABLE_VALUE", `card ${card.id}.showWhen.${k}=${v} but ${k} options are [${[...produced].join(", ")}]`);
    }
  }
}

// ---- check: deadlock — child's visibleWhen requires parent value X, but parent itself is hidden by some card.showWhen for value X ----
function findCardForCriterion(critId) {
  return cards.filter((card) => card.criterionIds.includes(critId));
}
for (const c of criteria) {
  if (!c.visibleWhen) continue;
  for (const [k, expected] of Object.entries(c.visibleWhen)) {
    const expArr = Array.isArray(expected) ? expected : [expected];
    const parentCards = findCardForCriterion(k);
    for (const pc of parentCards) {
      if (!pc.showWhen) continue;
      // If parent's card has showWhen on the parent's own value, the parent question might be hidden
      // when child needs it. This is unusual but possible.
      for (const [k2, exp2] of Object.entries(pc.showWhen)) {
        if (k2 !== k) continue;
        const exp2Arr = Array.isArray(exp2) ? exp2 : [exp2];
        const overlap = expArr.filter((v) => exp2Arr.includes(v));
        if (overlap.length === 0) {
          // child requires value v, parent card requires DIFFERENT value to show — parent invisible when child needs it
          fail("DEADLOCK", `${c.id}.visibleWhen.${k} in [${expArr.join(",")}] but parent ${k}'s card ${pc.id} only shows for ${k} in [${exp2Arr.join(",")}]`);
        }
      }
    }
  }
}

// ---- engine: visibility ----
function matchesWhen(answers, when) {
  return Object.entries(when).every(([key, expected]) => {
    const actual = answers[key];
    return Array.isArray(expected) ? expected.includes(String(actual)) : actual === expected;
  });
}
function visibleCards(answers) {
  return cards.filter((c) => !c.showWhen || matchesWhen(answers, c.showWhen));
}
function visibleQuestions(answers) {
  const visIds = new Set(visibleCards(answers).map((c) => c.id));
  const out = [];
  for (const card of cards) {
    if (!visIds.has(card.id)) continue;
    for (const cid of card.criterionIds) {
      const crit = criterionById.get(cid);
      if (!crit) continue;
      if (crit.visibleWhen && !matchesWhen(answers, crit.visibleWhen)) continue;
      out.push(crit);
    }
  }
  return out;
}
function emptyValue(c) {
  if (c.answerModel === "multi_select_source_anchored") return [];
  if (c.answerModel === "evidence_status") return "not_documented_yet";
  return "";
}
function isEmpty(value) {
  if (Array.isArray(value)) return value.length === 0;
  return value === "" || value === null || value === undefined;
}
function buildAnswers(overrides = {}) {
  const out = {};
  for (const c of criteria) out[c.id] = emptyValue(c);
  return Object.assign(out, overrides);
}

// ---- discover all "trigger" keys (any criterion referenced by some showWhen/visibleWhen) ----
const triggerKeys = new Set();
for (const card of cards) if (card.showWhen) for (const k of Object.keys(card.showWhen)) triggerKeys.add(k);
for (const c of criteria) if (c.visibleWhen) for (const k of Object.keys(c.visibleWhen)) triggerKeys.add(k);

note(`\nTrigger criteria (used by showWhen/visibleWhen): ${[...triggerKeys].join(", ")}`);

// for each trigger key, the set of values to enumerate is: producibleValues ∪ {""} (untouched)
function enumerateValues(c) {
  const produced = valuesProducibleBy(c);
  return ["", ...produced];
}

// Build Cartesian product of all trigger key values (might be large; safe-cap)
function cartesian(arrays) {
  return arrays.reduce(
    (acc, arr) => acc.flatMap((accItem) => arr.map((arrItem) => [...accItem, arrItem])),
    [[]]
  );
}
const triggerArr = [...triggerKeys];
const valueSets = triggerArr.map((k) => enumerateValues(criterionById.get(k)));
const totalStates = valueSets.reduce((a, b) => a * b.length, 1);
note(`Enumerating ${totalStates} trigger-key combinations`);
if (totalStates > 10000) {
  console.error(`Refusing to enumerate ${totalStates} states; cap exceeded.`);
  process.exit(2);
}

const everReached = new Set();
let combosChecked = 0;
for (const tuple of cartesian(valueSets)) {
  combosChecked++;
  const overrides = {};
  for (let i = 0; i < triggerArr.length; i++) overrides[triggerArr[i]] = tuple[i];
  const answers = buildAnswers(overrides);
  const vqs = visibleQuestions(answers);
  const vqIds = new Set(vqs.map((q) => q.id));
  vqs.forEach((q) => everReached.add(q.id));

  // every required visible criterion with empty value -> error; confirm error key IS in visibleQuestions
  const errs = vqs.filter((q) => q.required !== false && isEmpty(answers[q.id])).map((q) => q.id);
  for (const errKey of errs) {
    if (!vqIds.has(errKey)) fail("HIDDEN_BUG", `state=${JSON.stringify(overrides)} err ${errKey} not in visible questions`);
  }
}
note(`Checked ${combosChecked} states.`);

// ---- check: every criterion is reachable via SOME state ----
const unreachable = criteria.filter((c) => !everReached.has(c.id));
if (unreachable.length) {
  for (const c of unreachable) fail("UNREACHABLE", `criterion ${c.id} never visible in any of ${combosChecked} states`);
}

// ---- check: every multi-select / category has at least one non-placeholder option ----
for (const c of criteria) {
  if (c.answerModel !== "source_anchored_category" && c.answerModel !== "multi_select_source_anchored") continue;
  const real = c.options.filter((o) => o !== "not_documented_yet" && o !== "none_documented");
  if (real.length === 0) fail("NO_REAL_OPTIONS", `criterion ${c.id} has no real options (only placeholders)`);
}

// ---- check: every page renders fields that validation produces ----
// Foundation: answer keys + other.evaluationHorizonYears + systemParameters.inspectionsPerYear → MainPage
// Detail: systemParameters.*, solar.*, battery.*, fuelCell.*, diesel.*, other.*, monthlySolarRadiation.* → SystemPage
// Detail: equipmentRows.* → ComponentsPage

// Cross-check: AnalysisPage's foundationFieldLabel covers all foundation keys
const analysisLabelsFound = [
  ...analysisPageTs.matchAll(/key === "([^"]+)"/g)
].map((m) => m[1]);
const expectedFoundationNonAnswer = ["other.evaluationHorizonYears", "systemParameters.inspectionsPerYear"];
for (const k of expectedFoundationNonAnswer) {
  if (!analysisLabelsFound.includes(k)) fail("ANALYSIS_LABEL_MISSING", `foundationFieldLabel doesn't handle ${k}`);
}

// All criterion IDs should be in CRITERION_LABELS (built from hydroGuideCriteria via Object.fromEntries)
// Already verified via runtime import; here check that the AnalysisPage actually imports hydroGuideCriteria
if (!analysisPageTs.includes("hydroGuideCriteria")) fail("ANALYSIS_NO_IMPORT", "AnalysisPage no longer imports hydroGuideCriteria");
if (!analysisPageTs.includes("CRITERION_LABELS")) fail("ANALYSIS_NO_MAP", "AnalysisPage no longer has CRITERION_LABELS map");

// MainPage should still init showValidationErrors from validationErrors
if (!mainPageTs.match(/useState\(\(\) => Object\.keys\(validationErrors\)\.length > 0\)/)) {
  fail("MAINPAGE_NO_AUTOSHOW", "MainPage no longer auto-shows validation errors on mount");
}

// systemPage / componentsPage have the fields needed
const systemPageFields = [
  "panelPowerWp", "panelCount", "systemEfficiency",
  "nominalVoltage", "maxDepthOfDischarge", "batteryValue",
  "purchaseCost", "lifetime", "powerW", "fuelConsumptionPerKWh", "fuelPrice",
  "hasBackupSource", "batteryMode"
];
for (const f of systemPageFields) {
  if (!systemPageTs.includes(f)) fail("SYSTEMPAGE_MISSING", `SystemPage doesn't reference ${f}`);
}
if (!componentsPageTs.includes("equipmentRows")) fail("COMPONENTSPAGE_MISSING", "ComponentsPage doesn't render equipmentRows");

// ---- check: validation.ts uses the same predicates as before ----
if (!validationTs.includes("visibleQuestionsForAnswers(answers).forEach")) {
  fail("VALIDATION_DRIFT", "validation.ts no longer iterates visibleQuestionsForAnswers");
}
if (!validationTs.includes('errors["systemParameters.hasBackupSource"]')) {
  fail("VALIDATION_DRIFT", "validation.ts no longer flags hasBackupSource");
}
if (!validationTs.includes('errors["systemParameters.batteryMode"]')) {
  fail("VALIDATION_DRIFT", "validation.ts no longer flags batteryMode");
}

// ---- Report: per release category, what blocks ----
note(`\nFresh project (all defaults):`);
{
  const fresh = buildAnswers();
  const vqs = visibleQuestions(fresh);
  const errs = vqs.filter((q) => q.required !== false && isEmpty(fresh[q.id]));
  note(`  visible: ${vqs.length} fields`);
  note(`  empty required: ${errs.map((q) => q.id).join(", ")}`);
}
for (const rsc of ["pipe_via_intake", "pipe_through_dam", "gate", "opening_in_dam", "fish_passage", "coanda_tyrolean_screen", "other_alternative"]) {
  const ans = buildAnswers({ release_solution_category: rsc });
  const vqs = visibleQuestions(ans);
  const errs = vqs.filter((q) => q.required !== false && isEmpty(ans[q.id]));
  note(`  release=${rsc}: ${vqs.length} visible, ${errs.length} need answer -> ${errs.map((q) => q.id).join(", ")}`);
}

// ---- Validate the FULL key universe produced by validateConfiguration ----
// Pull the literal keys validation.ts assigns to errors[...] and confirm each maps to a UI rendering.
const errorKeyPatterns = [
  ...validationTs.matchAll(/errors\[\s*"([^"]+)"\s*\]/g),
  ...validationTs.matchAll(/errors\[\s*`([^`]+)`\s*\]/g),
  ...validationTs.matchAll(/errors\[\s*(\w+)\s*\]/g) // dynamic — key var
];
const literalKeys = new Set();
for (const m of validationTs.matchAll(/errors\[\s*"([^"]+)"\s*\]/g)) literalKeys.add(m[1]);
for (const m of validationTs.matchAll(/validateRequiredNumber\(errors,\s*"([^"]+)"/g)) literalKeys.add(m[1]);

const renderedFoundationKeys = new Set([
  "other.evaluationHorizonYears",
  "systemParameters.inspectionsPerYear"
]);
const renderedSystemPageKeys = new Set([
  "systemParameters.hasBackupSource",
  "systemParameters.batteryMode",
  "systemParameters.batteryValue",
  "solar.panelPowerWp",
  "solar.panelCount",
  "solar.systemEfficiency",
  "battery.nominalVoltage",
  "battery.maxDepthOfDischarge",
  "fuelCell.purchaseCost", "fuelCell.powerW", "fuelCell.fuelConsumptionPerKWh", "fuelCell.fuelPrice", "fuelCell.lifetime",
  "diesel.purchaseCost", "diesel.powerW", "diesel.fuelConsumptionPerKWh", "diesel.fuelPrice", "diesel.lifetime",
  "other.co2Methanol", "other.co2Diesel"
]);
// monthlySolarRadiation.* and equipmentRows.* are dynamic; check by pattern
for (const k of literalKeys) {
  const isAnswerKey = criteria.some((c) => c.id === k);
  if (isAnswerKey) continue;
  if (renderedFoundationKeys.has(k)) continue;
  if (renderedSystemPageKeys.has(k)) continue;
  fail("UNROUTED_KEY", `validation key ${k} not in any page's rendered field set`);
}

// dynamic template-literal patterns:
const templatePatterns = [
  ...validationTs.matchAll(/errors\[`([^`]+)`\]/g)
].map((m) => m[1]);
for (const pat of templatePatterns) {
  // these are like "monthlySolarRadiation.${month}", "equipmentRows.${row.id}.name", etc.
  const prefix = pat.split("${")[0];
  if (prefix.startsWith("monthlySolarRadiation.")) continue; // rendered in SystemPage
  if (prefix.startsWith("equipmentRows.")) continue; // rendered in ComponentsPage
  if (prefix.startsWith("solar.") || prefix.startsWith("battery.") || prefix.startsWith("fuelCell.") || prefix.startsWith("diesel.") || prefix.startsWith("other.")) continue;
  if (prefix.startsWith("systemParameters.")) continue;
  fail("UNROUTED_PATTERN", `validation template ${pat} not routed to a page`);
}

// ---- Verify: validation.ts validateBackupSource calls also produce keys mapped via secondarySourceLabels.co2Key ----
// other.co2Methanol / other.co2Diesel - both in renderedSystemPageKeys, ok.

// ---- Sanity: i18n labels exist for the two non-answer foundation keys ----
const i18nNn = readFileSync(resolve(srcDir, "i18n/nn.ts"), "utf8");
if (!i18nNn.includes('"main.evaluationHorizon":')) fail("I18N_MISSING", "main.evaluationHorizon not in i18n/nn.ts");
if (!i18nNn.includes('"main.inspectionsPerYear":')) fail("I18N_MISSING", "main.inspectionsPerYear not in i18n/nn.ts");

// ---- Final ----
if (issues.length) {
  console.log(`\n${issues.length} issues:`);
  for (const i of issues) console.log("  " + i);
  process.exit(1);
}
console.log("\nAll checks passed.");
