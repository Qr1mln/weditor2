/* WEditor localStorage persistence helpers (no Vue dependency). */
(function () {
  'use strict'
  const {
    CONSOLE_LEVELS_KEY, SCREEN_MODE_KEY, SPLIT_RATIO_KEY,
    CONSOLE_HEIGHT_KEY, TOOLBAR_POS_KEY, LOG_LEVELS, LOG_LEVEL_ALIASES,
    EXPLORER_WIDTH_KEY,
  } = window.WEditorConstants
  function defaultConsoleLevels() {
    return LOG_LEVELS.map(l => l.key)
  }

  function loadConsoleLevels() {
    try {
      const saved = JSON.parse(localStorage.getItem(CONSOLE_LEVELS_KEY) || 'null')
      if (Array.isArray(saved)) return saved.filter(k => LOG_LEVELS.some(l => l.key === k))
    } catch (e) {}
    return defaultConsoleLevels()
  }

  function saveConsoleLevels(levels) {
    try { localStorage.setItem(CONSOLE_LEVELS_KEY, JSON.stringify(levels)) } catch (e) {}
  }

  function normalizeLogLevel(level) {
    return LOG_LEVEL_ALIASES[String(level || '').toLowerCase()] || null
  }

  function inferLogLevel(text) {
    const s = String(text || '')
    if (/traceback \(most recent call last\)|\[(?:critical|fatal|error)\]/i.test(s)) return 'error'
    if (/\[(?:warn|warning)\]/i.test(s)) return 'warning'
    if (/\[debug\]/i.test(s)) return 'debug'
    return 'info'
  }

  function resolveLogLevel(level, text) {
    const normalized = normalizeLogLevel(level)
    // stdout defaults to info; explicit markers in the text should still win
    if (normalized === 'info') return inferLogLevel(text)
    return normalized || inferLogLevel(text)
  }

  function loadScreenMode() {
    return localStorage.getItem(SCREEN_MODE_KEY) === 'minicap' ? 'minicap' : 'screenshot'
  }

  function saveScreenMode(mode) {
    try {
      localStorage.setItem(SCREEN_MODE_KEY, mode)
    } catch (e) {}
  }

  function loadSplitRatio() {
    const saved = Number.parseFloat(localStorage.getItem(SPLIT_RATIO_KEY))
    return Number.isFinite(saved) && saved >= 5 && saved <= 95 ? saved : 50
  }

  function loadConsoleHeight() {
    const saved = Number.parseFloat(localStorage.getItem(CONSOLE_HEIGHT_KEY))
    return Number.isFinite(saved) && saved >= 80 && saved <= 2000 ? saved : 180
  }

  function loadExplorerWidth() {
    const saved = Number.parseFloat(localStorage.getItem(EXPLORER_WIDTH_KEY))
    return Number.isFinite(saved) && saved >= 140 && saved <= 520 ? saved : 220
  }

  function saveExplorerWidth(width) {
    try {
      localStorage.setItem(EXPLORER_WIDTH_KEY, String(Math.round(width)))
    } catch (e) {}
  }

  function loadToolbarPosition() {
    try {
      const saved = JSON.parse(localStorage.getItem(TOOLBAR_POS_KEY) || 'null')
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)
        && saved.x >= 0 && saved.y >= 0) {
        return { x: Math.round(saved.x), y: Math.round(saved.y) }
      }
    } catch (e) {}
    return {
      x: Math.round(window.innerWidth * 0.3),
      y: Math.round(window.innerHeight * 0.3),
    }
  }

  function saveToolbarPosition(pos) {
    try {
      localStorage.setItem(TOOLBAR_POS_KEY, JSON.stringify(pos))
    } catch (e) {}
  }

  window.WEditorPersistence = {
    defaultConsoleLevels, loadConsoleLevels, saveConsoleLevels,
    normalizeLogLevel, inferLogLevel, resolveLogLevel,
    loadScreenMode, saveScreenMode, loadSplitRatio, loadConsoleHeight,
    loadExplorerWidth, saveExplorerWidth, loadToolbarPosition, saveToolbarPosition,
  }
})()
