"use strict";

const $ = id => document.getElementById(id);
const api = "/advisor/api";
const bottleIcon = document.querySelector(".avatar svg");
const owned = new Map();
const moods = new Set();
let options, step = "goal", mode, editing = false, busy = false;
let context, lastContext, lastItems = [], seen = [], showingOwned = false;
let hasMore = false;
let outfit = null;
let searchTerm = "", searchOffset = null, searchItems = [];

function node(tag, text = "", css = "") {
  const el = document.createElement(tag);
  el.textContent = text;
  el.className = css;
  return el;
}

function button(text, fn, css = "chip") {
  const el = node("button", text, css);
  el.type = "button";
  el.addEventListener("click", () => { if (!busy) fn(); });
  return el;
}

function bubble(text, fromUser = false) {
  const msg = node("div", "", fromUser ? "msg user" : "msg senna");
  if (!fromUser) {
    const avatar = node("span", "", "mini");
    avatar.setAttribute("aria-hidden", "true");
    avatar.append(bottleIcon.cloneNode(true));
    msg.append(avatar);
  }
  msg.append(node("div", text, "bubble"));
  $("messages").append(msg);
  return msg;
}

function scrollBottom() {
  const box = $("conversation");
  requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
}

function error(message = "") {
  $("error").textContent = message;
  $("error").hidden = !message;
  if (message) scrollBottom();
}

function controls(entries = [], placeholder = "") {
  $("choices").replaceChildren(...entries.map(([label, fn]) => button(label, fn)));
  $("reply").hidden = !placeholder;
  $("attach-outfit").hidden = !["mood", "outfit"].includes(step);
  $("text").placeholder = placeholder;
  $("text").value = "";
}

function panel(child) {
  $("active-panel").replaceChildren(...(child ? [child] : []));
}

function phase(next, prompt, entries = [], placeholder = "") {
  step = next;
  panel();
  error();
  bubble(prompt);
  controls(entries, placeholder);
  scrollBottom();
}

async function request(path, body) {
  const response = await fetch(api + path, body ? {
    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body),
  } : undefined);
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(typeof detail.detail === "string" ? detail.detail : "โหลดข้อมูลไม่ได้ค่ะ ลองอีกครั้งนะคะ");
  }
  return response.json();
}

async function run(fn) {
  if (busy) return;
  busy = true;
  error();
  $("restart").disabled = true;
  $("reply").setAttribute("aria-busy", "true");
  const pending = node("p", "กำลังดูข้อมูลให้ค่ะ…", "loading");
  pending.setAttribute("role", "status");
  $("active-panel").append(pending);
  scrollBottom();
  try { await fn(); }
  catch (err) { error(err.message); }
  finally {
    busy = false;
    $("restart").disabled = false;
    $("reply").removeAttribute("aria-busy");
    pending.remove();
  }
}

function journey(results) {
  $("talk-step").removeAttribute("aria-current");
  $("result-step").removeAttribute("aria-current");
  $(results ? "result-step" : "talk-step").setAttribute("aria-current", "step");
}

function start() {
  if (busy) return;
  mode = null;
  context = {scenario: null, families: [], sillage: null, budget: null, gender: null, styles: []};
  lastContext = null;
  lastItems = [];
  seen = [];
  hasMore = false;
  searchItems = [];
  searchTerm = "";
  searchOffset = null;
  owned.clear();
  moods.clear();
  outfit = null;
  editing = false;
  $("messages").replaceChildren();
  journey(false);
  phase("goal", "สวัสดีค่ะ วันนี้อยากหาน้ำหอมขวดใหม่ หรือให้ช่วยเลือกจากขวดที่มีอยู่แล้วคะ", [
    ["หาขวดใหม่", () => goal("new")], ["เลือกจากขวดที่มี", () => goal("owned")],
  ], "เช่น หาขวดใหม่ไว้ใส่ไปทำงาน");
}

function goal(next, text = "", brief = null) {
  mode = next;
  window.SennaAnalytics?.track("advisor_start", {mode: next});
  bubble(text || (next === "new" ? "หาขวดใหม่" : "เลือกจากขวดที่มี"), true);
  if (brief?.scenario) return applyBrief(brief, text);
  askOccasion();
}

function budgetLabel(bounds) {
  const format = value => value.toLocaleString("th-TH");
  return (bounds.min && bounds.max ? format(bounds.min) + "–" + format(bounds.max)
    : bounds.min ? "ตั้งแต่ " + format(bounds.min) : "ไม่เกิน " + format(bounds.max)) + " บาท";
}

function applyBrief(brief, text) {
  context.scenario = brief.scenario;
  const understood = [occasionLabel(brief.scenario)];
  if (editing) {
    bubble("เข้าใจว่าเปลี่ยนโอกาสเป็น " + understood[0] + " นะคะ");
    return editMenu();
  }
  if (brief.families.length) {
    context.families = brief.families;
    understood.push("แนว " + brief.families.map(key => options.families[key]).join(" และ "));
  }
  if (/แต่งตัว|ใส่ชุด|ใส่เสื้อ|ใส่กางเกง|ชุดสูท|เสื้อยืด|กางเกงยีนส์|\b(?:outfit|wearing)\b/i.test(text)) {
    context.styles = findOutfitStyles(text);
    if (context.styles.length) understood.push("แต่งตัวแนว " + context.styles.join(" / "));
  }
  if (brief.sillage !== null) {
    context.sillage = brief.sillage;
    understood.push(options.sillage[brief.sillage]);
  }
  if (mode === "new" && brief.bounds) {
    context.min_baht = brief.bounds.min;
    context.max_baht = brief.bounds.max;
    understood.push("งบ " + budgetLabel(brief.bounds));
  }
  bubble("เข้าใจว่า " + understood.join(" · ") + " นะคะ");
  if (mode === "owned") return askOwned();
  if (!context.families.length) return askMoods();
  return afterMoods();
}

function askOccasion() {
  phase("scenario", "จะใส่น้ำหอมไปไหนหรือในโอกาสไหนคะ",
    Object.entries(options.scenarios).map(([key, label]) => [label, () => occasion(key, label)]),
    "เช่น ไปคอนเสิร์ต หรืองานแต่งเช้า");
}

function occasionLabel(key) {
  return options.scenarios[key] || options.events[key];
}

function occasion(key, label) {
  context.scenario = key;
  bubble(label, true);
  if (editing) return editMenu();
  return mode === "owned" ? askOwned() : askMoods();
}

function itemLabel(item) {
  const label = item.name.toLowerCase().startsWith(item.brand.toLowerCase() + " ") ? item.name : item.brand + " " + item.name;
  return label + (item.edition ? " · " + item.edition : "");
}

function askOwned() {
  searchItems = [];
  searchTerm = "";
  searchOffset = null;
  phase("owned", "มีขวดไหนอยู่บ้างคะ พิมพ์ชื่อแล้วเลือกรุ่นที่ตรงกับขวดของคุณค่ะ", [], "ชื่อขวดที่มี เช่น CK One");
  renderOwned();
}

function renderOwned() {
  const box = node("section", "", "widget");
  if (owned.size) {
    box.append(node("h3", "ขวดที่เลือก (" + owned.size + ")"));
    const selected = node("div", "", "chips");
    for (const item of owned.values()) selected.append(button(itemLabel(item) + " ×", () => {
      owned.delete(item.id);
      renderOwned();
    }));
    box.append(selected);
  }
  if (searchTerm && !searchItems.length) box.append(node("p", "ยังไม่เจอชื่อนี้ ลองชื่อรุ่นแบบสั้น ๆ ค่ะ", "sub"));
  if (searchItems.length) {
    box.append(node("h3", "เลือกรุ่นที่ตรงกับขวดของคุณ"));
    const results = node("div", "", "chips");
    for (const item of searchItems) results.append(button(itemLabel(item), () => {
      if (owned.size >= 10 && !owned.has(item.id)) return error("เลือกได้ไม่เกิน 10 ขวดค่ะ");
      owned.set(item.id, item);
      searchItems = [];
      searchTerm = "";
      searchOffset = null;
      $("text").value = "";
      renderOwned();
      $("text").focus();
    }));
    if (searchOffset !== null) results.append(button("ดูเพิ่ม", () => search(searchTerm, true)));
    box.append(results);
  }
  panel(owned.size || searchTerm ? box : null);
  controls(owned.size ? [["ใช้ขวดที่เลือก", () => {
    bubble([...owned.values()].map(itemLabel).join("\n"), true);
    return editing ? editMenu() : context.families.length ? afterMoods() : askMoods();
  }]] : [], "ชื่อขวดที่มี เช่น CK One");
  scrollBottom();
}

function search(text, append = false) {
  if (text.length < 2) return error("พิมพ์ชื่ออย่างน้อย 2 ตัวอักษรค่ะ");
  return run(async () => {
    const result = await request("/owned/search?q=" + encodeURIComponent(text) + "&offset=" + (append ? searchOffset : 0));
    searchTerm = text;
    searchOffset = result.next_offset;
    searchItems = append ? [...searchItems, ...result.items] : result.items;
    renderOwned();
  });
}

function askMoods() {
  moods.clear();
  context.families.forEach(key => moods.add(key));
  phase("mood", "ชอบแนวกลิ่นไหนคะ");
  controls([], "เช่น ชอบกลิ่นผ้าสะอาด หรือกลิ่นวานิลลา");
  renderMoods();
  requestAnimationFrame(() => $("active-panel").scrollIntoView({block: "start"}));
}

function renderMoods() {
  const box = node("section", "", "widget family-picker");
  box.setAttribute("aria-labelledby", "family-heading");
  const heading = node("h3", "เลือกได้ 1–2 แนว");
  heading.id = "family-heading";
  const grid = node("div", "", "families");
  for (const [key, label] of Object.entries(options.families)) {
    const pick = button("", () => {
      if (!moods.has(key) && moods.size === 2) return error("เลือกได้ 2 โทนค่ะ เอาโทนเดิมออกก่อน");
      if (moods.has(key)) moods.delete(key); else moods.add(key);
      error();
      renderMoods();
      $("active-panel").querySelector('[data-mood="' + key + '"]')?.focus({preventScroll: true});
    }, "fam c-" + key);
    pick.dataset.mood = key;
    pick.setAttribute("aria-pressed", String(moods.has(key)));
    const swatch = node("span", "", "swatch");
    swatch.setAttribute("aria-hidden", "true");
    pick.append(swatch, node("b", label), node("small", options.family_notes[key], "family-notes"),
      node("small", options.family_examples[key], "family-example"));
    grid.append(pick);
  }
  const unsure = button("", () => setMoods([], "ยังไม่แน่ใจ"), "fam unsure");
  unsure.append(node("b", "ยังไม่แน่ใจ"), node("small", mode === "owned"
    ? "เทียบขวดที่มีตามโอกาส โดยยังไม่ระบุแนวกลิ่น"
    : "ให้ Senna เลือกขวดต่างแนวมาให้ลองเทียบ"));
  grid.append(unsure);
  const end = node("div", "", "row-end");
  const confirm = button("เลือกแนวนี้", () => {
    setMoods([...moods], [...moods].map(key => options.families[key]).join(" และ "));
  }, "btn");
  confirm.disabled = !moods.size;
  end.append(confirm);
  box.append(heading, grid, end);
  if (outfit) {
    box.append(outfitPreview(suggested => setMoods(suggested, suggested.map(key => options.families[key]).join(" และ ")), renderMoods));
  }
  panel(box);
}

function outfitPreview(useFamilies, refresh) {
  const hint = node("div", "", "outfit-hint");
  const img = document.createElement("img");
  img.className = "outfit-preview";
  img.src = outfit.preview;
  img.alt = "ตัวอย่างบริเวณที่อ่านโทนสี";
  const suggested = outfit.palette?.families || [];
  hint.append(img, node("p", outfit.palette
    ? "ภาพส่วนกลางออก" + outfit.palette.label + " ลองจับคู่กับ " + suggested.map(key => options.families[key]).join(" และ ") + " ไหมคะ"
    : "ภาพมีหลายโทนจนยังจับคู่กลิ่นไม่ได้ค่ะ"));
  if (suggested.length) hint.append(button(step === "outfit" && context.families.length ? "เปลี่ยนแนวตามรูป" : "ใช้แนวที่เสนอ",
    () => useFamilies(suggested)));
  hint.append(button("เอารูปออก", () => { outfit = null; refresh(); }));
  return hint;
}

function setMoods(keys, label) {
  context.families = keys;
  delete context.similar_to;
  bubble(label, true);
  if (editing) return editMenu();
  if (!keys.length && mode === "new") bubble("ได้ค่ะ เดี๋ยวลองเลือกตัวอย่างจากคนละโทนมาให้เทียบกัน");
  afterMoods();
}

function afterMoods() {
  return context.sillage === null ? askSillage() : afterSillage();
}

function afterSillage() {
  if (mode === "owned") return askOutfit();
  return context.min_baht || context.max_baht ? askGender() : askBudget();
}

function choice(field, value, label, next) {
  context[field] = value;
  if (field === "sillage") delete context.verified_sillage_only;
  bubble(label, true);
  return editing ? editMenu() : next();
}

function askSillage() {
  phase("sillage", "อยากให้กลิ่นไปถึงคนรอบตัวแค่ไหนคะ");
  const box = node("section", "", "widget advisor-sillage");
  box.append(node("h3", "กลิ่นไปถึงคนรอบตัวแค่ไหน"),
    node("p", "จุดเข้มคือคุณ จุดจางคือคนรอบข้าง", "sub"));
  const grid = node("div", "", "sillage");
  const next = afterSillage;
  for (const [i, [label, description]] of [
    ["เบา", "ต้องเข้ามาใกล้ถึงได้กลิ่น"], ["ปานกลาง", "คนที่อยู่ใกล้ได้กลิ่น"], ["ชัด", "กลิ่นกระจายให้คนรอบข้างรับรู้"],
  ].entries()) {
    const pick = button("", () => choice("sillage", i, label, next), "sil");
    pick.setAttribute("aria-pressed", String(context.sillage === i));
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 120 96");
    svg.setAttribute("aria-hidden", "true");
    const circle = (cx, cy, r, css, far = false) => {
      const el = document.createElementNS(svg.namespaceURI, "circle");
      for (const [key, value] of Object.entries({cx, cy, r, class: css})) el.setAttribute(key, value);
      if (far) el.setAttribute("data-far", "1");
      svg.append(el);
    };
    [16, 30, 44].forEach((r, level) => circle(60, 48, r, level === i ? "ring on" : "ring", level > i));
    circle(60, 48, 6, "me");
    circle(60 + [14, 26, 40][i], 48 - [6, 12, 16][i], 4, "other");
    const words = node("span");
    words.append(node("b", label), node("small", description));
    pick.append(svg, words);
    grid.append(pick);
  }
  box.append(grid);
  panel(box);
  controls([["ยังไม่แน่ใจ", () => choice("sillage", null, "ยังไม่แน่ใจเรื่องการกระจายกลิ่น", next)]], "เช่น เบา ๆ ไม่ฉุน");
  scrollBottom();
}

function setBudget(tier, bounds, label) {
  context.min_baht = bounds?.min ?? null;
  context.max_baht = bounds?.max ?? null;
  choice("budget", tier, label, askGender);
}

function askBudget() {
  phase("budget", "งบต่อขวดเท่าไหร่คะ เลือกช่วงงบหรือพิมพ์วงเงินได้เลย", [
    ...options.budget.map((label, i) => [label, () => setBudget(i, null, label)]),
    ["ไม่กำหนด", () => setBudget(null, null, "ไม่กำหนดงบ")],
  ], "เช่น 1,500–4,000 บาท");
}

function askGender() {
  phase("gender", "อยากดูน้ำหอมที่วางตลาดเป็นแนวไหนคะ", [
    ["แนวผู้หญิง", () => choice("gender", "women", "แนวผู้หญิง", askOutfit)],
    ["แนวผู้ชาย", () => choice("gender", "men", "แนวผู้ชาย", askOutfit)],
    ["Unisex", () => choice("gender", "unisex", "Unisex", askOutfit)],
    ["ไม่จำกัด", () => choice("gender", null, "ไม่จำกัด", askOutfit)],
  ], "เช่น Unisex");
}

function askOutfit() {
  const label = mode === "owned" ? "ช่วยเลือกจากขวดที่มี" : "ดูขวดที่น่าลอง";
  phase("outfit", "วันนี้จะแต่งตัวสไตล์ไหนคะ? เล่าเพิ่มได้ ไม่บังคับค่ะ", [
    [editing ? "กลับไปปรับข้ออื่น" : label, () => editing ? editMenu() : submit(label)],
    ["ไม่ระบุการแต่งตัว", () => {
      context.styles = [];
      outfit = null;
      if (editing) return editMenu();
      return submit(label);
    }],
  ], "เช่น เสื้อยืดกับกางเกงยีนส์ หรือชุดสูท");
  renderOutfit();
}

function renderOutfit() {
  const box = node("section", "", "widget");
  const group = node("div", "", "extras");
  group.append(node("h3", "สไตล์การแต่งตัว (ไม่เกิน 2)"));
  const choices = node("div", "", "opt");
  for (const style of options.styles) {
    const pick = button(style, () => {
      if (!context.styles.includes(style) && context.styles.length === 2) {
        return error("เลือกได้ 2 สไตล์ค่ะ เอาแบบเดิมออกก่อน");
      }
      context.styles = context.styles.includes(style) ? context.styles.filter(key => key !== style) : [...context.styles, style];
      error();
      renderOutfit();
      $("active-panel").querySelector('[data-style="' + style + '"]')?.focus({preventScroll: true});
    }, "toggle");
    pick.dataset.style = style;
    pick.setAttribute("aria-pressed", String(context.styles.includes(style)));
    choices.append(pick);
  }
  group.append(choices);
  if (outfit) {
    group.append(outfitPreview(suggested => {
      context.families = suggested;
      delete context.similar_to;
      bubble("ใช้แนวจากรูป: " + suggested.map(key => options.families[key]).join(" และ "), true);
      renderOutfit();
      scrollBottom();
    }, renderOutfit));
  }
  box.append(group);
  panel(box);
}

function editMenu() {
  editing = true;
  journey(false);
  const entries = [["โอกาส", askOccasion], ["โทนกลิ่น", askMoods], ["การกระจายกลิ่น", askSillage], ["การแต่งตัว", askOutfit]];
  if (mode === "new") entries.push(["ช่วงงบ", askBudget], ["แนวที่วางตลาด", askGender]);
  else entries.push(["ขวดที่มี", askOwned]);
  entries.push(["ดูผล", () => submit("ดูผลตามที่เลือก")]);
  phase("edit", "อยากปรับข้อไหนคะ ข้ออื่นจะคงไว้ตามเดิมค่ะ", entries);
}

function submit(label) {
  if (mode === "owned" && !owned.size) return askOwned();
  const body = mode === "owned" ? {
    scenario: context.scenario, families: context.families, sillage: context.sillage, styles: context.styles, owned_ids: [...owned.keys()],
  } : {...context};
  return recommend(body, mode === "owned", label);
}

function priceBasis(evidence) {
  const clean = (evidence || "").replace(/\s*\(ความมั่นใจ[^)]*\)/g, "");
  const [grade] = clean.split(":");
  if (grade === "A") return "ราคาอ้างอิงของรุ่นนี้ ไม่ใช่ราคาปัจจุบัน";
  if (grade === "B") return /รุ่นใกล้เคียง|ไลน์เดียวกัน/.test(clean)
    ? "ราคาอ้างอิงจากรุ่นใกล้เคียงหรือไลน์เดียวกัน"
    : "ราคาอ้างอิงเป็นช่วง ควรตรวจราคาขวดนี้อีกครั้ง";
  if (grade === "C") return "ช่วงราคาประมาณจากระดับราคาของแบรนด์";
  if (grade === "D") return "ยังไม่มีราคาอ้างอิงที่ยืนยันได้";
  return clean;
}

function cardFor(item, fromOwned, preferences, sillageFallback = false) {
  const card = node("article", "", "bottle");
  const photo = node("div", "", "photo");
  if (item.image_url && /^https:\/\/fimgs\.net\//i.test(item.image_url)) {
    const img = document.createElement("img");
    img.alt = "";
    img.src = item.image_url;
    img.addEventListener("error", () => photo.replaceChildren(node("span", "ไม่มีรูปขวด")));
    photo.append(img);
  } else photo.append(node("span", "ไม่มีรูปขวด"));
  const body = node("div", "", "bottle-body");
  const facts = node("div", "", "facts");
  for (const text of [item.family, item.sillage + (item.sillage_estimated ? " (ประมาณ)" : ""), item.gender, item.price].filter(Boolean)) {
    facts.append(node("span", text, "fact"));
  }
  body.append(node("p", item.brand, "maker"), node("h3", item.name + (item.edition ? " · " + item.edition : "")),
    facts);
  if (sillageFallback) {
    const requested = ["กลิ่นเบา", "กลิ่นปานกลาง", "กลิ่นชัด"][preferences.sillage];
    const change = item.sillage_level < preferences.sillage ? "เบากว่า" : "ชัดกว่า";
    body.append(node("p", "การกระจายกลิ่น" + change + "ที่ขอ: " + item.sillage
      + (item.sillage_estimated ? " (ประมาณ)" : "") + " แทน " + requested, "warn"));
  }
  body.append(node("h4", "กลิ่นประมาณไหน"), node("p", item.scent.summary, "scent"));
  if (item.scent.notes.length) body.append(node("p", "ตัวอย่างโน้ต: " + item.scent.notes.join(" · "), "notes"));
  if (item.assessment) body.append(node("p", item.assessment, "warn"));
  const why = node("details", "", "why");
  const bullets = node("ul");
  for (const reason of [...item.reasons, ...(item.cautions || []), priceBasis(item.price_evidence)].filter(Boolean)) bullets.append(node("li", reason));
  why.append(node("summary", "ทำไมถึงแนะนำ"), bullets);
  const foot = node("div", "", "foot");
  if (item.url && /^https:\/\//i.test(item.url)) {
    const link = node("a", "ดูข้อมูลขวดนี้");
    link.href = item.url;
    link.rel = "noopener noreferrer";
    link.target = "_blank";
    foot.append(link);
  }
  foot.append(button(fromOwned ? "เลือกใช้ขวดนี้" : "เลือกไว้ลอง", () => {
    window.SennaAnalytics?.track("select_item", {items: [item]});
    error();
    bubble((fromOwned ? "เลือกใช้ " : "เลือกไว้ลอง ") + itemLabel(item), true);
    if (fromOwned) {
      bubble(item.assessment || "ลองดมบนผิวดูว่าเข้ากับโอกาสนี้ไหมนะคะ");
    } else {
      const clue = item.scent.tones[0];
      const whyTry = item.reasons.find(reason => reason.startsWith("ตรงกับโทนที่เลือก")) || "";
      const watch = clue ? "ลองสังเกตว่า" + clue + "ถูกใจไหม" : "ลองสังเกตว่ากลิ่นโดยรวมเข้ากับคุณไหม";
      const projection = preferences.sillage === 0 ? " และยังอยู่ใกล้ตัวตามที่ขอหรือเปล่า"
        : " และฟุ้งพอดีกับโอกาสที่จะใช้ไหม";
      bubble((whyTry ? whyTry + " ค่ะ " : "") + "ลองฉีดบนผิวแล้วรอให้กลิ่นเซ็ตตัวก่อนนะคะ "
        + watch + projection + " ยังไม่ต้องตัดสินใจซื้อจากคำบรรยายอย่างเดียวค่ะ");
    }
    scrollBottom();
  }, "btn quiet"));
  if (!fromOwned) foot.append(button("ขอแนวคล้ายขวดนี้", () => {
    window.SennaAnalytics?.track("similar_request", {items: [item]});
    const {exclude = [], ...filters} = preferences;
    recommend({...filters, similar_to: item.id, allow_sillage_fallback: true, exclude: [...new Set([...exclude, ...seen])]},
      false, "ขอแนวคล้าย " + itemLabel(item), true);
  }, "btn quiet"));
  for (const shop of item.shopping_links || []) {
    const url = new URL(shop.url);
    if (url.protocol !== "https:") continue;
    const link = node("a", shop.label, "shop-link");
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.addEventListener("click", () => window.SennaAnalytics?.track("shop_click", {items: [item], kind: shop.kind}));
    foot.append(link, node("small", shop.note, "shop-note"));
  }
  body.append(why, foot);
  card.append(photo, body);
  return card;
}

function scentComparison(comparison, items, fromOwned) {
  if (!comparison) return null;
  const message = bubble("");
  message.classList.add("scent-comparison");
  const content = message.querySelector(".bubble");
  content.append(node("strong", comparison.partial_set ? "เทียบกลิ่นสามขวดแรก" : "แต่ละขวดต่างกันยังไง"));
  if (comparison.shared.length) {
    content.append(node("p", "โทนที่มีร่วมกัน: " + comparison.shared.join(" และ ")));
  }
  const list = node("ul");
  for (const contrast of comparison.contrasts) {
    const item = items.find(card => card.id === contrast.id);
    if (!item) continue;
    const row = node("li");
    const hint = contrast.tones.length
      ? "ถ้าอยากได้" + contrast.tones.join("กับ") + " ขวดนี้น่า" + (fromOwned ? "หยิบใช้ค่ะ" : "ลองก่อนค่ะ")
      : contrast.has_profile ? "จากข้อมูลที่มี ยังแยกโทนจากขวดอื่นในชุดนี้ได้ไม่ชัดค่ะ"
        : "ข้อมูลกลิ่นยังไม่พอให้เทียบค่ะ";
    row.append(node("strong", item.name + (item.edition ? " · " + item.edition : "")), node("p", hint));
    list.append(row);
  }
  content.append(list);
  return message;
}

function resultActions() {
  const actions = [["ปรับความต้องการ", editMenu]];
  if (showingOwned) actions.unshift(["ดูขวดใหม่เพิ่มเติม", () => refine("other")]);
  else {
    const prices = lastItems.map(item => item.price_tier).filter(Number.isInteger);
    if (lastItems.every(item => item.sillage_level > 0)) actions.unshift(["ขอแบบกลิ่นเบากว่า", () => refine("lighter")]);
    if (prices.length && Math.min(...prices) > 0) actions.unshift(["ขอแบบราคาต่ำกว่า", () => refine("cheaper")]);
    if (hasMore) actions.push(["ดูขวดอื่น", () => refine("other")]);
  }
  controls(actions, "เช่น ขอแบบเบากว่า หรือดูขวดอื่น");
}

function recommend(body, fromOwned, label, refining = false) {
  return run(async () => {
    const data = await request(fromOwned ? "/owned" : "/discover", body);
    const sillageFallback = data.sillage_fallback === true;
    if (!fromOwned && !refining && !data.items.length && body.families.length) {
      const families = body.families.map(key => options.families[key]).join(" / ");
      bubble(label, true);
      bubble("ยังไม่เจอขวดที่มีแนวหลักเป็น " + families + " และตรงกับเงื่อนไขทั้งหมดค่ะ"
        + " ลองปรับการกระจายกลิ่น งบ หรือแนวที่วางตลาด โดยเก็บแนวกลิ่นเดิมไว้ได้ค่ะ"
        + (body.min_baht || body.max_baht ? " งบที่พิมพ์จะเทียบเฉพาะขวดที่มีราคาอ้างอิงของรุ่นตรงค่ะ" : ""));
      panel();
      controls([["ปรับความต้องการ", editMenu]]);
      scrollBottom();
      return;
    }
    if (!data.items.length) return error(refining
      ? (body.similar_to ? "ยังไม่เจอขวดใหม่ที่คล้ายกันในเงื่อนไขนี้ค่ะ ลองปรับความต้องการได้"
        : "ไม่มีขวดเพิ่มที่ตรงเงื่อนไขนี้ค่ะ ผลเดิมยังอยู่ หรือจะปรับความต้องการก็ได้")
      : "ยังไม่พบขวดที่ตรงทุกเงื่อนไขค่ะ ลองปรับแนวกลิ่น การกระจาย งบ หรือแนวที่วางตลาด"
        + (body.min_baht || body.max_baht ? " งบที่พิมพ์จะเทียบเฉพาะขวดที่มีราคาอ้างอิงของรุ่นตรงค่ะ" : ""));
    editing = false;
    step = "result";
    showingOwned = fromOwned;
    lastContext = body;
    lastItems = data.items;
    window.SennaAnalytics?.track("view_item_list", {items: lastItems});
    hasMore = data.has_more === true;
    seen = [...new Set([...(refining ? seen : []), ...lastItems.map(item => item.id)])];
    if (!fromOwned && mode === "new") {
      const {exclude, allow_sillage_fallback, ...preferences} = body;
      context = preferences;
    }
    panel();
    journey(true);
    bubble(label, true);
    bubble(fromOwned ? "ลองดูว่าขวดที่มีเหมาะกับโจทย์นี้แค่ไหนนะคะ" : sillageFallback ?
      "ยังไม่เจอขวดคล้ายที่กระจายกลิ่นระดับเดิมค่ะ ชุดนี้เป็นแนวหลักเดียวกันและมีโน้ตร่วมกับขวดอ้างอิง แต่การกระจายต่างกันหนึ่งระดับ เงื่อนไขอื่นยังเหมือนเดิมค่ะ" : body.similar_to ?
      "เจอขวดอื่นที่มีแนวกลิ่นหรือโน้ตคล้ายกัน โดยยังใช้เงื่อนไขเดิมค่ะ" : data.explore ?
      (data.items.length > 1 ? "ลองเทียบขวดคนละโทนจากชุดนี้นะคะ" : "เจอหนึ่งขวดที่เข้ากับเงื่อนไขนี้ค่ะ") :
      "ลองดูขวดที่เข้ากับโจทย์นี้นะคะ");
    if (!fromOwned && !hasMore && !sillageFallback) bubble("นี่คือขวดที่ยังตรงกับเงื่อนไขนี้ทั้งหมดค่ะ ปรับความต้องการได้ถ้าอยากดูเพิ่ม");
    const comparison = scentComparison(data.scent_comparison, lastItems, fromOwned);
    const wrap = node("section", "", "shelf-wrap");
    wrap.setAttribute("aria-label", "คำแนะนำ");
    const title = node("div", "", "shelf-title");
    title.append(node("b", fromOwned ? "ขวดที่มี" : sillageFallback ? "ขวดคล้ายที่การกระจายต่างกัน" : "ขวดที่น่าลอง"),
      node("span", lastItems.length + " ขวด"));
    const shelf = node("div", "", "shelf");
    shelf.tabIndex = 0;
    shelf.setAttribute("aria-label", "เลื่อนดูขวด");
    shelf.append(...lastItems.map(item => cardFor(item, fromOwned, body, sillageFallback)));
    wrap.append(title, shelf);
    $("messages").append(wrap);
    resultActions();
    requestAnimationFrame(() => (comparison || wrap).scrollIntoView({block: "start"}));
  });
}

function refine(action) {
  const {owned_ids, ...previous} = lastContext;
  if (action === "other" && !showingOwned && !hasMore) return error("ดูขวดที่ตรงเงื่อนไขนี้ครบแล้วค่ะ ลองปรับความต้องการเพื่อดูตัวเลือกเพิ่ม");
  const body = {...previous, exclude: [...new Set([...(owned_ids || owned.keys()), ...seen])]};
  let label = showingOwned ? "ดูขวดใหม่เพิ่มเติม" : "ดูขวดอื่น";
  if (action === "lighter") {
    body.sillage = Math.min(...lastItems.map(item => item.sillage_level)) - 1;
    if (!(body.sillage >= 0)) return error("ชุดนี้มีขวดระดับเบาสุดอยู่แล้วค่ะ");
    body.verified_sillage_only = true;
    body.allow_sillage_fallback = false;
    label = "ขอกลิ่นเบากว่า";
  } else if (action === "cheaper") {
    const exact = lastItems.map(item => item.reference_baht).filter(Number.isInteger);
    const prices = lastItems.map(item => item.price_tier).filter(Number.isInteger);
    if (exact.length === lastItems.length) {
      const ceiling = Math.min(...exact) - 1;
      if (ceiling < (body.min_baht || 1)) return error("ไม่มีช่วงราคาต่ำกว่านี้ในงบเดิมค่ะ ลองปรับช่วงงบ");
      body.max_baht = ceiling;
    } else {
      body.budget = Math.min(...prices) - 1;
      if (!prices.length || body.budget < 0) return error("ยังไม่มีช่วงราคาที่ต่ำกว่าขวดที่แสดงค่ะ");
    }
    label = "ขอราคาต่ำกว่า";
  }
  recommend(body, false, label, true);
}

function readMessage(text) {
  if (step === "goal") {
    const current = /ขวดที่มี|ขวดเดิม|มีอยู่แล้ว/.test(text);
    const brief = parseAdvisorBrief(text);
    if (current || brief.scenario || /ขวดใหม่|หาใหม่/.test(text)) return goal(current ? "owned" : "new", text, brief);
  }
  if (step === "scenario") {
    const brief = parseAdvisorBrief(text);
    if (brief.scenario) { bubble(text, true); return applyBrief(brief, text); }
    if (/งานเลี้ยง|ปาร์ตี้|เที่ยว|\bparty\b/i.test(text)) {
      return error("โอกาสนี้ใกล้กับตัวเลือกไหนคะ เลือกจากด้านล่างได้เลย");
    }
  }
  if (step === "owned") return search(text);
  if (step === "mood") {
    if (/ไม่แน่ใจ|ไม่รู้|ไม่กำหนด/.test(text)) return setMoods([], "ยังไม่แน่ใจ");
    const rules = {musk: /ผ้าสะอาด|สบู่|มัสก์|แป้ง/, citrus: /เปลือกส้ม|ซิตรัส|มะนาว|ส้ม/,
      aquatic: /ทะเล|ละอองน้ำ/, gourmand: /วานิลลา|ขนม|หวาน/, floral: /ดอกไม้|กุหลาบ|มะลิ/,
      woody: /ไม้แห้ง|ซีดาร์|ไม้หอม/, green: /ใบไม้|ชาเขียว|หญ้า/, amber: /อำพัน|ยางไม้/, spicy: /เครื่องเทศ|อบเชย|กระวาน/};
    const keys = Object.keys(rules).filter(key => rules[key].test(text));
    if (keys.length && keys.length <= 2 && !/ไม่เอา|ไม่ชอบ|ไม่หวาน|ไม่อยาก/.test(text)) {
      return setMoods(keys, keys.map(key => options.families[key]).join(" และ "));
    }
  }
  if (step === "sillage") {
    const value = /เบา|ใกล้ตัว|ไม่ฉุน|ไม่ฟุ้ง|ไม่แรง/.test(text) ? 0 : /ปานกลาง|กลาง ๆ/.test(text) ? 1 : /ชัด|แรง|ฟุ้ง/.test(text) ? 2 : null;
    if (value !== null || /ไม่กำหนด|ไม่แน่ใจ/.test(text)) {
      return choice("sillage", value, value === null ? "ไม่กำหนดระดับกลิ่น" : options.sillage[value],
        afterSillage);
    }
  }
  if (step === "budget") {
    if (/ไม่กำหนด|ไม่แน่ใจ|ไม่จำกัด/.test(text)) return setBudget(null, null, "ไม่กำหนดงบ");
    const bounds = parseAdvisorBudget(text);
    if (!bounds) return error("ลองพิมพ์ 1,500–4,000 บาท หรือไม่เกิน 2,500 บาท โดยให้ตัวเลขอยู่ระหว่าง 1 ถึง 1,000,000 ค่ะ");
    return setBudget(null, bounds, budgetLabel(bounds));
  }
  if (step === "gender") {
    if (/^(unisex|ยูนิเซ็กซ์)$/i.test(text)) return choice("gender", "unisex", "Unisex", askOutfit);
    if (/^(ไม่จำกัด|ได้ทุกเพศ)$/.test(text)) return choice("gender", null, "ไม่จำกัด", askOutfit);
  }
  if (step === "outfit") {
    if (/^(ข้าม|ไม่ระบุ|ไม่แน่ใจ)$/.test(text)) {
      context.styles = [];
      outfit = null;
      return editing ? editMenu() : submit(mode === "owned" ? "ช่วยเลือกจากขวดที่มี" : "ดูขวดที่น่าลอง");
    }
    const styles = findOutfitStyles(text);
    if (!styles.length) return error("ยังจับสไตล์จากข้อความนี้ไม่ได้ค่ะ เลือกสไตล์ แนบรูป หรือข้ามได้เลย");
    context.styles = styles;
    bubble(text, true);
    bubble("เข้าใจว่าเป็นสไตล์ " + styles.join(" / ") + " นะคะ");
    $("text").value = "";
    renderOutfit();
    return scrollBottom();
  }
  if (step === "result") {
    if (!showingOwned && /เบา/.test(text)) return refine("lighter");
    if (!showingOwned && /ถูก|ราคาต่ำ/.test(text)) return refine("cheaper");
    if (/ขวดอื่น|ขวดใหม่|ตัวอื่น/.test(text)) return refine("other");
    if (/ปรับ|แก้|เปลี่ยน/.test(text)) return editMenu();
  }
  error("ยังจับคำตอบไม่ได้ค่ะ ลองแตะตัวเลือกด้านล่างนะคะ");
}

$("reply").addEventListener("submit", event => {
  event.preventDefault();
  const text = $("text").value.trim();
  if (text && !busy) { error(); readMessage(text); }
});
$("attach-outfit").addEventListener("click", () => {
  if (!busy && ["mood", "outfit"].includes(step)) $("outfit-file").click();
});
$("outfit-file").addEventListener("change", event => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file || !["mood", "outfit"].includes(step)) return;
  run(async () => {
    outfit = await readOutfitPalette(file);
    if (step === "outfit") renderOutfit(); else renderMoods();
    scrollBottom();
  });
});
$("restart").addEventListener("click", start);
request("/options").then(data => {
  options = data;
  $("restart").disabled = false;
  start();
}).catch(err => error(err.message));
