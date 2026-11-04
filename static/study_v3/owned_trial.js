"use strict";

const FOLLOWUP_TASK = "discovery_after_owned";
function decisionTask() { return d.ownedChat.activeTrialTask || "owned_use"; }
function decisionTrial(task = decisionTask()) { return d.ownedChat[task === FOLLOWUP_TASK ? "followupTrial" : "trial"]; }
function decisionConfig() { return d.ownedChat[decisionTask() === FOLLOWUP_TASK ? "followupTrialConfig" : "trialConfig"]; }
function decisionContext() { return {...ownedContext(), ...(decisionTask() === FOLLOWUP_TASK ? {budget: d.ownedChat.budget ?? null} : {})}; }

function ownedContext() {
  const o = d.ownedChat;
  return {owned_ids: o.items.map(it => it.id), scenario: o.scenario, families: o.families, sillage: o.sillage};
}
function finishOwnedPreferences() {
  const o = d.ownedChat;
  if (o.result?.items?.length) o.privateAdviceSeen = true;
  o.activeTrialTask = "owned_use";
  if (o.items.length > 1 && config.mode === "pilot") return offerOwnedTrial();
  else compareOwnedChat();
}
function ownedTrialApi(path, method = "GET", body, task = decisionTask()) {
  const t = decisionTrial(task);
  return api(`/owned-study/sessions/${t.id}${path}`, {method,
    headers: {Authorization: `Bearer ${t.secret}`}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
}
async function offerOwnedTrial() {
  await run(async () => {
    const t = decisionTrial();
    if (t?.server && t.server.state !== "complete") {
      d.ownedChat.stage = "trial-wait";
      await resumeOwnedTrial();
      return;
    }
    const trialConfig = await api(`/owned-study/config?task=${decisionTask()}`);
    if (!trialConfig.available) throw new Error("การเปรียบเทียบเลือกใช้ยังไม่เปิดเก็บจริงค่ะ");
    d.ownedChat[decisionTask() === FOLLOWUP_TASK ? "followupTrialConfig" : "trialConfig"] = trialConfig;
    d.ownedChat.stage = "trial-consent"; lastError = ""; save(); render();
  });
}
async function generateOwnedTrial() {
  const o = d.ownedChat;
  o.stage = "trial-loading"; save(); render();
  try {
    decisionTrial().server = await ownedTrialApi("/recommend", "POST", {});
    o.stage = "trial-first"; save();
  } catch (error) { o.stage = "trial-ready"; save(); throw error; }
}
async function startOwnedTrial() {
  const o = d.ownedChat;
  const key = decisionTask() === FOLLOWUP_TASK ? "followupTrial" : "trial";
  if (!o[key] || o[key].server?.state === "complete") {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    o[key] = {id: crypto.randomUUID(), secret: Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(""), answers: {}};
    save();
  }
  const t = decisionTrial();
  t.priorAdviceSeen = decisionTask() === FOLLOWUP_TASK ? !!(o.alternativesSeen || o.alternatives?.items?.length) : !!o.privateAdviceSeen;
  t.server = await api("/owned-study/sessions", {method: "POST", body: JSON.stringify({
    request_id: t.id, client_secret: t.secret, consent: true, eligible: true, task: decisionTask(), context: decisionContext(),
    prior_advice_seen: t.priorAdviceSeen,
  })});
  o.stage = "trial-pre"; save();
}
async function withdrawOwnedTrial(ask = true, task = decisionTask()) {
  const o = d.ownedChat;
  if (!decisionTrial(task)?.secret) return true;
  if (ask && !confirm(task === FOLLOWUP_TASK ? "ถอนตัวและลบผลทดลองขวดใหม่เพิ่มเติมรอบนี้หรือไม่" : "ถอนตัวและลบผลทดลองเลือกใช้ขวดที่มีรอบนี้หรือไม่")) return false;
  try { await ownedTrialApi("", "DELETE", undefined, task); }
  catch (error) { if (error.status !== 404) throw error; }
  delete o[task === FOLLOWUP_TASK ? "followupTrial" : "trial"];
  if (task === decisionTask()) {
    if (task === FOLLOWUP_TASK) { delete o.alternatives; o.stage = "result"; }
    else { delete o.result; o.stage = "sillage"; }
    o.activeTrialTask = "owned_use";
  }
  save();
  return true;
}
async function resumeOwnedTrial() {
  const o = d.ownedChat, t = decisionTrial();
  if (!t?.secret || t.server?.state === "complete" || !o.stage.startsWith("trial-")) return;
  t.server = await ownedTrialApi("");
  if (t.server.state === "withdrawn") { await withdrawOwnedTrial(false); }
  else if (t.server.state === "intake") o.stage = "trial-pre";
  else if (t.server.state === "pre_ready") o.stage = "trial-ready";
  else if (t.server.state === "recommended") o.stage = !t.secondShown ? "trial-first"
    : t.answers?.relevance_first && t.answers?.relevance_second ? "trial-post" : "trial-ratings";
  else if (t.server.state === "complete") finishDecisionTrial();
  else o.stage = "trial-wait";
  save();
}
function buildOwnedTrial(B, C, o) {
  const st = o.stage, t = decisionTrial(), followup = decisionTask() === FOLLOWUP_TASK;
  const steps = ["ยินยอม", "ก่อนใช้", "สองชุด", "หลังใช้"];
  const current = ["trial-choice", "trial-consent"].includes(st) ? 0 : st === "trial-pre" ? 1
    : st === "trial-post" ? 3 : 2;
  B.push(raw(`<ol class="trial-progress" aria-label="ขั้นตอนรอบทดลอง">${steps.map((label, i) => `<li${i === current ? ' aria-current="step"' : ''}>${i + 1}. ${label}</li>`).join("")}</ol>`));
  if (followup) B.push(senna(`พิจารณาขวดใหม่เพิ่มเติม โดยใช้งบ${esc(config.budget[o.budget ?? 3])}และเกณฑ์กลิ่นเดิมค่ะ`));
  if (st === "trial-choice") {
    B.push(senna("ก่อนดูคำแนะนำ ขอความยินยอมและประเมินความมั่นใจสั้น ๆ ค่ะ"));
    C.chips = [{label: "ประเมินก่อนดูคำแนะนำ", act: offerOwnedTrial}, {label: "ไม่ร่วมทดลอง ใช้คำแนะนำอย่างเดียว", act: compareOwnedChat, soft: true}];
    return {B, C};
  }
  if (st === "trial-consent") {
    const c = decisionConfig();
    B.push(widget(`<form id="owned-consent-form" class="consent"><h3>${followup ? "ทดลองแนะนำขวดใหม่ต่อจากขวดเดิม" : "ทดลองเลือกใช้ขวดที่มี"}</h3><ul>
      <li>${followup ? "เปรียบเทียบสองวิธีแนะนำขวดใหม่ โดยตัดขวดที่คุณมีออก ใช้งบและเกณฑ์เดียวกันทั้งสองชุด" : "เปรียบเทียบสองวิธีจัดอันดับจากขวดที่คุณเลือก"} ใช้เวลาประมาณ 3–5 นาที เป็น pilot แยกตามเป้าหมาย</li>
      <li>เก็บรหัสผู้เข้าร่วม รุ่นที่เลือก โอกาส แนวกลิ่น ระดับการกระจาย คะแนนก่อน–หลัง คะแนนสองชุด และเวลา ไม่ขอชื่อหรือเบอร์โทร</li>
      <li>คำนวณจากฐานข้อมูล ไม่ส่งข้อมูลรอบนี้ไปยัง LLM คะแนนสะท้อนการรับรู้ ไม่ได้ยืนยันกลิ่นจริง</li>
      ${(followup ? o.alternativesSeen || o.alternatives?.items?.length : o.privateAdviceSeen) ? '<li>คุณเคยเห็นคำแนะนำแล้ว คะแนนตั้งต้นรอบใหม่นี้จึงไม่ใช่คะแนนก่อนเห็นคำแนะนำครั้งแรก และจะติดป้ายแยกวิเคราะห์</li>' : ''}
      <li>เข้าร่วมหรือหยุดได้โดยสมัครใจ ถอนตัวและลบผลรอบนี้ได้จากเมนู หากปิดแท็บแล้วติดต่อผู้วิจัยพร้อมรหัสรอบทดลอง</li>
      <li>เก็บข้อมูลถึง ${esc(c.retention_until || config.retention_until)} ติดต่อผ่าน${esc(c.contact || "ช่องทางที่ได้รับลิงก์เชิญ")}</li>
      <li>ผู้ให้บริการเว็บไซต์และรูปภาพอาจมีบันทึกการเชื่อมต่อเพื่อความปลอดภัย</li></ul>
      <label class="check"><input type="checkbox" name="eligible" required><span>ฉันอายุ 18–50 ปี สัญชาติไทย และสนใจน้ำหอม</span></label>
      <label class="check"><input type="checkbox" name="consent" required><span>ฉันอ่านแล้วและยินยอมร่วมทดลอง${followup ? "ขวดใหม่เพิ่มเติม" : "เลือกใช้"}</span></label>
      <button type="submit" class="btn">ยินยอมร่วมทดลอง${followup ? "ขวดใหม่เพิ่มเติม" : "เลือกใช้"}</button></form>`));
    C.chips = [{label: "ไม่ร่วมทดลอง ใช้คำแนะนำอย่างเดียว", act: followup ? fetchOwnedAlternatives : compareOwnedChat, soft: true}];
    return {B, C};
  }
  const questions = decisionConfig().confidence;
  if (st === "trial-pre") {
    B.push(checkin("owned-pre-form", t.priorAdviceSeen ? "คะแนนตั้งต้นรอบใหม่ (เคยเห็นคำแนะนำแล้ว)" : "ก่อนดูคำแนะนำ", followup ? "เมื่อพิจารณาขวดใหม่เพิ่มเติม คุณรู้สึกอย่างไร" : "เมื่อเลือกใช้ขวดที่มี คุณรู้สึกอย่างไร", questions.map((q, i) => [`owned_pre${i}`, q]), t.preAnswers, "ดูคำแนะนำสองชุด"));
    return {B, C};
  }
  if (["trial-ready", "trial-wait"].includes(st)) {
    B.push(senna("บันทึกคำตอบก่อนใช้แล้วค่ะ"));
    C.chips = [{label: st === "trial-wait" ? "ตรวจสถานะอีกครั้ง" : "ดูคำแนะนำสองชุด", act: () => run(st === "trial-wait" ? resumeOwnedTrial : generateOwnedTrial)}];
    return {B, C};
  }
  if (st === "trial-loading") { B.push({kind: "typing", html: typingHTML()}); return {B, C}; }
  const sets = t.server.sets, shared = t.secondShown ? compareSets(sets).shared_item_ids : [];
  B.push(senna(followup ? "ชุดที่ 1 เป็นขวดใหม่ที่ไม่อยู่ในขวดที่คุณเลือกไว้ค่ะ" : "ชุดที่ 1 เป็นการจัดอันดับจากขวดที่คุณมีค่ะ")); B.push(shelf(sets[0], followup ? "ชุดที่ 1 · ขวดใหม่เพิ่มเติม" : "ชุดที่ 1 · ขวดที่มี", shared));
  if (st === "trial-first") {
    C.chips = [{label: followup ? "ดูชุดที่ 2 ของขวดใหม่" : "ดูชุดที่ 2 จากขวดที่มี", act: () => { t.secondShown = true; o.stage = "trial-ratings"; save(); render(); }}];
    return {B, C};
  }
  B.push(senna(comparisonText(compareSets(sets), sets[1].items.length))); B.push(shelf(sets[1], followup ? "ชุดที่ 2 · ขวดใหม่เพิ่มเติม" : "ชุดที่ 2 · ขวดที่มี", shared));
  if (st === "trial-ratings") {
    B.push(checkin("owned-ratings-form", "ความตรงใจของคำแนะนำ", followup ? "สองชุดช่วยพิจารณาขวดใหม่แค่ไหน" : "สองชุดช่วยเลือกขวดสำหรับโอกาสนี้แค่ไหน", RELEVANCE, t.answers, "บันทึกคะแนนสองชุด"));
    return {B, C};
  }
  B.push(checkin("owned-post-form", "หลังดูคำแนะนำ", "ตอนนี้คุณรู้สึกอย่างไร", [
    ...questions.map((q, i) => [`owned_post${i}`, q]), ["owned_usefulness", followup ? "คำแนะนำช่วยให้ฉันพิจารณาขวดใหม่เพิ่มเติมได้" : "คำแนะนำช่วยให้ฉันตัดสินใจเลือกใช้จากขวดที่มีได้"],
  ], t.answers, followup ? "ส่งผลทดลองขวดใหม่เพิ่มเติม" : "ส่งผลทดลองเลือกใช้"));
  return {B, C};
}
async function markOwnedViewed(slot) {
  const t = decisionTrial();
  if (t?.server?.state !== "recommended" || t.server.viewed?.[slot]) return;
  try {
    const result = await ownedTrialApi("/view", "POST", {slot});
    if (decisionTrial() === t) { t.server.viewed = result.viewed; save(); }
  } catch {}
}
function wireOwnedTrial() {
  const o = d.ownedChat, t = decisionTrial();
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
      finishDecisionTrial();
    });
  };
  if (t?.server?.state === "recommended") {
    markOwnedViewed("first"); if (t.secondShown) markOwnedViewed("second");
  }
  thread.querySelectorAll(".bottle img").forEach(img => img.onerror = () => { img.hidden = true; });
}

function finishDecisionTrial() {
  const o = d.ownedChat, t = decisionTrial();
  t.completedContext = JSON.stringify(decisionContext());
  if (decisionTask() === FOLLOWUP_TASK) { o.alternatives = t.server.advice; o.stage = "alternatives-result"; }
  else { o.result = t.server.advice; o.stage = "result"; }
  save();
}

function requestOwnedAlternatives() {
  const o = d.ownedChat;
  const trial = decisionTrial();
  if (trial?.server && trial.server.state !== "complete") return;
  o.activeTrialTask = FOLLOWUP_TASK;
  if (!o.budgetSet) { o.stage = "alternatives-budget"; lastError = ""; save(); render(); }
  else finishAlternativePreferences();
}
function finishAlternativePreferences() {
  const o = d.ownedChat; o.activeTrialTask = FOLLOWUP_TASK;
  if (config.mode === "pilot") return offerOwnedTrial();
  else fetchOwnedAlternatives();
}
function fetchOwnedAlternatives() {
  const o = d.ownedChat;
  run(async () => {
    o.stage = "alternatives-loading"; save(); render();
    try {
      o.alternatives = await api("/wardrobe/alternatives", {method: "POST", body: JSON.stringify({...ownedContext(), budget: o.budget ?? null})});
      o.alternativesSeen = true; o.stage = "alternatives-result"; save();
    } catch (error) { o.stage = "alternatives-budget"; save(); throw error; }
  });
}
function buildOwnedAlternatives(B, C, o) {
  if (o.stage === "alternatives-budget") {
    B.push(senna('<div id="alternatives-answer">อยากดูขวดอื่นเพิ่มเติม งบต่อขวดประมาณเท่าไรคะ</div>'));
    C.chips = config.budget.map((label, i) => ({label, act: () => { o.budget = i === 3 ? null : i; o.budgetSet = true; finishAlternativePreferences(); }}));
    C.chips.push({label: "กลับไปขวดที่มี", soft: true, act: () => { o.stage = "result"; save(); render(); }});
    return {B, C};
  }
  if (o.stage === "alternatives-choice") {
    B.push(senna('<div id="alternatives-answer">ก่อนดูขวดใหม่ ขอความยินยอมและประเมินความมั่นใจสำหรับขวดใหม่ค่ะ</div>'));
    C.chips = [{label: "ประเมินก่อนดูขวดใหม่", act: offerOwnedTrial}, {label: "ไม่ร่วมทดลอง ใช้คำแนะนำอย่างเดียว", act: fetchOwnedAlternatives, soft: true},
      {label: "เลือกใช้ขวดเดิม", soft: true, act: chooseExistingBottle}];
    return {B, C};
  }
  if (o.stage === "alternatives-loading") { B.push({kind: "typing", html: typingHTML()}); return {B, C}; }
  if (o.stage !== "alternatives-result") return null;
  B.push(senna('<div id="alternatives-answer">นี่คือตัวเลือกนอกขวดที่มีค่ะ ดูเหตุผลเทียบกับขวดเดิมประกอบได้ ยังไม่จำเป็นต้องซื้อใหม่</div>'));
  for (const item of o.alternatives.items) {
    B.push(senna(`<p>${esc(perfumeLabel(item))}</p>${item.differences.map(text => `<p>${esc(text)}</p>`).join("")}`));
  }
  const t = o.followupTrial;
  if (t?.server?.state === "complete" && t.completedContext === JSON.stringify({...ownedContext(), budget: o.budget ?? null})) {
    for (const set of t.server.evaluated_sets) B.push(shelf(set, `${set.label} · ขวดใหม่ที่ประเมินแล้ว`, compareSets(t.server.evaluated_sets).shared_item_ids));
    B.push(senna(`<p>บันทึกผลทดลองขวดใหม่เพิ่มเติมแล้ว แยกจากการเลือกใช้ขวดเดิมค่ะ</p><p class="receipt followup-receipt">รหัสรอบทดลอง: ${esc(t.id)}</p>`));
  } else {
    B.push(senna('<p class="private-advice-notice" role="status">รอบนี้เป็นคำแนะนำอย่างเดียว ยังไม่มีคะแนนก่อน–หลังหรือผลเปรียบเทียบที่ส่งไว้ค่ะ</p>'));
    B.push(shelf({items: o.alternatives.items}, "คำแนะนำขวดใหม่เพิ่มเติม"));
  }
  C.chips = [{label: "เลือกใช้ขวดเดิม", act: chooseExistingBottle}, {label: "จบการคุย", act: () => finishOwnedDecision(null)}, {label: "เปลี่ยนงบ", act: () => { o.budgetSet = false; requestOwnedAlternatives(); }},
    {label: "เปลี่ยนโอกาสใช้งาน", act: () => ownedStep("scenario")}];
  if (config.mode === "pilot" && t?.server?.state !== "complete") C.chips.unshift({label: "ประเมินคำแนะนำสองชุด", act: () => { o.activeTrialTask = FOLLOWUP_TASK; offerOwnedTrial(); }});
  return {B, C};
}
function chooseExistingBottle() {
  const o = d.ownedChat; o.decisionReturnStage = o.stage;
  if (o.items.length === 1) finishOwnedDecision(o.items[0]);
  else { o.stage = "decision-owned"; save(); render(); }
}
function finishOwnedDecision(item) {
  const o = d.ownedChat; o.finalChoice = item ? {id: item.id, label: perfumeLabel(item)} : null;
  o.stage = "decision-done"; lastError = ""; save(); render();
}
function buildOwnedDecision(B, C, o) {
  if (o.stage === "decision-owned") {
    B.push(senna("เลือกใช้ขวดไหนสำหรับครั้งนี้คะ"));
    C.chips = o.items.map(item => ({label: perfumeLabel(item), act: () => finishOwnedDecision(item)}));
    C.chips.push({label: "กลับไปดูผล", soft: true, act: () => { o.stage = o.decisionReturnStage || "result"; save(); render(); }});
  } else {
    B.push(user(o.finalChoice ? `เลือกใช้ ${o.finalChoice.label}` : "จบการคุย"));
    B.push(senna(o.finalChoice ? "เลือกขวดสำหรับครั้งนี้ได้แล้วค่ะ ข้อควรระวังที่ประเมินไว้ยังใช้ประกอบการตัดสินใจ ไม่จำเป็นต้องซื้อใหม่ค่ะ" : "จบการคุยแล้วค่ะ ยังไม่จำเป็นต้องตัดสินใจซื้อในตอนนี้"));
    const completed = [o.trial, o.followupTrial].filter(t => t?.server?.state === "complete");
    for (const t of completed) B.push(senna(`<p>ผลเปรียบเทียบที่ส่งไว้ยังถูกเก็บตามรอบเดิม ไม่ต้องประเมินซ้ำค่ะ</p><p class="receipt">รหัสรอบทดลอง: ${esc(t.id)}</p>`));
    C.chips = [{label: "กลับไปดูผล", act: () => { o.stage = o.decisionReturnStage || (o.alternatives ? "alternatives-result" : "result"); save(); render(); }},
      {label: "เปลี่ยนเป้าหมาย", soft: true, act: leaveOwnedChat}];
  }
  return {B, C};
}
