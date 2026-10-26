// Controle van de uitkomsten van de Erfrecht Scanner (calculateResult) tegen de wet.
// Draaien: node tests/scanner.test.mjs (geen netwerk, geen afhankelijkheden).
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "..", "index.html"), "utf8");
const script = /<script>([\s\S]*)<\/script>/.exec(html)[1];
const els = {};
const el = (id) => (els[id] ||= { id, innerHTML: "", style: {}, scrollIntoView() {}, classList: { add() {}, remove() {} } });
const ctx = { document: { getElementById: el }, setTimeout() {}, console };
vm.createContext(ctx);
vm.runInContext(script, ctx);

function uitkomst(residence, relation, kids) {
  vm.runInContext(`state.residence=${JSON.stringify(residence)};state.relation=${JSON.stringify(relation)};state.kids=${JSON.stringify(kids)};calculateResult();`, ctx);
  return els["advice-content"].innerHTML.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}
const fouten = [];
const eis = (naam, ok) => { console.log(`${ok ? "ok  " : "FOUT"} ${naam}`); if (!ok) fouten.push(naam); };

// 1. PACS is geen gehuwde
for (const k of ["common", "step", "none"]) {
  const t = uitkomst("fr", "pacs", k);
  eis(`1. fr/pacs/${k}: PACS-partner geen erfgenaam, niet de tekst voor gehuwden`, /geen erfgenaam/.test(t) && /731-732/.test(t) && /796-0 bis/.test(t) && !/Gehuwd in Frankrijk/.test(t) && /uitsluiten/.test(t));
}
// 2. geen verdrag 1956
for (const r of ["married", "cohab", "pacs"]) { const t = uitkomst("nl", r, "none"); eis(`2. nl/${r}: geen verdrag 1956`, !/1956/.test(t)); }
eis("2. nl/married: geen erfbelastingverdrag, eenzijdige verrekening, 47-48 en 784 A", (() => { const t = uitkomst("nl", "married", "none"); return /bestaat niet/.test(t) && /eenzijdig/.test(t) && /47 en 48/.test(t) && /784 A/.test(t); })());
eis("2. index.html bevat nergens 1956", !/1956/.test(html));
// 3. woonrecht
{ const t = uitkomst("fr", "married", "step");
  eis("3. fr/married/step: niet 'uitgezet', wel woonrecht 763 en 764", !/uitgezet/.test(t) && /763/.test(t) && /764/.test(t) && /notarieel testament/.test(t) && /een jaar/.test(t) && /1\/4e/.test(t)); }
// 4. gehuwd zonder kinderen
{ const t = uitkomst("fr", "married", "none");
  eis("4. fr/married/none: helft, driekwart, alles, 757-3", /de helft/.test(t) && /driekwart/.test(t) && /alles/.test(t) && /757-1/.test(t) && /757-2/.test(t) && /757-3/.test(t) && !/blote eigenaar/.test(t)); }
// 5. rechtskeuze
eis("5. rechtskeuze: ook blijkend uit testament (art. 22 lid 2)", /blijkt uit de bepalingen/.test(html) && /art\. 22 lid 2/.test(html));
// 6. wereldvermogen
eis("6. Frankrijk heft over wereldvermogen bij Frans-resident erflater (750 ter 1°)", /wereldwijde vermogen \(art\. 750 ter 1°/.test(html) && !/Frankrijk heft belasting over wat in Frankrijk is, volgens/.test(html));
// 7. tontine
{ const t = uitkomst("nl", "cohab", "none");
  eis("7. tontine is geen oplossing, 754 A", /754 A/.test(t) && /helpt niet/.test(t) && !/Oplossing: Trouwen, Geregistreerd Partnerschap of aankoop via SCI met tontine/.test(t)); }
// 8. adoption simple
eis("8. adoption simple alleen onder voorwaarden art. 786", /alleen onder de voorwaarden van art\. 786/.test(html) && !/Adoptie simple — geeft toegang/.test(html) && /echtgenoot van de adoptant/.test(html));
// 9. kindvraag buiten fr/married
{ const a = uitkomst("fr", "cohab", "step"), b = uitkomst("fr", "cohab", "common"), c = uitkomst("fr", "cohab", "none");
  eis("9. fr/cohab: uitkomst verschilt per kindkeuze", a !== b && b !== c && a !== c && /stiefkind/.test(a) && /60%/.test(a));
  const d = uitkomst("fr", "pacs", "step"), e = uitkomst("fr", "pacs", "common");
  eis("9. fr/pacs: uitkomst verschilt per kindkeuze", d !== e && /stiefkind/.test(d));
  const f = uitkomst("nl", "cohab", "step"), g = uitkomst("nl", "cohab", "common");
  eis("9. nl/cohab: uitkomst verschilt per kindkeuze", f !== g && /750 ter 3°/.test(f)); }
// onveranderd: gehuwd met gezamenlijke kinderen
{ const t = uitkomst("fr", "married", "common"); eis("fr/married/common: keuze vruchtgebruik of kwart, woonrecht", /vruchtgebruik van alle goederen of een kwart in volle eigendom/.test(t) && /blote eigenaar/.test(t) && /763/.test(t)); }
// geen lange streepjes in nieuwe teksten
eis("geen lange liggende streepjes in de scannertekst", !/—/.test(script));

if (fouten.length) { console.log(`\n${fouten.length} fout(en)`); process.exit(1); }
console.log("\nAlle scannertests groen.");
