/* Apply the saved appearance before paint; dashboard demo state stays separate. */
"use strict";

(() => {
  const root = document.documentElement;
  const THEME_KEY = "rapidkl-appearance-v1";
  const MOTION_KEY = "rapidkl-background-motion-v1";
  const darkPreference = window.matchMedia("(prefers-color-scheme: dark)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const readPreference = key => {
    try { return window.localStorage.getItem(key); }
    catch (_) { return null; }
  };
  const savePreference = (key, value) => {
    try { window.localStorage.setItem(key, value); }
    catch (_) { /* Controls still work when browser storage is unavailable. */ }
  };
  const validTheme = value => value === "day" || value === "night";
  let themePreference = readPreference(THEME_KEY);
  if (!validTheme(themePreference)) themePreference = null;
  let motionPaused = readPreference(MOTION_KEY) === "paused";

  function applyTheme() {
    const night = (themePreference || (darkPreference.matches ? "night" : "day")) === "night";
    root.dataset.theme = night ? "night" : "day";
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content = night ? "#091b27" : "#e9f5f6";
    const button = document.getElementById("theme-toggle");
    if (!button) return;
    button.hidden = false;
    button.setAttribute("aria-checked", String(night));
    button.title = night ? "Switch to day mode" : "Switch to night mode";
    document.getElementById("theme-label").textContent = night ? "Night" : "Day";
  }

  function applyMotion() {
    const paused = motionPaused || reducedMotion.matches;
    root.dataset.motion = paused ? "paused" : "playing";
    root.dataset.sceneActive = String(!document.hidden);
    const button = document.getElementById("motion-toggle");
    if (!button) return;
    button.hidden = false;
    button.disabled = reducedMotion.matches;
    button.setAttribute("aria-pressed", String(paused));
    button.setAttribute("aria-label", reducedMotion.matches ? "Background animation disabled by reduced-motion preference" : paused ? "Play background animation" : "Pause background animation");
    button.title = reducedMotion.matches ? "Animations follow your device's reduced-motion setting" : "";
    document.getElementById("motion-label").textContent = reducedMotion.matches ? "Background motion reduced" : paused ? "Play background animation" : "Pause background animation";
    document.getElementById("motion-icon").setAttribute("href", paused ? "#i-play" : "#i-pause");
  }

  applyTheme();
  applyMotion();

  function initializeControls() {
    const themeButton = document.getElementById("theme-toggle");
    const motionButton = document.getElementById("motion-toggle");
    if (!themeButton || !motionButton) return;
    root.classList.add("has-theme-controls");
    applyTheme();
    applyMotion();
    themeButton.addEventListener("click", () => {
      themePreference = root.dataset.theme === "night" ? "day" : "night";
      savePreference(THEME_KEY, themePreference);
      applyTheme();
    });
    motionButton.addEventListener("click", () => {
      motionPaused = !motionPaused;
      savePreference(MOTION_KEY, motionPaused ? "paused" : "playing");
      applyMotion();
    });
  }

  darkPreference.addEventListener("change", () => { if (!themePreference) applyTheme(); });
  reducedMotion.addEventListener("change", applyMotion);
  document.addEventListener("visibilitychange", () => {
    root.dataset.sceneActive = String(!document.hidden);
  });
  window.addEventListener("storage", event => {
    if (event.key === THEME_KEY || event.key === null) {
      const value = readPreference(THEME_KEY);
      themePreference = validTheme(value) ? value : null;
      applyTheme();
    }
    if (event.key === MOTION_KEY || event.key === null) {
      motionPaused = readPreference(MOTION_KEY) === "paused";
      applyMotion();
    }
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializeControls, {once:true});
  else initializeControls();
})();
