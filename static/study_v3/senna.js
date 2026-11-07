"use strict";
// Senna chat UI v3. Same /v2 study API as /study. Free text is parsed in the browser only and never sent to the server or the LLM.
const $ = s => document.querySelector(s);
const thread = $("#thread"), composer = $("#composer");
const KEY = "senna-v3-session";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ICON = {
  send: '<svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
  bottle: '<svg viewBox="0 0 24 24"><path d="M9 3h6M10 3v4.2a6 6 0 1 0 4 0V3"/><path d="M8.2 14.5h7.6"/></svg>',
};
const FAM = {
  citrus: {c: "#e3b23c", ex: "ส้ม มะนาว เบอร์กามอต"}, aquatic: {c: "#5ea8c6", ex: "ลมทะเล เกลือ แตงกวา"},
  floral: {c: "#d98ba7", ex: "กุหลาบ มะลิ ดอกส้ม"}, woody: {c: "#8a6a4a", ex: "ซีดาร์ แซนดัลวูด เวติเวอร์"},
  green: {c: "#6e9b5a", ex: "ใบชา หญ้า มอส"}, gourmand: {c: "#c98f5e", ex: "วานิลลา คาราเมล ช็อกโกแลต"},
  amber: {c: "#b5652f", ex: "อำพัน กำยาน ยางไม้"}, spicy: {c: "#a8433a", ex: "พริกไทย อบเชย กระวาน"},
  musk: {c: "#a9a3c2", ex: "สบู่ แป้ง ผ้าสะอาด"},
};
const SILLAGE = [
  {b: "เบา", s: "ต้องเข้ามาใกล้ถึงได้กลิ่น"}, {b: "ปานกลาง", s: "คนที่อยู่ใกล้ได้กลิ่น"}, {b: "ชัด", s: "กลิ่นกระจายให้คนรอบข้างรับรู้"},
];
const RELEVANCE = [["relevance_first", "คำแนะนำชุดที่ 1 ตรงกับความต้องการของฉัน"], ["relevance_second", "คำแนะนำชุดที่ 2 ตรงกับความต้องการของฉัน"]];
const EXPERIENCE_Q = [["satisfaction", "ฉันพึงพอใจกับประสบการณ์ครั้งนี้"], ["clarity", "ฉันเข้าใจเหตุผลที่แนะนำน้ำหอมเหล่านี้"], ["usefulness", "คำแนะนำมีประโยชน์ต่อการเลือกน้ำหอมของฉัน"],
  ["intention", "ฉันมีแนวโน้มพิจารณาซื้อน้ำหอมที่แนะนำ"], ["use_again", "ฉันอยากกลับมาใช้ Senna อีก"], ["attention_answer", "สำหรับข้อนี้ กรุณาเลือกหมายเลข 2"]];

let config, creds = null, session = null, d = {}, shown = 0, busy = false, lastError = "", token = 0, notice = "";
const save = () => { try { sessionStorage.setItem(KEY + ":draft", JSON.stringify(d)); } catch {} };
const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY + ":draft") || "{}"); } catch { return {}; } };
const clearAll = () => { try { [KEY, KEY + ":draft"].forEach(k => sessionStorage.removeItem(k)); } catch {} creds = null; session = null; d = {}; shown = 0; };

async function api(path, opt = {}) {
  const headers = {"Content-Type": "application/json", ...(opt.headers || {})};
  if (creds && !headers.Authorization) headers.Authorization = `Bearer ${creds.secret}`;
  const r = await fetch(`/v2${path}`, {...opt, headers, cache: "no-store"});
  if (!r.ok) { let j = {}; try { j = await r.json(); } catch {} const e = new Error(typeof j.detail === "string" ? j.detail : "ส่งข้อมูลไม่สำเร็จ ลองอีกครั้งได้ค่ะ"); e.status = r.status; throw e; }
  return r.json();
}
async function run(fn) {
  if (busy) return; busy = true; lastError = ""; render();
  try { await fn(); } catch (e) { lastError = e.message || "เชื่อมต่อไม่สำเร็จ ลองอีกครั้งได้ค่ะ"; }
  busy = false; render();
}

// ---------- free-text understanding (browser only) ----------
const KW = {
  scenario: {A: ["งาน", "ทำงาน", "ออฟฟิศ", "เรียน", "ประชุม", "มหาลัย", "สัมภาษณ์", "work", "office", "school", "study", "studying", "class", "meeting", "interview"],
             B: ["พักผ่อน", "เที่ยว", "ชิล", "วันหยุด", "คาเฟ่", "เดินเล่น", "สบาย ๆ", "สบายๆ", "relax", "relaxing", "casual", "weekend", "holiday", "vacation", "cafe", "coffee", "walk", "walking", "chill", "chilling"],
             C: ["งานเลี้ยง", "ปาร์ตี้", "ดินเนอร์", "เดท", "เดต", "กลางคืน", "ออกงาน", "แต่งงาน", "อีเวนต์", "party", "parties", "partying", "dinner", "date", "wedding", "night out", "nightlife", "event", "gala"]},
  families: {citrus: ["ส้ม", "มะนาว", "ซิตรัส", "สดชื่น", "เปรี้ยว"], aquatic: ["ทะเล", "น้ำ", "มหาสมุทร"], floral: ["ดอกไม้", "กุหลาบ", "มะลิ", "ฟลอรัล"],
             woody: ["ไม้", "วู้ด", "วูดดี้", "ซีดาร์", "แซนดัล"], green: ["ใบไม้", "ชาเขียว", "ใบชา", "หญ้า", "ธรรมชาติ", "เขียว"], gourmand: ["หวาน", "วานิลลา", "ขนม", "คาราเมล", "ช็อกโกแลต"],
             amber: ["อำพัน", "เรซิน", "กำยาน"], spicy: ["เครื่องเทศ", "อบเชย", "พริกไทย", "สไปซี่"], musk: ["สะอาด", "มัสก์", "แป้ง", "สบู่", "ผ้า"]},
  gender: {women: ["ผู้หญิง", "สาว ๆ", "สาวๆ", "แนวหญิง", "women", "woman", "female", "for her", "feminine"], men: ["ผู้ชาย", "หนุ่ม", "แนวชาย", "men", "man", "male", "for him", "masculine"]},
  sillage: {0: ["เบา", "ไม่ฉุน", "ใกล้ตัว", "อ่อน ๆ", "อ่อนๆ"], 1: ["กลาง ๆ", "กลางๆ", "ปานกลาง"], 2: ["ชัด", "หอมไกล", "ฟุ้ง", "แรง", "เด่น"]},
};
function understand(text) {
  const t = text.toLowerCase().replace(/\s+/g, " "), out = {families: []};
  // Match English aliases as words, so "date" never matches "update".
  const hit = (list, src = t) => list.some(w => /^[a-z]/.test(w)
    ? new RegExp(`(^|[^a-z0-9_])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9_])`).test(src)
    : src.includes(w));
  for (const k of ["C", "B", "A"]) if (!out.scenario && hit(KW.scenario[k], k === "A" ? t.replace(/งานเลี้ยง|ออกงาน|งานแต่ง/g, "") : t)) out.scenario = k;
  const noPerfume = t.replace(/น้ำหอม/g, ""), noFlowerLeaf = noPerfume.replace(/ดอกไม้|ใบไม้|ไม้ดอก/g, "");
  out.not = [];
  const NEG = /ไม่(?:เอา|ชอบ|อยากได้|ต้องการ|ค่อยชอบ|ค่อยอยากได้)?\s*(?:กลิ่น)?\s*(?:แนว)?\s*(?:แบบ)?\s*$/;
  for (const [k, l] of Object.entries(KW.families)) {
    const src = k === "woody" ? noFlowerLeaf : k === "aquatic" ? noPerfume : t;
    let pos = false, neg = false;
    for (const w of l) for (let i = src.indexOf(w); i >= 0; i = src.indexOf(w, i + 1)) {
      if (NEG.test(src.slice(Math.max(0, i - 16), i))) neg = true; else pos = true;
    }
    if (pos && out.families.length < 2) out.families.push(k);
    else if (neg && !pos) out.not.push(k);
  }
  if (/ไม่(ฉุน|แรง|ชัด|ฟุ้ง)/.test(t)) out.sillage = 0;
  else for (const k of [0, 2, 1]) if (out.sillage === undefined && hit(KW.sillage[k])) out.sillage = k;
  const m = t.replace(/,/g, "").match(/(\d{3,6})/);
  if (m) { const n = Number(m[1]); out.budget = n < 1500 ? 0 : n <= 4000 ? 1 : 2; }
  if (/ยูนิเซ็กซ์|unisex|ได้ทุกเพศ|ไม่จำกัดเพศ/.test(t)) out.gender = "any";
  else { const w = hit(KW.gender.women), mn = hit(KW.gender.men); if (w !== mn) out.gender = w ? "women" : "men"; }
  return out;
}

// ---------- building blocks ----------
const senna = (html, opts = {}) => ({kind: "senna", html: `<div class="msg senna"><span class="mini" aria-hidden="true">${ICON.bottle}</span><div class="bubble">${html}</div></div>`, ...opts});
const user = (text, editField) => ({kind: "user", html: `<div class="msg user"><div class="bubble">${esc(text)}${editField && canEdit(editField) ? `<button class="edit" type="button" data-edit="${editField}" aria-label="แก้คำตอบ ${esc(text)}">แก้</button>` : ""}</div></div>`});
const widget = (html, cls = "") => ({kind: "widget", html: `<section class="widget ${cls}">${html}</section>`});
const raw = html => ({kind: "raw", html});
const perfumeLabel = i => (i.name.toLowerCase().startsWith(i.brand.toLowerCase()) ? i.name : `${i.brand} ${i.name}`) + (i.edition ? ` (${i.edition})` : "");
function exactPerfumeName(query, item) {
  const key = text => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
  const name = key(query);
  return !!name && (name === key(item.name) || name === key(perfumeLabel(item)));
}
const isCollector = () => d.q6 === config.experience[0];
const scenarioLabel = k => (config.scenarios[k] || "").replace(/^[ABC] /, "");
const famLabel = k => config.families[k];
function canEdit(f) {
  if (busy) return false;
  if (["scenario", "q6", "q5", "budget", "q24"].includes(f)) return session?.state === "intake";
  if (["fav", "families", "sillage", "gender"].includes(f)) return session?.state === "pre_ready" && !d.extras_done;
  return false;
}
function scale(name, question, value) {
  return `<fieldset class="item"><legend>${esc(question)}</legend><div class="scale" role="radiogroup">${[1, 2, 3, 4, 5].map(n =>
    `<label><input type="radio" name="${name}" value="${n}" ${Number(value) === n ? "checked" : ""} aria-label="${esc(question)} ${n}"><span>${n}</span></label>`).join("")}</div>${name === "attention_answer" ? "" : '<div class="ends"><span>1 ไม่เห็นด้วยอย่างยิ่ง</span><span>5 เห็นด้วยอย่างยิ่ง</span></div>'}</fieldset>`;
}
function checkin(id, tag, title, items, values, button) {
  return widget(`<form id="${id}"><span class="tag">${esc(tag)}</span><h3>${esc(title)}</h3>${items.map(([k, q]) => scale(k, q, values?.[k])).join("")}<div class="row-end"><button class="btn" type="submit">${esc(button)}</button></div></form>`, "checkin");
}
function ringsSVG(level) {
  const r = [16, 30, 44];
  return `<svg viewBox="0 0 120 96" aria-hidden="true">${r.map((rad, i) => `<circle class="ring ${i === level ? "on" : ""}" cx="60" cy="48" r="${rad}" ${i > level ? 'data-far="1"' : ""}/>`).join("")}<circle class="me" cx="60" cy="48" r="6"/><circle class="other" cx="${60 + [14, 26, 40][level]}" cy="${48 - [6, 12, 16][level]}" r="4"/></svg>`;
}
function familyPicker(selected, id = "fam-form") {
  return widget(`<form id="${id}"><h3>เลือกได้ 1–2 แนว</h3><p class="sub">แตะเพื่อเลือก แตะอีกครั้งเพื่อเอาออก</p><div class="families">${Object.entries(config.families).map(([k, v]) =>
    `<button type="button" class="fam c-${k}" data-fam="${k}" aria-pressed="${selected.includes(k)}"><span class="swatch"></span><b>${esc(v)}</b><small>${esc(FAM[k].ex)}</small></button>`).join("")}
    <button type="button" class="fam unsure" data-fam="unsure" aria-pressed="false"><b>ยังไม่แน่ใจ</b><small>ให้ Senna เริ่มจากแนวที่คนนิยมสำหรับโอกาสนี้</small></button></div>
    <div class="row-end"><button class="btn" type="submit" ${selected.length ? "" : "disabled"}>เลือกแนวนี้</button></div></form>`);
}
function sillagePicker(pre) {
  return widget(`<h3>กลิ่นไปถึงคนรอบตัวแค่ไหน</h3><p class="sub">จุดเข้มคือคุณ จุดจางคือคนรอบข้าง</p><div class="sillage">${SILLAGE.map((x, i) =>
    `<button type="button" class="sil" data-sil="${i}" aria-pressed="${pre === i}">${ringsSVG(i)}<span><b>${x.b}</b><small>${x.s}</small></span></button>`).join("")}</div>`);
}
function extrasForm() {
  const imgs = config.images.filter(v => !v.startsWith("ไม่ได้ต้องการ") && v !== "ยังไม่แน่ใจ");
  return widget(`<div class="extras"><h3>เล่าเพิ่มได้ ไม่บังคับ</h3>
    ${isCollector() ? "" : `<label class="lbl" for="fav-q">น้ำหอมที่ชอบอยู่แล้ว</label><div class="search"><input id="fav-q" type="search" autocomplete="off" placeholder="พิมพ์ชื่อแบรนด์หรือรุ่น" maxlength="100"><div class="results" id="fav-results" hidden></div></div>
    ${d.favorite ? `<span class="picked">${esc(d.favorite.label)}<button type="button" id="fav-clear" aria-label="เอาออก">×</button></span>` : ""}`}
    <span class="lbl">อยากให้คนอื่นมองว่า</span><div class="opt">${imgs.map(v => `<button type="button" class="toggle" data-img="${esc(v)}" aria-pressed="${d.image === v}">${esc(v)}</button>`).join("")}</div>
    <span class="lbl">สไตล์การแต่งตัว (ไม่เกิน 2)</span><div class="opt">${config.styles.map(v => `<button type="button" class="toggle" data-style="${v}" aria-pressed="${(d.styles || []).includes(v)}">${v}</button>`).join("")}</div>
    <label class="lbl" for="outfit">วันนั้นจะแต่งตัวแบบไหน</label><textarea id="outfit" rows="2" maxlength="300" placeholder="เช่น เสื้อเชิ้ตขาว กางเกงสแล็กส์">${esc(d.outfit || "")}</textarea>
    <div class="row-end"><button class="btn" type="button" id="extras-go">ใช้ข้อมูลนี้ แล้วดูตัวเลือก</button></div></div>`);
}
function compareSets(sets) {
  const [a, b] = sets.map(s => s.items.map(it => it.id));
  const shared = [...new Set(a.filter(id => b.includes(id)))];
  return {shared_item_ids: shared, overlap_count: shared.length,
    identical_items: shared.length === a.length && shared.length === b.length,
    identical_order: a.length === b.length && a.every((id, i) => id === b[i])};
}
function comparisonText(comparison, total) {
  if (!comparison.overlap_count) return "นี่คือชุดที่ 2 ค่ะ";
  if (comparison.identical_order) return `ทั้งสองชุดมีน้ำหอมและลำดับตรงกันทั้ง ${total} รุ่นค่ะ`;
  if (comparison.identical_items) return `ทั้งสองชุดมีน้ำหอมเหมือนกันทั้ง ${total} รุ่น แต่ลำดับต่างกันค่ะ`;
  return `นี่คือชุดที่ 2 ค่ะ มีรุ่นที่อยู่ทั้งสองชุด ${comparison.overlap_count} จาก ${total} รุ่น`;
}
function shelf(set, title, shared = []) {
  return raw(`<div class="shelf-wrap"><div class="shelf-title"><b>${esc(title)}</b><span>เลื่อนดูได้ ${set.items.length} ขวด</span></div><div class="shelf">${set.items.map(it => bottle(it, shared)).join("")}</div></div>`);
}
function famKeyByThai(label) { return Object.keys(config.families).find(x => config.families[x] === label) || "none"; }
function bottle(it, shared = []) {
  const c = famKeyByThai(it.family);
  const owned = it.owned_use === true;
  const reasons = (it.explanation_reason_ids || [0, 1, 2]).map(i => it.reasons[i]).filter(Boolean);
  return `<article class="bottle c-${c}"><div class="pic">${it.image_url ? `<img src="${esc(it.image_url)}" alt="${esc(it.brand + " " + it.name)}" referrerpolicy="no-referrer" loading="lazy">` : '<span class="ph"></span>'}</div>
    <div class="body"><span class="brand">${esc(it.brand)}</span><h4>${esc(it.name)}</h4>
    <div class="facts">${shared.includes(it.id) ? '<span class="fact shared">อยู่ทั้งสองชุด</span>' : ""}<span class="fact dot">${esc(it.family)}</span>${it.gender ? `<span class="fact">${esc(it.gender)}</span>` : ""}<span class="fact">${esc(it.sillage)}${it.sillage_estimated ? " (ประมาณ)" : ""}</span>${owned ? "" : `<span class="fact ${it.over_budget ? "warn" : ""}">${esc(it.price)}</span>`}</div>
    ${it.family_match_label ? `<p class="family-match ${it.family_match_complete === false ? 'partial' : ''}">${esc(it.family_match_label)}</p>` : ""}
    <div class="why">${owned ? `<p>${esc(it.assessment)}</p>` : "ที่เลือกขวดนี้เพราะ"}<ul>${reasons.map(r => `<li>${esc(r)}</li>`).join("")}</ul></div>
    ${owned ? (it.cautions || []).map(text => `<p class="owned-caution">${esc(text)}</p>`).join("") : `<button type="button" class="more" aria-expanded="false">ราคาและที่วางขาย</button><div class="more-text" hidden><p>${esc(it.availability || "ยังไม่มีข้อมูลการวางขาย")}</p><p>${esc(it.price_evidence || "ยังไม่มีหลักฐานราคา")}</p><p>ราคาและสินค้าอาจเปลี่ยนแปลง ควรตรวจกับร้านอีกครั้ง</p></div>`}</div></article>`;
}

// ---------- the conversation as a function of state ----------
const GENDER = {women: "กลิ่นแนวผู้หญิง", men: "กลิ่นแนวผู้ชาย", any: "ไม่จำกัด (รวมยูนิเซ็กซ์)"};
function stage() {
  if (d.intent === "owned") return "owned-" + (d.ownedChat?.stage || "scenario");
  if (!session && !d.intent) return "purpose";
  if (!session) return "consent";
  if (session.state === "complete") return "done";
  if (!d.scenario) return "scenario";
  if (!d.q6) return "q6";
  if (!d.q5) return "q5";
  if (!d.budget) return "budget";
  if (!d.q24) return "q24";
  if (session.state === "intake") return "pre";
  if (session.state === "pre_ready" && isCollector() && !d.fav_done) return "fav";
  if (session.state === "pre_ready" && !d.fam_done) return "families";
  if (session.state === "pre_ready" && !d.sil_done) return "sillage";
  if (session.state === "pre_ready" && !d.gen_done) return "gender";
  if (session.state === "pre_ready" || session.state === "generating") return d.extras_done ? "generating" : "extras";
  if (!d.seen2) return "set1";
  if (!d.rel_done) return "relevance";
  if (!d.post_done) return "post";
  return "experience";
}
function build() {
  if (d.intent === "owned") return buildOwnedChat();
  const B = [], st = stage(), C = {chips: [], say: null};
  if (notice && !session) B.push(raw(`<p class="note" role="status">${esc(notice)}</p>`));
  B.push(senna(`<p>สวัสดีค่ะ ฉันชื่อ Senna จะช่วยเลือกน้ำหอมให้เข้ากับโอกาสที่คุณจะใช้</p>${st === "purpose" ? "" : "<p>คุยกันประมาณ 10–15 นาทีค่ะ</p>"}`));
  if (st === "purpose") {
    B.push(senna("วันนี้อยากหาน้ำหอมขวดใหม่ หรือให้ช่วยเลือกใช้จากขวดที่มีอยู่แล้วคะ"));
    C.chips = [{label: "หาน้ำหอมขวดใหม่", act: () => { d.intent = "discover"; save(); render(); }},
      {label: "เลือกใช้ขวดที่มี", act: enterOwnedChat}];
    return {B, C};
  }
  if (st === "consent") {
    B.push(senna(`ก่อนเริ่ม ขออนุญาตเรื่องข้อมูลสั้น ๆ นะคะ`));
    B.push(widget(`<form id="consent-form" class="consent"><h3>การเข้าร่วม ScentSelf</h3><ul>
      <li>ศึกษาประสบการณ์ใช้ระบบแนะนำน้ำหอมและความมั่นใจในการเลือกซื้อ ใช้เวลาประมาณ 10–15 นาที ไม่จำเป็นต้องซื้อสินค้า</li>
      <li>เก็บคำตอบ ความต้องการ เวลาที่ใช้ และคำแนะนำด้วยรหัสผู้เข้าร่วม ไม่ขอชื่อหรือเบอร์โทร กรุณาไม่พิมพ์ข้อมูลที่ระบุตัวตนในช่องคำตอบ</li>
      <li>AI ช่วยเลือกและเรียงเหตุผลที่ระบบเตรียมไว้ ไม่แต่งข้อมูลน้ำหอมขึ้นใหม่ และได้รับเฉพาะเหตุผลจากฐานข้อมูล ไม่ได้รับคำตอบที่คุณพิมพ์ หากบริการขัดข้องในรอบ pilot จะใช้เหตุผลจากระบบแทน</li>
      <li>เข้าร่วมโดยสมัครใจ หยุดได้โดยไม่มีผลเสีย และถอนตัวเพื่อลบคำตอบในระบบได้จากเมนูมุมขวาบนของเบราว์เซอร์นี้ หากเปลี่ยนอุปกรณ์หรือปิดแท็บแล้ว กรุณาติดต่อผู้วิจัยพร้อมรหัสผู้เข้าร่วม</li>
      ${config.retention_until ? `<li>เก็บข้อมูลถึงวันที่ ${esc(config.retention_until)} แล้วผู้วิจัยจะลบข้อมูลจากระบบและสำเนาที่ควบคุม การลบจากสำรองของผู้ให้บริการเป็นไปตามรอบของผู้ให้บริการ</li>` : ""}
      <li>${config.contact ? `ติดต่อผู้วิจัย: ${esc(config.contact)}` : "ติดต่อผู้วิจัยผ่านช่องทางเดียวกับที่ได้รับลิงก์เชิญ"}</li>
      <li>ผู้ให้บริการเว็บไซต์อาจเก็บบันทึกการเชื่อมต่อเพื่อดูแลความปลอดภัย และการโหลดรูปน้ำหอมอาจเชื่อมต่อผู้ให้บริการภาพภายนอก</li>
      ${config.mode === "pilot" ? "<li>รอบนี้เป็นรอบทดลองระบบ ไม่นับรวมผลวิจัยหลัก</li>" : ""}</ul>
      <label class="check"><input type="checkbox" name="eligible" required><span>ฉันอายุ 18–50 ปี สัญชาติไทย และสนใจน้ำหอม</span></label><label class="check"><input type="checkbox" name="consent" required><span>ฉันอ่านแล้วและยินยอมเข้าร่วม</span></label>
      <div class="row-end"><button class="btn" type="submit">เริ่มคุยกับ Senna</button></div></form>`));
    return {B, C};
  }
  B.push(user("ยินยอมและเริ่มคุย"));
  B.push(senna(`วันนี้อยากได้น้ำหอมไว้ใช้ตอนไหนคะ เล่าสั้น ๆ ก็ได้ หรือแตะตัวเลือกด้านล่าง`));
  if (st === "scenario") {
    C.chips = Object.keys(config.scenarios).map(k => ({label: scenarioLabel(k), act: () => answer("scenario", k)}));
    C.say = {ph: "เช่น ไปดินเนอร์วันศุกร์ อยากได้กลิ่นหวาน ๆ ไม่ฉุน", act: tellScenario}; return {B, C};
  }
  B.push(user(d.said || scenarioLabel(d.scenario), "scenario"));
  const heard = d.hint && (d.hint.families?.length || d.hint.not?.length || d.hint.sillage !== undefined || d.hint.budget !== undefined || d.hint.gender);
  B.push(senna(`${d.said ? `<p>เข้าใจว่าเป็น${esc(scenarioLabel(d.scenario))}นะคะ</p>` : ""}${heard ? `<p>จดไว้แล้วว่า${[d.hint.families?.length ? "ชอบ" + d.hint.families.map(famLabel).join(" และ ") : "", d.hint.not?.length ? "ไม่เอา" + d.hint.not.map(famLabel).join(" และ ") : "", d.hint.sillage !== undefined ? "อยากได้กลิ่น" + SILLAGE[d.hint.sillage].b : "", d.hint.gender ? "ขอ" + GENDER[d.hint.gender] : ""].filter(Boolean).join(" ")} เดี๋ยวถามยืนยันอีกทีค่ะ</p>` : ""}<p>ขอรู้จักกันอีกนิดนะคะ คุ้นเคยกับน้ำหอมแค่ไหนคะ</p>`));
  if (st === "q6") { C.chips = config.experience.map(v => ({label: v, act: () => answer("q6", v)})); return {B, C}; }
  B.push(user(d.q6, "q6"));
  B.push(senna(`ปกติใช้น้ำหอมบ่อยแค่ไหนคะ`));
  if (st === "q5") { C.chips = config.usage.map(v => ({label: v, act: () => answer("q5", v)})); return {B, C}; }
  B.push(user(d.q5, "q5"));
  B.push(senna(d.hint?.budget !== undefined ? `งบต่อขวดประมาณ${esc(config.budget[d.hint.budget])}ใช่ไหมคะ` : `งบต่อขวดประมาณเท่าไหร่คะ`));
  if (st === "budget") { C.chips = config.budget.map(v => ({label: v, act: () => answer("budget", v)})); return {B, C}; }
  B.push(user(d.budget, "budget"));
  B.push(senna(`<p>เวลาเลือกน้ำหอม เคยเจอปัญหาไหนบ้างคะ</p><p class="sub">เลือกได้หลายข้อ</p>`));
  if (st === "q24") {
    const none = config.problems[config.problems.length - 1];
    B.push(widget(`<form id="q24-form" class="q24">${config.problems.map((p, i) => `<label class="check"><input type="checkbox" name="q24" value="${i}" ${(d.q24_sel || []).includes(p) ? "checked" : ""}><span>${esc(p === none ? "ไม่เคยเจอปัญหาเลย" : p)}</span></label>`).join("")}<div class="row-end"><button class="btn" type="submit">ถัดไป</button></div></form>`));
    return {B, C};
  }
  B.push(user(d.q24.length === 1 && d.q24[0] === config.problems[config.problems.length - 1] ? "ไม่เคยเจอปัญหาเลย" : `เจอ ${d.q24.length} ข้อ: ${d.q24.join(" · ")}`, "q24"));
  B.push(senna(`<p>ก่อนไปดูกลิ่นกัน ขอเช็กความรู้สึกตอนนี้ 3 ข้อค่ะ</p><p>นึกถึงตอนเลือกน้ำหอมไปใช้${esc(scenarioLabel(d.scenario))} ตอบตามจริงได้เลย ไม่มีถูกผิด</p>`));
  if (st === "pre") { B.push(checkin("pre-form", "เช็กความรู้สึก ก่อนคุยเรื่องกลิ่น", "ตอนนี้คุณรู้สึกอย่างไร", config.confidence.map((q, i) => [`pre${i + 1}`, q]), d.pre, "ส่งคำตอบ")); return {B, C}; }
  B.push(user("ตอบเช็กความรู้สึกแล้ว"));
  if (isCollector()) {
    B.push(senna(`<p>ขอบคุณค่ะ มีน้ำหอมที่ชอบกลิ่นอยู่แล้ว ตัวไหนคะ</p><p>จะใช้เป็นตัวอ้างอิงเพื่อหาขวดใหม่ที่กลิ่นใกล้เคียงค่ะ</p>`));
    if (st === "fav") {
      if (d.fav_q) {
        B.push(user(d.fav_q));
        if (d.fav_results?.length) {
          B.push(senna(d.fav_results.length === 1 ? "ใช่ตัวนี้ไหมคะ" : "เจอรุ่นเหล่านี้ในรายการค่ะ ตัวไหนคะ"));
          B.push(widget(`<div class="fav-pick">${d.fav_results.map(r => `<button type="button" class="toggle" data-favpick="${r.id}">${esc(perfumeLabel(r))}</button>`).join("")}</div>`));
          C.chips = [{label: "ไม่มีรุ่นที่ใช้ในนี้", act: () => favDone(null, "ไม่มีรุ่นที่ใช้ในนี้"), soft: true}];
        } else {
          B.push(senna(`ยังหาไม่เจอในรายการค่ะ ลองพิมพ์ชื่อภาษาอังกฤษ หรือแค่ชื่อแบรนด์ก็ได้`));
          C.chips = [{label: "ข้ามไปก่อน", act: () => favDone(null, "ข้ามไปก่อน"), soft: true}];
        }
      } else C.chips = [{label: "ข้ามไปก่อน", act: () => favDone(null, "ข้ามไปก่อน"), soft: true}];
      C.say = {ph: "เช่น Chanel Chance หรือแค่ Chanel ก็ได้", act: findFavorite, hint: "ใช้ค้นชื่อน้ำหอมในรายการเท่านั้น"};
      return {B, C};
    }
    B.push(user(d.favorite ? d.favorite.label : (d.fav_skip || "ข้ามไปก่อน"), "fav"));
    B.push(senna(`${d.favorite ? `<p>จดไว้แล้วค่ะ จะหากลิ่นที่ใกล้เคียงกับ ${esc(d.favorite.label)} ให้ด้วย</p>` : d.fav_q ? "<p>ไม่เป็นไรค่ะ ตัวนั้นยังไม่มีในรายการของ Senna</p>" : ""}<p>แล้วรอบนี้อยากได้กลิ่นแนวไหนคะ${d.hint?.families?.length ? " ที่เล่ามาเลือกไว้ให้แล้ว แก้ได้นะคะ" : ""}</p>`));
  } else B.push(senna(`<p>ขอบคุณค่ะ มาเรื่องกลิ่นกันนะคะ</p><p>ชอบกลิ่นแนวไหน${d.hint?.families?.length ? " ที่เล่ามาเลือกไว้ให้แล้ว แก้ได้นะคะ" : ""}</p>`));
  if (st === "families") {
    if (!d.fam_sel) { d.fam_sel = [...(d.hint?.families || [])]; }
    B.push(familyPicker(d.fam_sel));
    C.say = {ph: "หรือพิมพ์ เช่น หวาน ๆ แบบดอกไม้", act: tellFamilies}; return {B, C};
  }
  B.push(user(d.families.length ? d.families.map(famLabel).join(" และ ") : "ยังไม่แน่ใจ", "families"));
  B.push(senna(`${d.families.length ? "" : "<p>ไม่เป็นไรค่ะ เดี๋ยวเริ่มจากแนวที่คนนิยมสำหรับโอกาสนี้ให้ก่อน</p>"}<p>อยากให้กลิ่นไปถึงคนรอบตัวแค่ไหนคะ${d.hint?.sillage !== undefined ? ` ที่เล่ามาน่าจะเป็นแบบ${SILLAGE[d.hint.sillage].b}` : ""}</p>`));
  if (st === "sillage") { B.push(sillagePicker(d.hint?.sillage)); C.chips = [{label: "ยังไม่แน่ใจ", act: () => answer("sillage", null), soft: true}]; return {B, C}; }
  B.push(user(d.sillage === null ? "ยังไม่แน่ใจ" : `${SILLAGE[d.sillage].b}: ${SILLAGE[d.sillage].s}`, "sillage"));
  B.push(senna(`<p>อยากได้น้ำหอมที่วางตลาดเป็นแนวไหนคะ${d.hint?.gender ? ` ที่เล่ามาน่าจะเป็น${GENDER[d.hint.gender]}` : ""}</p><p class="sub">ขวดยูนิเซ็กซ์จะแนะนำได้เสมอ</p>`));
  if (st === "gender") { C.chips = ["women", "men", "any"].map(k => ({label: GENDER[k], act: () => { d.scent_gender = k; d.gen_done = true; save(); render(); }})); return {B, C}; }
  B.push(user(GENDER[d.scent_gender] || GENDER.any, "gender"));
  B.push(senna(`<p>เกือบพร้อมแล้วค่ะ</p><p>${isCollector() ? "อยากให้คนอื่นมองคุณแบบไหน หรือจะแต่งตัวแบบไหนไหมคะ" : "มีน้ำหอมที่ชอบอยู่แล้ว หรืออยากให้คนอื่นมองคุณแบบไหนไหมคะ"} ไม่บอกก็ได้</p>`));
  if (st === "extras") { B.push(extrasForm()); C.chips = [{label: "ไม่มีเพิ่ม ไปดูตัวเลือกเลย", act: () => recommend(true)}]; return {B, C}; }
  B.push(user(extrasSummary()));
  if (st === "generating") { B.push({kind: "typing", html: typingHTML()}); return {B, C}; }
  if (session.sets) { d.res = {sets: session.sets, pop: session.families_from_popularity, labels: session.selected_family_labels}; save(); }
  if (!d.res) { B.push(senna("บันทึกเรียบร้อยแล้วค่ะ")); return {B, C}; }
  const [s1, s2] = d.res.sets;
  const comparison = compareSets(d.res.sets), shared = d.seen2 ? comparison.shared_item_ids : [];
  B.push(senna(`<p>ได้แล้วค่ะ นี่คือชุดที่ 1 ลองเลื่อนดูทีละขวดนะคะ</p>${d.res.pop ? `<p>เริ่มจากแนวที่คนนิยมสำหรับโอกาสนี้: ${esc(d.res.labels.join(" และ "))}</p>` : ""}`));
  B.push(shelf(s1, "ชุดที่ 1", shared));
  if (st === "set1") { C.chips = [{label: "ขอดูอีกชุด", act: () => { d.seen2 = true; save(); render(); }}]; return {B, C}; }
  B.push(user("ขอดูอีกชุด"));
  B.push(senna(esc(comparisonText(comparison, s2.items.length))));
  B.push(shelf(s2, "ชุดที่ 2", shared));
  B.push(senna(`<p>ดูครบทั้งสองชุดแล้ว ขอความเห็นสั้น ๆ นะคะ</p><p>เลื่อนขึ้นไปดูอีกครั้งได้ค่ะ</p>`));
  if (st === "relevance") { B.push(checkin("rel-form", "ความเห็นต่อคำแนะนำ", "ทั้งสองชุดตรงใจแค่ไหน", RELEVANCE, d.ans, "ส่งความเห็น")); return {B, C}; }
  B.push(user("ให้คะแนนทั้งสองชุดแล้ว"));
  B.push(senna(`<p>ขอบคุณค่ะ ขอเช็กความรู้สึกอีกรอบด้วย 3 ข้อเดิมนะคะ</p><p>นึกถึงตอนเลือกน้ำหอมไปใช้${esc(scenarioLabel(d.scenario))}เหมือนเดิมค่ะ</p>`));
  if (st === "post") { B.push(checkin("post-form", "เช็กความรู้สึก หลังคุยกับ Senna", "ตอนนี้คุณรู้สึกอย่างไร", config.confidence.map((q, i) => [`post${i + 1}`, q]), d.ans, "ส่งคำตอบ")); return {B, C}; }
  B.push(user("ตอบเช็กความรู้สึกแล้ว"));
  B.push(senna(`ชุดสุดท้ายแล้วค่ะ อีก 6 ข้อสั้น ๆ`));
  if (st === "experience") { B.push(checkin("exp-form", "ความเห็นต่อการคุยครั้งนี้", "ครั้งนี้เป็นอย่างไรบ้าง", EXPERIENCE_Q, d.ans, "ส่งและจบการคุย")); return {B, C}; }
  B.push(user("ส่งความเห็นแล้ว"));
  B.push(senna(`<p>ขอบคุณมากค่ะ บันทึกเรียบร้อยแล้ว</p>${config.mode === "pilot" ? "<p>รอบนี้เป็นรอบทดลอง ไม่นับรวมผลวิจัยหลัก</p>" : ""}<p class="receipt">รหัสการเข้าร่วม: ${esc(session.participant_id)}</p>`));
  C.chips = [{label: "เริ่มคุยรอบใหม่", act: () => { clearAll(); render(); }, soft: true}];
  return {B, C};
}
function extrasSummary() {
  const parts = [];
  if (d.favorite && !isCollector()) parts.push(`ชอบ ${d.favorite.label}`);
  if (d.image) parts.push(`อยากดู${d.image}`);
  if (d.styles?.length) parts.push(`สไตล์ ${d.styles.join(", ")}`);
  if (d.outfit) parts.push(`แต่งตัว: ${d.outfit}`);
  return parts.length ? parts.join(" / ") : "ไม่มีเพิ่ม ไปดูตัวเลือกเลย";
}
const typingHTML = () => `<div class="msg senna"><span class="mini on" aria-hidden="true">${ICON.bottle}</span><div class="bubble typing" aria-label="Senna กำลังพิมพ์"><i></i><i></i><i></i></div></div>`;

// ---------- rendering ----------
function render() {
  if (!config) return;
  const {B, C} = build();
  const lastSenna = B.map(b => b.kind).lastIndexOf("senna");
  if (lastSenna >= 0) B[lastSenna].html = B[lastSenna].html.replace('class="msg senna"', 'class="msg senna last"');
  const fresh = shown && B.length > shown && B.slice(shown).some(b => b.kind === "senna") && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  const paint = list => {
    thread.innerHTML = list.map(b => b.html).join("") + (lastError ? `<p class="error" role="alert">${esc(lastError)}</p>` : "");
    wire();
  };
  const my = ++token;
  updateBar();
  if (fresh) {
    paint([...B.slice(0, shown), {html: typingHTML()}]); composer.innerHTML = ""; composer.hidden = true; scrollEnd();
    setTimeout(() => { if (my === token) { shown = B.length; paint(B); renderComposer(C); scrollEnd(); } }, 550);
    return;
  }
  shown = B.length; paint(B); renderComposer(C); scrollEnd();
}
function scrollEnd() {
  requestAnimationFrame(() => {
    const msgs = thread.querySelectorAll(".msg.senna"), el = msgs[msgs.length - 1], last = thread.lastElementChild;
    if (!el || !last) return;
    const header = $(".bar").offsetHeight, comp = composer.offsetHeight;
    const assessment = thread.querySelector("#owned-entry-consent-form,#owned-consent-form,#owned-pre-form,#owned-ratings-form,#owned-post-form");
    if (d.intent === "owned" && assessment) {
      window.scrollTo({top: Math.max(0, assessment.getBoundingClientRect().top + scrollY - header - 12), behavior: "auto"});
      return;
    }
    const ownedAnchor = $("#alternatives-answer") || $("#owned-answer");
    if (d.intent === "owned" && !d.ownedChat?.stage.startsWith("trial-") && ownedAnchor) {
      const top = ownedAnchor.closest(".msg").getBoundingClientRect().top + scrollY - header - 12;
      window.scrollTo({top: Math.max(0, top), behavior: "auto"}); return;
    }
    const toQuestion = el.getBoundingClientRect().top + scrollY - header - 12;          // newest question just under the top bar
    const toEnd = last.getBoundingClientRect().bottom + scrollY - (innerHeight - comp) + 16; // everything visible above the composer
    window.scrollTo({top: Math.max(0, Math.min(toQuestion, toEnd)), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
  });
}
function renderComposer(C) {
  composer.hidden = !busy && !C.chips.length && !C.say;
  if (composer.hidden) { composer.innerHTML = ""; return; }
  if (busy) { composer.innerHTML = `<div class="composer-inner"><p class="hint">${d.intent === "owned" ? "กำลังดูข้อมูลขวดที่เลือก…" : "กำลังบันทึก…"}</p></div>`; return; }
  composer.innerHTML = `<div class="composer-inner">${C.chips.length ? `<div class="chips">${C.chips.map((c, i) => `<button type="button" class="chip ${c.soft ? "soft" : ""}" data-chip="${i}">${esc(c.label)}</button>`).join("")}</div>` : ""}
    ${C.say ? `<form class="say" id="say"><input id="say-input" autocomplete="off" maxlength="200" placeholder="${esc(C.say.ph)}" aria-label="พิมพ์ข้อความถึง Senna"><button type="submit" aria-label="ส่ง">${ICON.send}</button></form><p class="hint">${esc(C.say.hint || "ข้อความที่พิมพ์ใช้แค่ช่วยเลือกคำตอบในหน้านี้ ไม่ถูกส่งไปเก็บ")}</p>` : ""}</div>`;
  composer.querySelectorAll("[data-chip]").forEach(b => b.onclick = () => C.chips[Number(b.dataset.chip)].act());
  const say = $("#say"); if (say) say.onsubmit = e => { e.preventDefault(); const v = $("#say-input").value.trim(); if (v) C.say.act(v); };
}
function updateBar() {
  const st = stage(), step = ["consent", "scenario", "q6", "q5", "budget", "pre", "fav", "families", "sillage", "gender", "extras", "generating"].includes(st) ? "talk" : ["set1"].includes(st) ? "look" : st === "done" ? "end" : "feedback";
  const order = ["talk", "look", "feedback"];
  document.querySelectorAll("#journey li").forEach(li => { const i = order.indexOf(li.dataset.step), cur = order.indexOf(step); li.toggleAttribute("aria-current", false); li.classList.toggle("done", step === "end" || i < cur); if (i === cur) li.setAttribute("aria-current", "step"); });
  $("#journey").hidden = d.intent === "owned" || st === "purpose";
  document.body.classList.toggle("owned-result", d.intent === "owned" && (d.ownedChat?.stage === "result" || d.ownedChat?.stage.startsWith("alternatives-")));
  $("#status").textContent = d.intent === "owned" ? "ช่วยเลือกใช้ขวดที่มี" : config.mode === "pilot" ? "ที่ปรึกษาน้ำหอม (รอบทดลอง)" : "ที่ปรึกษาน้ำหอม";
  $("#mode-note").textContent = config.mode === "pilot" ? "รอบทดลองระบบ ข้อมูลไม่นับรวมผลวิจัยหลัก" : "รอบเก็บข้อมูลวิจัย";
  $("#withdraw").hidden = !session || d.intent === "owned";
  $("#withdraw-owned").hidden = d.intent !== "owned" || !d.ownedChat?.trial?.secret;
  $("#withdraw-followup").hidden = d.intent !== "owned" || !d.ownedChat?.followupTrial?.secret;
  $("#wardrobe-link").hidden = d.intent === "owned";
  $("#goal-link").hidden = d.intent !== "owned";
  $("#goal-link").textContent = session?.state === "complete" ? "กลับผลรอบทดลองที่จบแล้ว" : "กลับไปเลือกเป้าหมาย";
}

// Owned-use has a separate opt-in pilot; private advice does not submit answers.
async function enterOwnedChat() {
  if (busy) return;
  if (session && session.state !== "complete") {
    if (!confirm("รอบนี้เป็นการทดลองหาขวดใหม่ หากเปลี่ยนเป็นเลือกใช้ขวดที่มี จะถอนตัวและลบคำตอบรอบนี้ ต้องการเปลี่ยนหรือไม่")) return;
    return run(async () => {
      await api(`/study/sessions/${creds.id}`, {method: "DELETE"});
      clearAll(); await initializeOwnedChat();
    });
  }
  return run(initializeOwnedChat);
}
async function leaveOwnedChat() {
  if (busy) return;
  for (const task of ["owned_use", FOLLOWUP_TASK]) {
    const trial = decisionTrial(task);
    if (trial?.secret && trial.server?.state !== "complete") {
      if (!confirm("ออกจากการทดลองเปรียบเทียบและลบคำตอบรอบที่ยังไม่จบหรือไม่")) return;
      await run(() => withdrawOwnedTrial(false, task));
      if (decisionTrial(task)?.secret) return;
    }
  }
  d.intent = session ? "discover" : null; lastError = ""; $("#menu-pop").hidden = true; save(); render();
}
function ownedStep(stage) {
  d.ownedChat.stage = stage; delete d.ownedChat.result; lastError = ""; save(); render();
}
function ownedAdviceSummary(items) {
  if (!items.length) return "ยังไม่มีข้อมูลพอประเมินขวดที่เลือกค่ะ";
  if (items.every(it => it.assessment_code === "stronger_than_requested"))
    return "ขวดที่เลือกกระจายกลิ่นชัดกว่าที่อยากได้ทั้งหมดค่ะ จึงยังไม่มีขวดที่ตรงระดับกลิ่นที่ขอ";
  const first = items[0];
  return items.length > 1
    ? `ถ้าจะเลือกจากขวดที่มี ให้พิจารณา ${perfumeLabel(first)} ก่อนสำหรับ${scenarioLabel(d.ownedChat.scenario)} พร้อมดูข้อควรระวังด้านล่างค่ะ`
    : `${perfumeLabel(first)} กับ${scenarioLabel(d.ownedChat.scenario)}:`;
}
function ownedAdviceBlocks(result, id = "owned-answer") {
  const summary = result.comparison_limited ? "ดูข้อมูลได้ทีละขวดค่ะ ขวดที่อยู่นอกชุดทดลองยังไม่ถูกจัดอันดับเทียบกับขวดอื่น" : ownedAdviceSummary(result.items);
  const verdict = result.comparison_limited ? "" : `<p>${esc(result.items[0]?.assessment)}</p>`;
  const blocks = [senna(`<div id="${id}"><p>${esc(summary)}</p>${verdict}<p>${result.families_from_popularity ? "อ้างอิงแนวที่ผู้ตอบแบบสอบถามมักเลือกในโอกาสนี้" : "เทียบกับแนวกลิ่นที่คุณเลือก"} ไม่ใช่กฎตายตัว และไม่จำเป็นต้องซื้อขวดใหม่ค่ะ</p></div>`)];
  for (const it of result.items) blocks.push(widget(`<article class="owned-chat-advice">${it.image_url ? `<img src="${esc(it.image_url)}" alt="${esc(perfumeLabel(it))}" referrerpolicy="no-referrer" loading="lazy">` : ""}<div><h3>${esc(perfumeLabel(it))}</h3><p class="owned-verdict">${esc(it.assessment)}</p><p class="sub">${esc(it.family)} · ${esc(it.sillage)}${it.sillage_estimated ? " (ประมาณ)" : ""}</p><ul>${it.reasons.map(reason => `<li>${esc(reason)}</li>`).join("")}</ul>${it.cautions.map(caution => `<p class="owned-caution">${esc(caution)}</p>`).join("")}</div></article>`));
  return blocks;
}
function scrollToOwnedSection(id) {
  const target = document.getElementById(id);
  if (!target) return;
  window.scrollTo({top: Math.max(0, target.getBoundingClientRect().top + scrollY - $(".bar").offsetHeight - 12), behavior: "auto"});
}
function buildOwnedChat() {
  const o = d.ownedChat, B = [], C = {chips: [], say: null};
  B.push(senna("มาดูว่าขวดที่คุณมีจะใช้กับโอกาสไหนได้บ้างค่ะ รอบทดลองจะขอความยินยอมและประเมินความมั่นใจก่อน–หลัง คุณเลือกไม่ร่วมทดลองได้ค่ะ"));
  B.push(user("เลือกใช้ขวดที่มี"));
  if (o.stage === "entry-consent") return buildOwnedEntry(B, C, o);
  B.push(senna("จะใช้น้ำหอมไปไหนหรือในโอกาสอะไรคะ"));
  if (o.stage === "scenario") {
    const choose = (scenario, said = "") => { o.scenario = scenario; o.said = said; ownedStep("bottles"); };
    C.chips = Object.keys(config.scenarios).map(k => ({label: scenarioLabel(k), act: () => choose(k)}));
    C.say = {ph: "เช่น Go party หรือไปทำงาน", act: text => {
      const hint = understand(text);
      if (!hint.scenario) { lastError = "ยังไม่แน่ใจว่าเป็นโอกาสไหน เลือกจากด้านล่างได้ค่ะ"; render(); return; }
      o.familySelection = hint.families; o.sillage = hint.sillage ?? null;
      if (hint.budget !== undefined && /งบ|บาท|budget|thb|฿/i.test(text)) { o.budget = hint.budget; o.budgetSet = true; }
      choose(hint.scenario, text);
    }};
    return {B, C};
  }
  B.push(user(o.said || scenarioLabel(o.scenario)));
  B.push(senna(`จะใช้${esc(scenarioLabel(o.scenario))}นะคะ คุณมีน้ำหอมขวดไหนอยู่บ้าง`));
  if (o.stage === "bottles") {
    if (o.items.length) B.push(widget(`<ul class="owned-chat-list">${o.items.map(it => `<li><span>${esc(perfumeLabel(it))}</span><button type="button" data-owned-remove="${it.id}" title="เอาออก" aria-label="เอา ${esc(perfumeLabel(it))} ออก">×</button></li>`).join("")}</ul>`));
    if (o.query) {
      B.push(user(o.query));
      const matches = o.matches || [];
      if (matches.length) {
        B.push(senna(matches.some(it => it.exact_match ?? exactPerfumeName(o.query, it))
          ? "เลือกรุ่นที่ตรงกับขวดของคุณค่ะ"
          : "ยังไม่พบชื่อรุ่นตรงกับที่พิมพ์ค่ะ ด้านล่างเป็นชื่อใกล้เคียง เลือกเฉพาะถ้าตรงกับขวดที่มีนะคะ"));
        B.push(widget(`<div class="fav-pick">${matches.map(it => `<button type="button" class="toggle" data-owned-add="${it.id}">${esc(perfumeLabel(it))}${it.coverage === "partial" ? ' <span class="sub">· ข้อมูลบางส่วน</span>' : it.coverage === "name_only" ? ' <span class="sub">· มีเฉพาะชื่อ</span>' : ""}</button>`).join("")}<button type="button" class="toggle" id="owned-no-match">ไม่ใช่ขวดของฉัน</button></div>`));
      } else B.push(senna("ยังไม่พบรุ่นนี้ในรายการ จึงยังประเมินขวดนี้ไม่ได้ค่ะ ลองชื่อแบรนด์หรือชื่อภาษาอังกฤษอีกครั้งได้"));
    }
    C.say = {ph: "ชื่อขวดที่มี เช่น CK One หรือ Chanel", hint: "ค้นหารุ่นในฐานข้อมูล ข้อความค้นหาไม่ถูกบันทึกเป็นคำตอบวิจัย", act: text => run(async () => {
      const result = await api(`/wardrobe/search?q=${encodeURIComponent(text)}`);
      o.query = text; o.matches = result.items.filter(it => !o.items.some(p => p.id === it.id)); save();
    })};
    if (o.items.length) C.chips.push({label: "ใช้ขวดที่เลือก", act: () => ownedStep("families")});
    return {B, C};
  }
  B.push(user(o.items.map(perfumeLabel).join(" / ")));
  B.push(senna("สำหรับโอกาสนี้อยากได้กลิ่นแนวไหน หรือให้ดูตามโอกาสที่บอกก็ได้ค่ะ"));
  if (o.stage === "families") { B.push(familyPicker(o.familySelection || [], "owned-fam-form")); return {B, C}; }
  B.push(user(o.families.length ? o.families.map(famLabel).join(" / ") : "ให้ดูตามโอกาส"));
  B.push(senna("อยากให้กลิ่นอยู่ใกล้ตัว หรือกระจายถึงคนรอบข้างแค่ไหนคะ"));
  if (o.stage === "sillage") {
    B.push(sillagePicker(o.sillage)); C.chips = [{label: "ยังไม่กำหนด", act: () => { o.sillage = null; finishOwnedPreferences(); }}]; return {B, C};
  }
  B.push(user(o.sillage === null ? "ยังไม่กำหนด" : SILLAGE[o.sillage].b));
  if (o.stage.startsWith("decision-")) return buildOwnedDecision(B, C, o);
  if (o.stage.startsWith("trial-")) {
    if (decisionTask() === FOLLOWUP_TASK && o.result?.items?.length) {
      B.push(raw(`<details id="owned-advice-review" class="owned-advice-review"><summary>คำแนะนำสำหรับขวดที่คุณมี</summary>${ownedAdviceBlocks(o.result, "owned-review-answer").map(block => block.html).join("")}</details>`));
    }
    return buildOwnedTrial(B, C, o);
  }
  if (o.stage === "generating") { B.push({kind: "typing", html: typingHTML()}); return {B, C}; }
  B.push(raw('<h3 class="owned-advice-heading">คำแนะนำสำหรับขวดที่คุณมี</h3>'));
  if (o.stage === "alternatives-result") B.push(raw('<button type="button" class="chip" id="back-to-alternatives">กลับไปดูขวดใหม่เพิ่มเติม</button>'));
  B.push(...ownedAdviceBlocks(o.result));
  if (o.trial?.server?.state === "complete" && o.trial.completedContext === JSON.stringify(ownedContext())) {
    B.push(senna(`<p>บันทึกผลทดลองเลือกใช้แล้วค่ะ ไม่นับรวมกับการเลือกซื้อ</p><p class="receipt owned-receipt">รหัสรอบทดลอง: ${esc(o.trial.id)}</p>`));
  } else if (o.stage === "result") {
    B.push(senna(`<p class="private-advice-notice" role="status">${o.result.comparison_limited || o.items.length > 1 ? "รอบนี้เป็นคำแนะนำอย่างเดียว ยังไม่มีคะแนนก่อน–หลังที่ส่งไว้ค่ะ" : "ตอนนี้เลือกไว้หนึ่งขวด จึงประเมินความเหมาะสมให้ได้ แต่ยังเปรียบเทียบการจัดอันดับขวดที่มีสองวิธีไม่ได้ค่ะ"}</p>`));
  }
  B.push(senna("ความชอบจริงอาจต่างจากข้อมูลกลิ่นค่ะ ลองเทียบกับกลิ่นที่คุณเคยดมและบรรยากาศจริงของงานด้วย"));
  const more = buildOwnedAlternatives(B, C, o); if (more) return more;
  C.chips = [{label: "แนะนำขวดอื่นเพิ่มเติม", act: requestOwnedAlternatives}, {label: "เลือกใช้ขวดเดิม", act: chooseExistingBottle},
    {label: "เปลี่ยนโอกาสใช้งาน", act: () => ownedStep("scenario")}, {label: "เพิ่มหรือเปลี่ยนขวด", act: () => ownedStep("bottles")},
    {label: session?.state === "complete" ? "กลับผลรอบทดลองที่จบแล้ว" : "เปลี่ยนเป้าหมาย", soft: true, act: leaveOwnedChat}];
  if (config.mode === "pilot" && o.items.length > 1 && ownedTrialEligible(o) && o.trial?.server?.state !== "complete") C.chips.unshift({label: "ประเมินคำแนะนำสองชุด", act: () => { o.activeTrialTask = "owned_use"; offerOwnedTrial(); }});
  return {B, C};
}
function compareOwnedChat() {
  const o = d.ownedChat;
  run(async () => {
    o.stage = "generating"; save(); render();
    try {
      o.result = await api("/wardrobe/compare", {method: "POST", body: JSON.stringify({owned_ids: o.items.map(it => it.id), scenario: o.scenario, families: o.families, sillage: o.sillage})});
      o.privateAdviceSeen = true; o.stage = "result"; save();
    } catch (error) { o.stage = "sillage"; save(); throw error; }
  });
}
function wireOwnedChat() {
  const o = d.ownedChat;
  if (o.stage === "entry-consent" || o.stage.startsWith("trial-")) { wireOwnedTrial(); return; }
  const back = $("#back-to-alternatives");
  if (back) back.onclick = () => scrollToOwnedSection("alternatives-answer");
  const noMatch = $("#owned-no-match");
  if (noMatch) noMatch.onclick = () => {
    o.query = ""; o.matches = []; ownedStep("bottles");
    $("#say-input")?.focus();
  };
  thread.querySelectorAll("[data-owned-add]").forEach(button => button.onclick = () => {
    if (o.items.length >= 10) { lastError = "เลือกได้ไม่เกิน 10 ขวดค่ะ"; render(); return; }
    const item = o.matches.find(it => it.id === Number(button.dataset.ownedAdd));
    if (item && !o.items.some(it => it.id === item.id)) o.items.push(item);
    o.query = ""; o.matches = []; ownedStep("bottles");
  });
  thread.querySelectorAll("[data-owned-remove]").forEach(button => button.onclick = () => {
    o.items = o.items.filter(it => it.id !== Number(button.dataset.ownedRemove)); ownedStep("bottles");
  });
  const form = $("#owned-fam-form");
  if (form) {
    form.querySelectorAll("[data-fam]").forEach(button => button.onclick = () => {
      const key = button.dataset.fam;
      if (key === "unsure") { o.families = []; ownedStep("sillage"); return; }
      const chosen = o.familySelection || [];
      o.familySelection = chosen.includes(key) ? chosen.filter(k => k !== key) : [...chosen.slice(-1), key]; save(); render();
    });
    form.onsubmit = event => { event.preventDefault(); o.families = [...(o.familySelection || [])]; ownedStep("sillage"); };
  }
  thread.querySelectorAll("[data-sil]").forEach(button => button.onclick = () => { o.sillage = Number(button.dataset.sil); finishOwnedPreferences(); });
  thread.querySelectorAll(".owned-chat-advice img").forEach(img => img.onerror = () => { img.hidden = true; });
  thread.querySelectorAll(".more").forEach(button => button.onclick = () => { button.nextElementSibling.hidden = !button.nextElementSibling.hidden; button.setAttribute("aria-expanded", String(!button.nextElementSibling.hidden)); });
}

// ---------- actions ----------
function answer(field, value) {
  d[field] = value;
  if (field === "sillage") d.sil_done = true;
  save();
  if (field === "budget" && session?.state === "intake") return render();
  render();
}
function tellScenario(text) {
  const u = understand(text);
  if (!u.scenario) { lastError = "ยังจับไม่ได้ว่าเป็นโอกาสไหน ลองแตะตัวเลือกด้านล่างได้ค่ะ"; render(); return; }
  lastError = ""; d.said = text; d.scenario = u.scenario; d.hint = {families: u.families, not: u.not, sillage: u.sillage, budget: u.budget, gender: u.gender}; save(); render();
}
function tellFamilies(text) {
  const u = understand(text);
  if (!u.families.length && !u.not.length) { lastError = "ยังจับแนวกลิ่นจากข้อความไม่ได้ ลองแตะเลือกในกล่องด้านบนได้ค่ะ"; render(); return; }
  lastError = u.families.length ? "" : `จดไว้ว่าไม่เอา${u.not.map(famLabel).join(" และ ")} ลองแตะเลือกแนวที่อยากได้ในกล่องด้านบนค่ะ`;
  d.fam_sel = u.families.length ? u.families : (d.fam_sel || []).filter(f => !u.not.includes(f)); save(); render();
}
function favDone(item, skipLabel) {
  d.favorite = item ? {id: item.id, label: perfumeLabel(item)} : null; d.fav_skip = skipLabel || ""; d.fav_done = true; lastError = ""; save(); render();
}
async function findFavorite(text) {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  const queries = [...new Set([text.trim(), ...words])].slice(0, 6);
  const found = new Map();
  await run(async () => {
    for (const q of queries) { const r = await api(`/search?q=${encodeURIComponent(q)}`); r.items.forEach(i => found.set(i.id, i)); }
  });
  const score = i => words.filter(w => `${i.brand} ${i.name}`.toLowerCase().includes(w)).length;
  d.fav_q = text; d.fav_results = [...found.values()].sort((a, b) => score(b) - score(a)).slice(0, 8);
  const exact = d.fav_results.filter(i => score(i) === words.length && words.length > 1);
  if (exact.length === 1) d.fav_results = exact;
  save(); render();
}
async function startSession() {
  notice = "";
  if (!creds) { const b = crypto.getRandomValues(new Uint8Array(32)); creds = {id: crypto.randomUUID(), secret: Array.from(b, x => x.toString(16).padStart(2, "0")).join("")}; try { sessionStorage.setItem(KEY, JSON.stringify(creds)); } catch {} }
  session = await api("/study/sessions", {method: "POST", body: JSON.stringify({request_id: creds.id, client_secret: creds.secret, consent: true, eligible: true})});
}
async function savePre(scores) {
  d.pre = scores; save();
  session = await api(`/study/sessions/${creds.id}/pre`, {method: "PUT", body: JSON.stringify({q5_usage: d.q5, q6_experience: d.q6, q21_budget: d.budget, scenario: d.scenario, q24_problems: d.q24, scores: [1, 2, 3].map(i => scores[`pre${i}`])})});
}
function recommend(skip) {
  if (skip) { d.image = null; d.styles = []; d.outfit = ""; if (!d.fav_done) d.favorite = null; }
  d.extras_done = true; save();
  run(async () => {
    try {
      session = await api(`/study/sessions/${creds.id}/recommend`, {method: "POST", body: JSON.stringify({families: d.families || [], sillage: d.sillage ?? null, image: d.image || null, styles: d.styles || [], outfit: (d.outfit || "").trim(), favorite_id: d.favorite?.id || null, scent_gender: d.scent_gender || null})});
    } catch (e) { d.extras_done = false; save(); throw e; }
  });
}
async function markViewed(slot) {
  if (!session || session.state !== "recommended" || session.viewed?.[slot]) return;
  try { const r = await api(`/study/sessions/${creds.id}/view`, {method: "POST", body: JSON.stringify({slot})}); session.viewed = r.viewed; } catch {}
}
async function complete() {
  const a = d.ans;
  session = await api(`/study/sessions/${creds.id}/complete`, {method: "POST", body: JSON.stringify({post: [1, 2, 3].map(i => a[`post${i}`]),
    relevance_first: a.relevance_first, relevance_second: a.relevance_second, satisfaction: a.satisfaction, clarity: a.clarity, usefulness: a.usefulness,
    intention: a.intention, use_again: a.use_again, attention_answer: a.attention_answer})});
}
function readScale(form, keys) {
  const f = new FormData(form), out = {};
  for (const k of keys) { const v = Number(f.get(k)); if (!v) return null; out[k] = v; }
  return out;
}

// ---------- wiring for the widgets currently in the thread ----------
let searchTimer;
function wire() {
  if (d.intent === "owned") { wireOwnedChat(); return; }
  thread.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => {
    const f = b.dataset.edit;
    if (f === "fav") { d.fav_done = false; d.fav_q = ""; d.fav_results = []; d.favorite = null; d.fav_skip = ""; }
    else if (f === "families") { d.fam_done = false; d.fam_sel = [...(d.families || [])]; }
    else if (f === "sillage") { d.sil_done = false; }
    else if (f === "gender") { d.gen_done = false; }
    else { delete d[f]; if (f === "scenario") { delete d.said; delete d.hint; } }
    save(); render();
  });
  const consent = $("#consent-form");
  if (consent) consent.onsubmit = e => { e.preventDefault(); if (!consent.reportValidity()) return; run(startSession); };
  const q24 = $("#q24-form");
  if (q24) {
    const none = String(config.problems.length - 1);
    q24.querySelectorAll("input").forEach(x => x.onchange = () => {            // "never had a problem" is exclusive
      if (x.checked) q24.querySelectorAll("input").forEach(y => { if (y !== x && (x.value === none) !== (y.value === none) && y.checked) y.checked = false; });
      d.q24_sel = [...q24.querySelectorAll("input:checked")].map(y => config.problems[Number(y.value)]); save();
    });
    q24.onsubmit = e => { e.preventDefault(); const v = [...q24.querySelectorAll("input:checked")].map(y => config.problems[Number(y.value)]);
      if (!v.length) { lastError = "เลือกอย่างน้อย 1 ข้อ (หรือ \"ไม่เคยเจอปัญหาเลย\") นะคะ"; render(); return; }
      d.q24 = v; d.q24_sel = v; save(); render(); };
  }
  const pre = $("#pre-form");
  if (pre) pre.onsubmit = e => { e.preventDefault(); const v = readScale(pre, ["pre1", "pre2", "pre3"]); if (!v) { lastError = "ตอบให้ครบ 3 ข้อก่อนนะคะ"; render(); return; } run(() => savePre(v)); };
  const fam = $("#fam-form");
  if (fam) {
    fam.querySelectorAll("[data-fam]").forEach(b => b.onclick = () => {
      const k = b.dataset.fam;
      if (k === "unsure") { d.families = []; d.fam_done = true; d.fam_sel = []; save(); render(); return; }
      const sel = d.fam_sel || [];
      if (sel.includes(k)) d.fam_sel = sel.filter(x => x !== k);
      else if (sel.length < 2) d.fam_sel = [...sel, k];
      else { d.fam_sel = [sel[1], k]; }
      save(); render();
    });
    fam.onsubmit = e => { e.preventDefault(); if (!(d.fam_sel || []).length) return; d.families = [...d.fam_sel]; d.fam_done = true; save(); render(); };
  }
  thread.querySelectorAll("[data-favpick]").forEach(b => b.onclick = () => favDone(d.fav_results.find(r => r.id === Number(b.dataset.favpick))));
  thread.querySelectorAll("[data-sil]").forEach(b => b.onclick = () => answer("sillage", Number(b.dataset.sil)));
  if ($("#extras-go")) wireExtras();
  thread.querySelectorAll(".more").forEach(b => b.onclick = () => { const t = b.nextElementSibling; t.hidden = !t.hidden; b.setAttribute("aria-expanded", String(!t.hidden)); });
  thread.querySelectorAll(".bottle img").forEach(img => img.onerror = () => { img.replaceWith(Object.assign(document.createElement("span"), {className: "ph"})); });
  const rel = $("#rel-form");
  if (rel) rel.onsubmit = e => { e.preventDefault(); const v = readScale(rel, RELEVANCE.map(x => x[0])); if (!v) { lastError = "ให้คะแนนทั้งสองชุดก่อนนะคะ"; render(); return; } d.ans = {...(d.ans || {}), ...v}; d.rel_done = true; save(); render(); };
  const post = $("#post-form");
  if (post) post.onsubmit = e => { e.preventDefault(); const v = readScale(post, ["post1", "post2", "post3"]); if (!v) { lastError = "ตอบให้ครบ 3 ข้อก่อนนะคะ"; render(); return; } d.ans = {...(d.ans || {}), ...v}; d.post_done = true; save(); render(); };
  const exp = $("#exp-form");
  if (exp) exp.onsubmit = e => { e.preventDefault(); const v = readScale(exp, EXPERIENCE_Q.map(x => x[0])); if (!v) { lastError = "ตอบให้ครบทุกข้อก่อนนะคะ"; render(); return; } d.ans = {...(d.ans || {}), ...v}; save(); run(complete); };
  if (session?.state === "recommended") { markViewed("first"); if (d.seen2) markViewed("second"); }
}
function wireExtras() {
  const q = $("#fav-q"), list = $("#fav-results");
  if (q) q.oninput = () => {
    clearTimeout(searchTimer); list.hidden = true; const v = q.value.trim(); if (v.length < 2) return;
    searchTimer = setTimeout(async () => {
      try {
        const r = await api(`/search?q=${encodeURIComponent(v)}`);
        list.innerHTML = r.items.length ? r.items.map(i => `<button type="button" data-id="${i.id}">${esc(perfumeLabel(i))}</button>`).join("") : '<p class="sub empty">ไม่พบรุ่นนี้ในรายการ</p>';
        list.hidden = false;
        list.querySelectorAll("[data-id]").forEach(b => b.onclick = () => { const i = r.items.find(x => x.id === Number(b.dataset.id)); d.favorite = {id: i.id, label: perfumeLabel(i)}; save(); render(); });
      } catch {}
    }, 250);
  };
  const clear = $("#fav-clear"); if (clear) clear.onclick = () => { d.favorite = null; save(); render(); };
  thread.querySelectorAll("[data-img]").forEach(b => b.onclick = () => { d.image = d.image === b.dataset.img ? null : b.dataset.img; save(); b.closest(".opt").querySelectorAll("[data-img]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.img === d.image))); });
  thread.querySelectorAll("[data-style]").forEach(b => b.onclick = () => {
    const s = d.styles || [], k = b.dataset.style;
    d.styles = s.includes(k) ? s.filter(x => x !== k) : s.length < 2 ? [...s, k] : [s[1], k]; save();
    b.closest(".opt").querySelectorAll("[data-style]").forEach(x => x.setAttribute("aria-pressed", String(d.styles.includes(x.dataset.style))));
  });
  $("#outfit").oninput = e => { d.outfit = e.target.value; save(); };
  $("#extras-go").onclick = () => recommend(false);
}

function hydrate() {
  const p = session?.pre, q = session?.preferences;
  if (p) { d.scenario ??= p.scenario; d.q5 ??= p.q5_usage; d.q6 ??= p.q6_experience; d.budget ??= p.q21_budget; d.q24 ??= p.q24_problems || []; d.pre ??= {pre1: p.scores[0], pre2: p.scores[1], pre3: p.scores[2]}; }
  if (q) { d.families ??= q.families; d.fam_done = true; if (d.sillage === undefined) d.sillage = q.sillage; d.sil_done = true; d.extras_done = true; d.fav_done = true; if (d.scent_gender === undefined) d.scent_gender = q.scent_gender ?? null; d.gen_done = true; if (q.favorite_id && !d.favorite) d.favorite = {id: q.favorite_id, label: "น้ำหอมที่เลือกไว้"}; d.image ??= q.image; d.styles ??= q.styles; d.outfit ??= q.outfit; }
  save();
}

// ---------- menu and start ----------
$("#menu").onclick = () => { const p = $("#menu-pop"); p.hidden = !p.hidden; $("#menu").setAttribute("aria-expanded", String(!p.hidden)); };
$("#wardrobe-link").onclick = enterOwnedChat;
$("#goal-link").onclick = leaveOwnedChat;
$("#withdraw-owned").onclick = () => run(async () => { if (await withdrawOwnedTrial(true, "owned_use")) $("#menu-pop").hidden = true; });
$("#withdraw-followup").onclick = () => run(async () => { if (await withdrawOwnedTrial(true, FOLLOWUP_TASK)) $("#menu-pop").hidden = true; });
document.addEventListener("click", e => { if (!e.target.closest("#menu,#menu-pop")) { $("#menu-pop").hidden = true; $("#menu").setAttribute("aria-expanded", "false"); } });
$("#withdraw").onclick = async () => {
  if (!creds || !session) { clearAll(); render(); return; }
  if (!confirm("ถอนตัวและลบคำตอบทั้งหมดของรอบนี้หรือไม่")) return;
  $("#menu-pop").hidden = true;
  try { await api(`/study/sessions/${creds.id}`, {method: "DELETE"}); }
  catch (e) {
    if (e.status !== 404) { lastError = "ยังลบคำตอบไม่สำเร็จ คำตอบรอบนี้ยังถูกเก็บอยู่ ตรวจการเชื่อมต่อแล้วกดถอนตัวอีกครั้งค่ะ"; render(); return; }
  }
  clearAll(); notice = "ลบคำตอบรอบนี้เรียบร้อยแล้วค่ะ ถ้าต้องการเริ่มใหม่ก็เริ่มได้เลย"; render();
};
(async () => {
  try {
    config = await api("/study/config");
    try { creds = JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch { creds = null; }
    d = load();
    if (creds) {
      try {
        session = await api(`/study/sessions/${creds.id}`);
        if (session.state === "withdrawn") clearAll();
        else if (session.state === "generating") setTimeout(async () => { session = await api(`/study/sessions/${creds.id}`); render(); }, 2500);
        if (session?.viewed?.second) d.seen2 = true;
        hydrate();
      } catch (e) { if (e.status === 404) clearAll(); else throw e; }
    }
    if (d.intent === "owned") await resumeOwnedTrial();
    render();
  } catch (e) {
    thread.innerHTML = `<p class="error" role="alert">ยังเชื่อมต่อ Senna ไม่ได้ ลองโหลดหน้านี้อีกครั้งค่ะ</p>`;
  }
})();
