"use strict";

function ownedContext() {
  const o = d.ownedChat;
  return {owned_ids: o.items.map(it => it.id), scenario: o.scenario, families: o.families, sillage: o.sillage};
}
function finishOwnedPreferences() {
  const o = d.ownedChat;
  if (o.items.length > 1 && config.mode === "pilot") ownedStep("trial-choice");
  else compareOwnedChat();
}
function ownedTrialApi(path, method = "GET", body) {
  const t = d.ownedChat.trial;
  return api(`/owned-study/sessions/${t.id}${path}`, {method,
    headers: {Authorization: `Bearer ${t.secret}`}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
}
async function offerOwnedTrial() {
  await run(async () => {
    const trialConfig = await api("/owned-study/config");
    if (!trialConfig.available) throw new Error("การเปรียบเทียบเลือกใช้ยังไม่เปิดเก็บจริงค่ะ");
    d.ownedChat.trialConfig = trialConfig; ownedStep("trial-consent");
  });
}
async function generateOwnedTrial() {
  const o = d.ownedChat;
  o.stage = "trial-loading"; save(); render();
  try {
    o.trial.server = await ownedTrialApi("/recommend", "POST", {});
    o.stage = "trial-first"; save();
  } catch (error) { o.stage = "trial-ready"; save(); throw error; }
}
async function startOwnedTrial() {
  const o = d.ownedChat;
  if (!o.trial || o.trial.server?.state === "complete") {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    o.trial = {id: crypto.randomUUID(), secret: Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(""), answers: {}};
    save();
  }
  o.trial.server = await api("/owned-study/sessions", {method: "POST", body: JSON.stringify({
    request_id: o.trial.id, client_secret: o.trial.secret, consent: true, eligible: true, context: ownedContext(),
  })});
  o.stage = "trial-pre"; save();
}
async function withdrawOwnedTrial(ask = true) {
  const o = d.ownedChat;
  if (!o?.trial?.secret) return true;
  if (ask && !confirm("ถอนตัวและลบผลทดลองเลือกใช้ขวดที่มีรอบนี้หรือไม่")) return false;
  try { await ownedTrialApi("", "DELETE"); }
  catch (error) { if (error.status !== 404) throw error; }
  delete o.trial; delete o.result; o.stage = "sillage"; save();
  return true;
}
async function resumeOwnedTrial() {
  const o = d.ownedChat, t = o?.trial;
  if (!t?.secret || t.server?.state === "complete" || !o.stage.startsWith("trial-")) return;
  t.server = await ownedTrialApi("");
  if (t.server.state === "withdrawn") { delete o.trial; o.stage = "sillage"; }
  else if (t.server.state === "intake") o.stage = "trial-pre";
  else if (t.server.state === "pre_ready") o.stage = "trial-ready";
  else if (t.server.state === "recommended") o.stage = t.secondShown ? "trial-ratings" : "trial-first";
  else if (t.server.state === "complete") { o.result = t.server.advice; t.completedContext = JSON.stringify(ownedContext()); o.stage = "result"; }
  else o.stage = "trial-wait";
  save();
}
function buildOwnedTrial(B, C, o) {
  const st = o.stage, t = o.trial;
  if (st === "trial-choice") {
    B.push(senna("จะดูคำแนะนำเลย หรือร่วมทดลองเปรียบเทียบสองชุดจากขวดที่มีคะ การร่วมทดลองเป็นทางเลือกค่ะ"));
    C.chips = [{label: "ดูคำแนะนำเลย", act: compareOwnedChat}, {label: "ร่วมทดลองเปรียบเทียบ", act: offerOwnedTrial}];
    return {B, C};
  }
  if (st === "trial-consent") {
    const c = o.trialConfig;
    B.push(widget(`<form id="owned-consent-form" class="consent"><h3>ทดลองเลือกใช้ขวดที่มี</h3><ul>
      <li>เปรียบเทียบสองวิธีจัดอันดับจากขวดที่คุณเลือก ใช้เวลาประมาณ 3–5 นาที เป็น pilot แยกจากการเลือกซื้อ</li>
      <li>เก็บรหัสผู้เข้าร่วม รุ่นที่เลือก โอกาส แนวกลิ่น ระดับการกระจาย คะแนนก่อน–หลัง คะแนนสองชุด และเวลา ไม่ขอชื่อหรือเบอร์โทร</li>
      <li>คำนวณจากฐานข้อมูล ไม่ส่งข้อมูลรอบนี้ไปยัง LLM คะแนนสะท้อนการรับรู้ ไม่ได้ยืนยันกลิ่นจริง</li>
      <li>เข้าร่วมหรือหยุดได้โดยสมัครใจ ถอนตัวและลบผลรอบนี้ได้จากเมนู หากปิดแท็บแล้วติดต่อผู้วิจัยพร้อมรหัสรอบทดลอง</li>
      <li>เก็บข้อมูลถึง ${esc(c.retention_until || config.retention_until)} ติดต่อผ่าน${esc(c.contact || "ช่องทางที่ได้รับลิงก์เชิญ")}</li>
      <li>ผู้ให้บริการเว็บไซต์และรูปภาพอาจมีบันทึกการเชื่อมต่อเพื่อความปลอดภัย</li></ul>
      <label class="check"><input type="checkbox" name="eligible" required><span>ฉันอายุ 18–50 ปี สัญชาติไทย และสนใจน้ำหอม</span></label>
      <label class="check"><input type="checkbox" name="consent" required><span>ฉันอ่านแล้วและยินยอมร่วมทดลองเลือกใช้</span></label>
      <button type="submit" class="btn">ยินยอมร่วมทดลองเลือกใช้</button></form>`));
    C.chips = [{label: "ไม่ร่วมทดลอง ดูคำแนะนำเลย", act: compareOwnedChat, soft: true}];
    return {B, C};
  }
  const questions = o.trialConfig.confidence;
  if (st === "trial-pre") {
    B.push(checkin("owned-pre-form", "ก่อนดูคำแนะนำ", "เมื่อเลือกใช้ขวดที่มี คุณรู้สึกอย่างไร", questions.map((q, i) => [`owned_pre${i}`, q]), t.preAnswers, "ดูคำแนะนำสองชุด"));
    return {B, C};
  }
  if (["trial-ready", "trial-wait"].includes(st)) {
    B.push(senna("บันทึกคำตอบก่อนใช้แล้วค่ะ"));
    C.chips = [{label: st === "trial-wait" ? "ตรวจสถานะอีกครั้ง" : "ดูคำแนะนำสองชุด", act: () => run(st === "trial-wait" ? resumeOwnedTrial : generateOwnedTrial)}];
    return {B, C};
  }
  if (st === "trial-loading") { B.push({kind: "typing", html: typingHTML()}); return {B, C}; }
  const sets = t.server.sets, shared = t.secondShown ? compareSets(sets).shared_item_ids : [];
  B.push(senna("ชุดที่ 1 เป็นการจัดอันดับจากขวดที่คุณมีค่ะ")); B.push(shelf(sets[0], "ชุดที่ 1 · ขวดที่มี", shared));
  if (st === "trial-first") {
    C.chips = [{label: "ดูชุดที่ 2 จากขวดที่มี", act: () => { t.secondShown = true; o.stage = "trial-ratings"; save(); render(); }}];
    return {B, C};
  }
  B.push(senna(comparisonText(compareSets(sets), sets[1].items.length))); B.push(shelf(sets[1], "ชุดที่ 2 · ขวดที่มี", shared));
  if (st === "trial-ratings") {
    B.push(checkin("owned-ratings-form", "ความตรงใจในการเลือกใช้", "สองชุดช่วยเลือกขวดสำหรับโอกาสนี้แค่ไหน", RELEVANCE, t.answers, "บันทึกคะแนนสองชุด"));
    return {B, C};
  }
  B.push(checkin("owned-post-form", "หลังดูคำแนะนำ", "ตอนนี้คุณรู้สึกอย่างไร", [
    ...questions.map((q, i) => [`owned_post${i}`, q]), ["owned_usefulness", "คำแนะนำช่วยให้ฉันตัดสินใจเลือกใช้จากขวดที่มีได้"],
  ], t.answers, "ส่งผลทดลองเลือกใช้"));
  return {B, C};
}
async function markOwnedViewed(slot) {
  const t = d.ownedChat?.trial;
  if (t?.server?.state !== "recommended" || t.server.viewed?.[slot]) return;
  try {
    const result = await ownedTrialApi("/view", "POST", {slot});
    if (d.ownedChat?.trial === t) { t.server.viewed = result.viewed; save(); }
  } catch {}
}
function wireOwnedTrial() {
  const o = d.ownedChat, t = o.trial;
  const consent = $("#owned-consent-form");
  if (consent) consent.onsubmit = event => { event.preventDefault(); if (consent.reportValidity()) run(startOwnedTrial); };
  const pre = $("#owned-pre-form");
  if (pre) pre.onsubmit = event => {
    event.preventDefault(); const values = readScale(pre, [0, 1, 2].map(i => `owned_pre${i}`)); if (!values) return;
    t.preAnswers = values; save();
    run(async () => { t.server = await ownedTrialApi("/pre", "PUT", {scores: [0, 1, 2].map(i => values[`owned_pre${i}`])}); await generateOwnedTrial(); });
  };
  const ratings = $("#owned-ratings-form");
  if (ratings) ratings.onsubmit = event => {
    event.preventDefault(); const values = readScale(ratings, RELEVANCE.map(x => x[0])); if (!values) return;
    t.answers = {...t.answers, ...values}; o.stage = "trial-post"; save(); render();
  };
  const post = $("#owned-post-form");
  if (post) post.onsubmit = event => {
    event.preventDefault(); const values = readScale(post, [...[0, 1, 2].map(i => `owned_post${i}`), "owned_usefulness"]); if (!values) return;
    t.answers = {...t.answers, ...values}; save();
    run(async () => {
      t.server = await ownedTrialApi("/complete", "POST", {post: [0, 1, 2].map(i => t.answers[`owned_post${i}`]),
        relevance_first: t.answers.relevance_first, relevance_second: t.answers.relevance_second, usefulness: t.answers.owned_usefulness});
      o.result = t.server.advice; t.completedContext = JSON.stringify(ownedContext()); o.stage = "result"; save();
    });
  };
  if (t?.server?.state === "recommended") {
    markOwnedViewed("first"); if (t.secondShown) markOwnedViewed("second");
  }
  thread.querySelectorAll(".bottle img").forEach(img => img.onerror = () => { img.hidden = true; });
}

function requestOwnedAlternatives() {
  const o = d.ownedChat;
  if (o.trial?.server && o.trial.server.state !== "complete") return;
  if (!o.budgetSet) { o.stage = "alternatives-budget"; lastError = ""; save(); render(); }
  else fetchOwnedAlternatives();
}
function fetchOwnedAlternatives() {
  const o = d.ownedChat;
  run(async () => {
    o.stage = "alternatives-loading"; save(); render();
    try {
      o.alternatives = await api("/wardrobe/alternatives", {method: "POST", body: JSON.stringify({...ownedContext(), budget: o.budget ?? null})});
      o.stage = "alternatives-result"; save();
    } catch (error) { o.stage = "alternatives-budget"; save(); throw error; }
  });
}
function buildOwnedAlternatives(B, C, o) {
  if (o.stage === "alternatives-budget") {
    B.push(senna('<div id="alternatives-answer">อยากดูขวดอื่นเพิ่มเติม งบต่อขวดประมาณเท่าไรคะ</div>'));
    C.chips = config.budget.map((label, i) => ({label, act: () => { o.budget = i === 3 ? null : i; o.budgetSet = true; fetchOwnedAlternatives(); }}));
    C.chips.push({label: "กลับไปขวดที่มี", soft: true, act: () => { o.stage = "result"; save(); render(); }});
    return {B, C};
  }
  if (o.stage === "alternatives-loading") { B.push({kind: "typing", html: typingHTML()}); return {B, C}; }
  if (o.stage !== "alternatives-result") return null;
  B.push(senna('<div id="alternatives-answer">นี่คือตัวเลือกนอกขวดที่มีค่ะ ดูเหตุผลเทียบกับขวดเดิมประกอบได้ ยังไม่จำเป็นต้องซื้อใหม่</div>'));
  for (const item of o.alternatives.items) {
    B.push(senna(`<p>${esc(perfumeLabel(item))}</p>${item.differences.map(text => `<p>${esc(text)}</p>`).join("")}`));
  }
  B.push(shelf({items: o.alternatives.items}, "ตัวเลือกเพิ่มเติม · ไม่ใช่ชุดทดลอง A/B"));
  C.chips = [{label: "เลือกใช้ขวดเดิม", act: chooseExistingBottle}, {label: "เปลี่ยนงบ", act: () => { o.budgetSet = false; requestOwnedAlternatives(); }},
    {label: "เปลี่ยนโอกาสใช้งาน", act: () => ownedStep("scenario")}];
  return {B, C};
}
function chooseExistingBottle() {
  const o = d.ownedChat; o.stage = "result"; o.useExisting = true; save(); render();
}
