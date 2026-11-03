"use strict";
const $ = selector => document.querySelector(selector);
const esc = text => String(text ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const label = item => item.name.toLowerCase().startsWith(item.brand.toLowerCase()) ? item.name : `${item.brand} ${item.name}`;
let owned = [], config, searching, searchVersion = 0, revision = 0, busy = false;

async function api(path, options = {}) {
  const response = await fetch('/v2' + path, {cache: 'no-store', ...options});
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'ยังทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง');
  return result;
}
function message(id, text) { $(id).textContent = text; $(id).hidden = !text; }
function invalidate() {
  revision++;
  $('#owned-advice').hidden = true;
  message('#owned-error', '');
}
function renderOwned() {
  $('#owned-count').textContent = `${owned.length} / 10`;
  $('#owned-list').innerHTML = owned.map(item => `<li><span>${esc(label(item))}</span><button type="button" data-remove="${item.id}" aria-label="เอา ${esc(label(item))} ออก" title="เอาออก">×</button></li>`).join('');
  $('#owned-list').querySelectorAll('[data-remove]').forEach(button => button.onclick = () => {
    owned = owned.filter(item => item.id !== Number(button.dataset.remove)); invalidate(); renderOwned();
  });
  $('#compare-owned').disabled = busy || !owned.length;
}
function closeSearch() {
  $('#owned-results').hidden = true;
  $('#owned-search').setAttribute('aria-expanded', 'false');
}
$('#owned-search').oninput = () => {
  clearTimeout(searching); const version = ++searchVersion, query = $('#owned-search').value.trim();
  closeSearch(); message('#search-status', '');
  if (query.length < 2) return;
  searching = setTimeout(async () => {
    try {
      const result = await api('/search?q=' + encodeURIComponent(query));
      if (version !== searchVersion) return;
      const available = result.items.filter(item => !owned.some(p => p.id === item.id));
      if (!available.length) { message('#search-status', result.items.length ? 'เพิ่มรุ่นที่พบไว้แล้ว' : 'ไม่พบรุ่นนี้ในฐานข้อมูล ลองชื่อภาษาอังกฤษหรือแบรนด์อื่น'); return; }
      $('#owned-results').innerHTML = available.map(item => `<button type="button" data-add="${item.id}">${esc(label(item))}</button>`).join('');
      $('#owned-results').hidden = false;
      $('#owned-search').setAttribute('aria-expanded', 'true');
      $('#owned-results').querySelectorAll('[data-add]').forEach(button => button.onclick = () => {
        if (owned.length >= 10) { message('#search-status', 'เลือกได้ไม่เกิน 10 รุ่น'); return; }
        owned.push(result.items.find(item => item.id === Number(button.dataset.add)));
        ++searchVersion; closeSearch(); $('#owned-search').value = ''; message('#search-status', ''); invalidate(); renderOwned(); $('#owned-search').focus();
      });
    } catch (error) { if (version === searchVersion) message('#search-status', error.message); }
  }, 250);
};
$('#owned-search').onkeydown = event => { if (event.key === 'Escape') { ++searchVersion; closeSearch(); } };
$('#owned-search').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('#owned-results button')?.focus(); } });

function showAdvice(result) {
  const source = result.families_from_popularity ? 'แนวที่ผู้ตอบแบบสอบถามมักเลือก' : 'แนวกลิ่นที่คุณเลือก';
  $('#owned-advice').innerHTML = `<h2>${result.items.length > 1 ? 'ขวดที่น่าลองสำหรับครั้งนี้' : 'ขวดนี้กับโอกาสที่เลือก'}</h2><p>${esc(result.scenario.replace(/^[ABC] /, ''))} · ${source}: ${esc(result.families.join(' / '))}</p><p class="sub">เทียบเฉพาะขวดที่เลือก ไม่ใช้ราคาหรือการหาซื้อเป็นคะแนน อ้างอิงแนวกลิ่นกับรูปแบบการเลือกตามโอกาสในแบบสอบถาม ไม่ใช่กฎตายตัว ความชอบหลังทดลองดมอาจต่างจากข้อมูลกลิ่น</p><div class="owned-advice-grid">${result.items.map((item, index) => `<article class="owned-card">${item.image_url ? `<img src="${esc(item.image_url)}" alt="${esc(label(item))}" referrerpolicy="no-referrer" loading="lazy">` : '<div class="missing-photo">ไม่มีภาพ</div>'}<div class="owned-card-body"><span class="rank">${index === 0 && result.items.length > 1 ? 'น่าลองก่อน' : `ตัวเลือก ${index + 1}`}</span><p class="brand">${esc(item.brand)}</p><h3>${esc(item.name)}</h3><div class="facts">${esc(item.family)} · ${esc(item.sillage)}${item.sillage_estimated ? ' (ประมาณ)' : ''}</div><ul>${item.reasons.map(reason => `<li>${esc(reason)}</li>`).join('')}</ul>${item.cautions.map(caution => `<p class="caution">${esc(caution)}</p>`).join('')}${/^https:\/\//.test(item.url) ? `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">แหล่งข้อมูลน้ำหอม</a>` : ''}</div></article>`).join('')}</div>`;
  $('#owned-advice').hidden = false;
  $('#owned-advice').querySelectorAll('img').forEach(img => img.onerror = () => { const span = document.createElement('span'); span.className = 'missing-photo'; span.textContent = 'ไม่มีภาพ'; img.replaceWith(span); });
  $('#owned-advice').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'});
}
$('#owned-form').onsubmit = async event => {
  event.preventDefault(); if (busy || !owned.length) return;
  const current = revision;
  busy = true; renderOwned(); message('#owned-error', '');
  $('#compare-owned').textContent = 'กำลังเทียบขวดที่เลือก…';
  const families = [...document.querySelectorAll('[name=family]:checked')].map(input => input.value);
  try {
    const result = await api('/wardrobe/compare', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
      owned_ids: owned.map(item => item.id), scenario: document.querySelector('[name=scenario]:checked').value,
      families, sillage: $('#owned-sillage').value === '' ? null : Number($('#owned-sillage').value),
    })});
    if (current === revision) showAdvice(result);
  } catch (error) { if (current === revision) message('#owned-error', error.message); }
  finally { busy = false; $('#compare-owned').textContent = 'ช่วยเลือกจากขวดเหล่านี้'; renderOwned(); }
};
(async () => {
  try {
    config = await api('/study/config');
    $('#occasion').insertAdjacentHTML('beforeend', Object.entries(config.scenarios).map(([key, text], i) => `<label><input type="radio" name="scenario" value="${key}" ${i === 0 ? 'checked' : ''}><span>${esc(text.replace(/^[ABC] /, ''))}</span></label>`).join(''));
    $('#owned-families').innerHTML = Object.entries(config.families).map(([key, text]) => `<label><input type="checkbox" name="family" value="${key}"><span>${esc(text)}</span></label>`).join('');
    $('#owned-form').onchange = () => {
      const selected = [...document.querySelectorAll('[name=family]:checked')];
      document.querySelectorAll('[name=family]').forEach(input => input.disabled = selected.length >= 2 && !input.checked);
      invalidate();
    };
    $('#owned-form').hidden = false;
  } catch (error) { message('#load-error', 'ยังเชื่อมต่อ Senna ไม่สำเร็จ กรุณาโหลดหน้านี้อีกครั้ง'); }
})();
