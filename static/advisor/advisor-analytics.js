"use strict";

(() => {
  const key = "senna-product-analytics-v1";
  let id = null, enabled = false, initialized = false, automatic = false;
  const banner = document.getElementById("analytics-consent");
  const setting = document.getElementById("analytics-settings");
  const notice = document.getElementById("analytics-notice");
  const privacySignal = () => navigator.globalPrivacyControl === true || navigator.doNotTrack === "1";
  const safeItems = items => (items || []).slice(0, 10)
    .filter(item => Number.isInteger(item.id) && item.id > 0)
    .map(item => ({item_id: String(item.id)}));
  function saved() { try { return localStorage.getItem(key); } catch { return null; } }
  function remember(value) { try { localStorage.setItem(key, value); } catch { /* Choice still applies in this tab. */ } }
  function command() { window.dataLayer.push(arguments); }
  function init(explicitConsent) {
    window["ga-disable-" + id] = false;
    if (initialized) {
      if (explicitConsent) command("consent", "update", {analytics_storage: "granted"});
      else {
        // Re-enable only after an explicit click, not after an automatic reload.
        command("config", id, {send_page_view: false});
      }
      return;
    }
    initialized = true;
    window.dataLayer = window.dataLayer || [];
    const defaults = {ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied"};
    if (!automatic || explicitConsent) defaults.analytics_storage = "denied";
    command("consent", "default", defaults);
    // Automatic collection is not recorded or transmitted as user consent.
    if (explicitConsent) command("consent", "update", {analytics_storage: "granted"});
    command("js", new Date());
    command("config", id, {
      send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
      page_location: location.origin + "/advisor", page_referrer: "", page_title: "Senna",
    });
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    document.head.append(script);
    command("event", "page_view", {page_location: location.origin + "/advisor", page_referrer: "", page_title: "Senna"});
  }
  function revoke() {
    window["ga-disable-" + id] = true;
    if (initialized) command("consent", "update", {analytics_storage: "denied"});
    // Remove this site's GA cookies as well as preventing further collection.
    for (const cookie of document.cookie.split(";")) {
      const name = cookie.split("=")[0].trim();
      if (!/^_ga(?:_|$)/.test(name)) continue;
      document.cookie = name + "=; Max-Age=0; Path=/";
      const parts = location.hostname.split(".");
      while (parts.length >= 2) {
        document.cookie = name + "=; Max-Age=0; Path=/; Domain=." + parts.join(".");
        parts.shift();
      }
    }
  }
  function status() {
    setting.textContent = automatic ? (enabled ? "สถิติ: เปิด" : "สถิติ: ปิด")
      : (enabled ? "สถิติ: อนุญาต" : "สถิติ: ไม่อนุญาต");
    notice.hidden = !automatic;
    notice.textContent = enabled
      ? "เว็บนี้ใช้ Google Analytics และคุกกี้เก็บสถิติอัตโนมัติ ไม่ส่งแชทหรือรูป ปิดได้ที่ปุ่มสถิติ"
      : "ปิดการเก็บสถิติ Google Analytics แล้ว ใช้งาน Senna ได้ตามปกติ";
  }
  function choose(value) {
    enabled = value === "granted" && !privacySignal();
    remember(value);
    banner.hidden = true;
    status();
    if (enabled) init(true); else revoke();
  }
  window.SennaAnalytics = Object.freeze({
    track(event, details = {}) {
      if (!id || !enabled || privacySignal()) return;
      const items = safeItems(details.items);
      let params;
      if (event === "advisor_start" && ["new", "owned"].includes(details.mode)) params = {mode: details.mode};
      if (event === "view_item_list" || event === "select_item" || event === "similar_request") params = {items};
      if (event === "shop_click" && ["product", "search"].includes(details.kind)) params = {items, link_kind: details.kind};
      if (!params) return;
      command("event", event, {...params, page_location: location.origin + "/advisor", page_referrer: "", page_title: "Senna"});
    },
  });
  document.getElementById("analytics-accept").addEventListener("click", () => choose("granted"));
  document.getElementById("analytics-reject").addEventListener("click", () => choose("denied"));
  setting.addEventListener("click", () => { banner.hidden = !banner.hidden; });
  window.addEventListener("storage", event => {
    if (event.key === key && event.newValue !== "granted") {
      enabled = false;
      revoke();
      status();
    }
  });
  fetch("/advisor/api/integrations").then(r => r.ok ? r.json() : {}).then(config => {
    if (!/^G-[A-Z0-9]{6,20}$/.test(config.ga4_measurement_id || "")) return;
    id = config.ga4_measurement_id;
    automatic = config.analytics_mode === "automatic_notice";
    setting.hidden = false;
    if (automatic) {
      document.getElementById("analytics-copy").textContent =
        "Senna ใช้ Google Analytics และคุกกี้เพื่อวัดการเปิดเว็บ ดูคำแนะนำ เลือกขวด และกดไปร้านค้า Google ได้รับข้อมูลเบราว์เซอร์และอุปกรณ์ เราไม่ส่งข้อความแชท รูป หรือรหัสผู้เข้าร่วม ปิดสถิติได้โดยไม่กระทบการใช้งาน การปิดไม่ลบข้อมูลที่ส่งไปแล้ว";
      document.getElementById("analytics-accept").textContent = "เปิดสถิติ";
      document.getElementById("analytics-reject").textContent = "ปิดสถิติ";
    }
    const previous = saved();
    if (privacySignal()) {
      enabled = false;
      revoke();
      status();
    } else if (previous === "granted" || previous === "denied") choose(previous);
    else if (automatic) {
      enabled = true;
      status();
      init(false);
    }
    else banner.hidden = false;
  }).catch(() => {});
})();
