// Controle van de bedragen in de tool tegen peil/waarden.json, de kopie van de waarden uit Peil (het parameterregister van Communities Abroad).
// Draaien: node tests/peil.test.mjs (geen netwerk, geen afhankelijkheden).
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const lees = (...p) => fs.readFileSync(path.join(here, "..", ...p), "utf8");
const html = lees("index.html");
const WAARDEN = JSON.parse(lees("peil", "waarden.json"));
const UITLEG_URL = "https://infofrankrijk.com/ons-manifest-hoe-wij-werken/";
const perId = new Map(WAARDEN.parameters.map((p) => [p.id, p]));

// ---- Peil-blok uit de pagina laden
const blok = /\/\/ PEIL-BEGIN([\s\S]*?)\/\/ PEIL-EINDE/.exec(html);
const fouten = [];
const fout = (m) => fouten.push(m);
if (!blok) { console.log("FOUT Peil-blok (PEIL-BEGIN tot PEIL-EINDE) niet gevonden in index.html."); process.exit(1); }
function laad(code) {
  const ctx = { document: { getElementById: () => null }, console };
  vm.createContext(ctx);
  vm.runInContext(code + "\n;globalThis.__p={PEIL_STAND,PEIL_LABEL_AAN,PEIL_UITLEG_URL,peilStandNl,peilStandKort,peilRegelHtml,peilVoetHtml};", ctx);
  return ctx.__p;
}
const P = laad(blok[1]);

// ---- Vaste onderdelen
const nl = P.peilStandNl(), kort = P.peilStandKort();
if (P.PEIL_LABEL_AAN !== true) fout("PEIL_LABEL_AAN moet true zijn.");
if (P.PEIL_UITLEG_URL !== UITLEG_URL) fout("De link gaat niet naar het manifest.");
if (!/^\d{4}-\d{2}-\d{2}$/.test(P.PEIL_STAND)) fout("PEIL_STAND is geen datum als JJJJ-MM-DD.");
if (WAARDEN.stand !== P.PEIL_STAND) fout(`stand in peil/waarden.json is ${WAARDEN.stand}, maar PEIL_STAND is ${P.PEIL_STAND}.`);
if (P.PEIL_STAND === "2026-10-20" && (nl !== "20 oktober 2026" || kort !== "20 okt 2026")) fout(`Datumopmaak klopt niet: '${nl}' en '${kort}'.`);
const h = P.peilRegelHtml();
if (!h.includes(`href="${UITLEG_URL}"`) || !h.includes('target="_blank"') || !h.includes('rel="noopener"')) fout("Stempel linkt niet naar het manifest met target _blank en rel noopener.");
if (!h.includes(`aria-label="Bedragen gecontroleerd tegen Peil, stand ${nl}, lees hoe wij werken"`)) fout("Stempel mist de aria-label met volledige datum.");
if (!h.includes("Gecontroleerd tegen Peil</span>") || !h.includes(`stand ${kort}<span class="peil-pijl" aria-hidden="true">&#8599;</span></span>`)) fout("Stempel mist de twee korte regels met pijltje.");
if ((h.match(/<a /g) || []).length !== 1 || !h.includes("<svg") || !h.includes('stroke="#800000"')) fout("Stempel moet één link met inline svg in #800000 zijn.");
const v = P.peilVoetHtml();
if (!v.startsWith('<span class="peil-merk"') || !v.includes("<strong>Over de bedragen in deze tool.</strong> Alle wettelijke tarieven, bedragen en grenzen komen uit Peil, het register waarin wij deze gegevens bijhouden. Elk daarvan is gecontroleerd bij de officiële bron, de laatste controle was op " + nl + ". Waar de tool met een aanname of schatting rekent, staat dat bij de uitkomst. <a href=\"" + UITLEG_URL + "\" target=\"_blank\" rel=\"noopener\">Lees in ons manifest hoe wij werken</a>")) fout("Voettekstalinea wijkt af van het goedgekeurde ontwerp.");
{
  const uit = laad(blok[1].replace("const PEIL_LABEL_AAN = true;", "const PEIL_LABEL_AAN = false;"));
  if (uit.peilRegelHtml() !== "" || uit.peilVoetHtml() !== "") fout("Met de schakelaar uit moet het Peil-label verdwijnen.");
}
if (!/id="peilStempel"/.test(html) || !/id="peilVoet"/.test(html)) fout("Plaatsen voor stempel (#peilStempel) en voettekst (#peilVoet) ontbreken.");
if (html.indexOf('id="peilStempel"') < html.indexOf('id="advice-content"')) fout("De stempel moet direct na de uitkomst (advice-content) staan.");
if (/antonnoe\.github\.io\/peil-nl-fr/.test(html)) fout("De pagina verwijst naar de openbare Peil-site.");
if (/(19|20) oktober 2026/.test(html)) fout("Er staat een vaste peildatum in de pagina; de datum mag alleen uit PEIL_STAND komen.");

// ---- Bedragen en regels in de tekst
const eur = (n) => Number(n).toLocaleString("nl-NL");
const heeft = (s) => html.includes(s);
function controleer(id, wat, ok) { if (!ok) fout(`${id} (${perId.get(id)?.naam}): ${wat}`); }
const vereist = (id) => { const p = perId.get(id); if (!p) { fout(`${id}: staat niet in peil/waarden.json.`); return null; } return p.waarde; };
const familie = (() => { const a = html.indexOf('id="familie"'); const b = html.indexOf('id="erfgenaam"'); return html.slice(a, b); })();

{ const w = vereist("p.fr.succ.abattement_stiefkind");
  if (w !== null) {
    controleer("p.fr.succ.abattement_stiefkind", `tab Samengesteld noemt niet €${eur(w)} als aftrek voor een stiefkind`, familie.includes(`<strong>€${eur(w)}</strong> aftrek per erfdeel`));
    controleer("p.fr.succ.abattement_stiefkind", "er staat nog een verhoogde stiefkindaftrek (15.932 of 788 III bis) in de tool", !/15\.932/.test(html) && !/788 III bis/.test(html) && !/Nieuw sinds 2026/.test(familie));
    controleer("p.fr.succ.abattement_stiefkind", "stiefkind niet beschreven als niet-verwant met art. 788 IV", /geen eigen vrijstelling en telt als niet-verwant/.test(familie) && /788 IV/.test(familie)); } }
{ const w = vereist("p.fr.succ.tarief_stiefkind");
  if (w !== null) controleer("p.fr.succ.tarief_stiefkind", `tab Samengesteld noemt niet ${w * 100}%`, familie.includes(`vlak <strong>${w * 100}%</strong>`) && familie.includes(`<strong>${w * 100}% erfbelasting</strong>`)); }
{ const w = vereist("p.fr.succ.abattement_niet_verwanten");
  if (w) controleer("p.fr.succ.abattement_niet_verwanten", `scanner noemt niet €${eur(w.abattement_overlijden)} voor de partner zonder huwelijk of PACS`, heeft(`Vrijstelling is slechts €${eur(w.abattement_overlijden)}`)); }
{ const w = vereist("p.fr.succ.abattement_per_kind");
  if (w !== null) controleer("p.fr.succ.abattement_per_kind", `tab Samengesteld noemt niet aftrek €${eur(w)} bij adoption simple`, familie.includes(`aftrek €${eur(w)}`)); }
{ const w = vereist("p.fr.succ.adoption_simple");
  if (w !== null) controleer("p.fr.succ.adoption_simple", "art. 786 en de gevallen (eerder huwelijk, 5 jaar, 10 jaar) ontbreken", /art\. 786 CGI/.test(familie) && /uit een eerder huwelijk/.test(familie) && /minstens 5 jaar onafgebroken/.test(familie) && /10 jaar in totaal/.test(familie)); }

for (const p of WAARDEN.parameters) console.log(`ok   ${p.id}`);
if (fouten.length) { console.log(`\n${fouten.length} afwijking(en):`); fouten.forEach((m) => console.log(`FOUT ${m}`)); process.exit(1); }
console.log(`\nAlle ${WAARDEN.parameters.length} parameters komen overeen met peil/waarden.json (stand ${P.PEIL_STAND}).`);
