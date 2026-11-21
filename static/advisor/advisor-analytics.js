"use strict";

(() => {
  const key = "senna-product-analytics-v1";
  let id = null, granted = false, initialized = false;
  const banner = document.getElementById("analytics-consent");
  const setting = document.getElementById("analytics-settings");
  const safeItems = items => (items || []).slice(0, 10)
    .filter(item => Number.isInteger(item.id) && item.id > 0)
    .map(item => ({item_id: String(item.id)}));
  function saved() { try { return localStorage.getItem(key); } catch { return null; } }
  function remember(value) { try { localStorage.setItem(key, value); } catch { /* Choice still applies in this tab. */ } }
  function command() { window.dataLayer.push(arguments); }
  function init() {
    window["ga-disable-" + id] = false;
    if (initialized) {
      command("consent", "update", {analytics_storage: "granted"});
      return;
    }
    initialized = true;
    window.dataLayer = window.dataLayer || [];
    command("consent", "default", {
      analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied",
    });
    command("consent", "update", {analytics_storage: "granted"});
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
    if (!initialized) return;
    window["ga-disable-" + id] = true;
    command("consent", "update", {analytics_storage: "denied"});
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
  function choose(value) {
    granted = value === "granted";
    remember(value);
    banner.hidden = true;
    setting.textContent = granted ? "สถิติ: อนุญาต" : "สถิติ: ไม่อนุญาต";
    if (granted) init(); else revoke();
  }
  window.SennaAnalytics = Object.freeze({
    track(event, details = {}) {
      if (!id || !granted) return;
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
  setting.addEventListener("click", () => { banner.hidden = false; });
  window.addEventListener("storage", event => {
    if (event.key === key && event.newValue !== "granted") {
      granted = false;
      revoke();
      setting.textContent = "สถิติ: ไม่อนุญาต";
    }
  });
  fetch("/advisor/api/integrations").then(r => r.ok ? r.json() : {}).then(config => {
    if (!/^G-[A-Z0-9]{6,20}$/.test(config.ga4_measurement_id || "")) return;
    id = config.ga4_measurement_id;
    setting.hidden = false;
    const previous = saved();
    if (previous === "granted" || previous === "denied") choose(previous);
    else banner.hidden = false;
  }).catch(() => {});
})();
