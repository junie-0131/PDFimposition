const $ = (id) => document.getElementById(id);
const mmToPt = (mm) => mm * 72 / 25.4;
const ptToMm = (pt) => pt * 25.4 / 72;

let sourceBytes = null;
let sourcePdf = null;
let sourceInfo = null;
let pageSequence = [];
let lastTicket = null;
let previewIndex = 0;

const CUSTOM_PRESET_PREFIX = "user:";
const CUSTOM_PRESET_STORAGE = "pdf-imposition-sheet-presets";
const IMPOSITION_PRESET_PREFIX = "imposition:";
const IMPOSITION_PRESET_STORAGE = "pdf-imposition-setting-presets";
const LAST_SETTINGS_STORAGE = "pdf-imposition-last-settings";
const presets = {
  "636x939": [636, 939],
  "469x636": [469, 636],
  "318x469": [318, 469],
  "234x318": [234, 318],
  "788x1091": [788, 1091],
  "545x788": [545, 788],
  "394x545": [394, 545],
  "272x394": [272, 394],
  "625x880": [625, 880],
  "440x625": [440, 625],
  "312x440": [312, 440],
  "220x312": [220, 312],
  "765x1085": [765, 1085],
  "542x765": [542, 765],
  "382x542": [382, 542],
  "271x382": [271, 382],
  "900x1200": [900, 1200],
  "600x900": [600, 900],
  "530x770": [530, 770],
  "650x950": [650, 950],
  "800x1030": [800, 1030],
  "720x1020": [720, 1020],
  "1030x1456": [1030, 1456],
  "841x1189": [841, 1189],
  "594x841": [594, 841],
  "420x594": [420, 594],
  "297x420": [297, 420],
  "450x625": [450, 625],
  "320x450": [320, 450],
  "364x515": [364, 515],
  "329x483": [329, 483],
  "488x650": [488, 650],
  "330x488": [330, 488],
  "320x464": [320, 464],
  "305x457": [305, 457],
  "330x482": [330, 482],
};

const modePresets = {
  "signature-4": { signatureSize: 4, cols: 2, rows: 1 },
  "signature-8": { signatureSize: 8, cols: 2, rows: 2 },
  "signature-12": { signatureSize: 12, cols: 3, rows: 2 },
  "signature-16": { signatureSize: 16, cols: 4, rows: 2 },
  "signature-24": { signatureSize: 24, cols: 4, rows: 3 },
  "signature-32": { signatureSize: 32, cols: 4, rows: 4 },
};

const ids = [
  "jobName", "trimW", "trimH", "bleed", "safeMargin", "binding", "product",
  "pagePolicy", "folioStart", "sheetPreset", "sheetOrientation", "sheetW", "sheetH", "gripper",
  "tail", "guide", "grain", "mode", "duplex", "cols", "rows", "gutter",
  "spineGutter", "creep", "signatureSize", "rotation", "pageOrder",
  "insertPosition", "insertPageSource", "cropMarks", "cropMarkStyle", "markColor", "foldMarks", "registerMarks", "colorBars", "slug",
  "printFolios", "folioPosition", "folioSize", "folioFont", "folioHige", "folioColor", "folioC", "folioM", "folioY", "folioK",
  "spineMarks", "spineTextMode", "spineText", "spineTextSize", "spineMarkSize", "spineMarkStep", "spineMarkShape",
  "mirrorBack", "markOffset", "markWeight", "patchSize", "barPosition"
];

function readSettings() {
  const s = {};
  for (const id of ids) {
    const el = $(id);
    s[id] = el.type === "checkbox" ? el.checked : el.value;
  }
  for (const id of ["trimW", "trimH", "bleed", "safeMargin", "folioStart", "sheetW", "sheetH", "gripper", "tail", "cols", "rows", "gutter", "spineGutter", "creep", "signatureSize", "markOffset", "markWeight", "patchSize", "folioSize", "folioC", "folioM", "folioY", "folioK", "spineTextSize", "spineMarkSize", "spineMarkStep"]) {
    s[id] = Number(s[id]);
  }
  return s;
}

function applySettings(settings) {
  for (const id of ids) {
    if (!(id in settings)) continue;
    const el = $(id);
    if (!el) continue;
    if (el.type === "checkbox") {
      el.checked = Boolean(settings[id]);
    } else {
      el.value = settings[id];
    }
  }
}

function persistLastSettings() {
  try {
    localStorage.setItem(LAST_SETTINGS_STORAGE, JSON.stringify(readSettings()));
  } catch {
    setStatus("前回設定の保存に失敗しました。", "error");
  }
}

function restoreLastSettings() {
  try {
    const raw = localStorage.getItem(LAST_SETTINGS_STORAGE);
    if (!raw) return;
    applySettings(JSON.parse(raw));
  } catch {
    setStatus("前回設定の読み込みに失敗しました。", "error");
  }
}

function applySheetPreset() {
  const selected = $("sheetPreset").value;
  const custom = getCustomPreset(selected);
  if (custom) {
    $("sheetOrientation").value = custom.orientation || (custom.width >= custom.height ? "landscape" : "portrait");
    $("sheetW").value = custom.width;
    $("sheetH").value = custom.height;
    return;
  }
  const size = presets[selected];
  if (!size) return;
  const landscape = $("sheetOrientation").value === "landscape";
  $("sheetW").value = landscape ? size[1] : size[0];
  $("sheetH").value = landscape ? size[0] : size[1];
}

function loadCustomPresets() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_PRESET_STORAGE) || "[]");
  } catch {
    return [];
  }
}

function loadImpositionPresets() {
  try {
    return JSON.parse(localStorage.getItem(IMPOSITION_PRESET_STORAGE) || "[]");
  } catch {
    return [];
  }
}

function saveImpositionPresets(items) {
  localStorage.setItem(IMPOSITION_PRESET_STORAGE, JSON.stringify(items));
}

function renderImpositionPresetOptions(selectedValue = $("impositionPreset")?.value) {
  const select = $("impositionPreset");
  if (!select) return;
  select.querySelectorAll("option[data-user-preset='true']").forEach(option => option.remove());
  for (const item of loadImpositionPresets()) {
    const option = document.createElement("option");
    option.value = `${IMPOSITION_PRESET_PREFIX}${item.id}`;
    option.dataset.userPreset = "true";
    option.textContent = item.name;
    select.appendChild(option);
  }
  if (selectedValue && [...select.options].some(option => option.value === selectedValue)) {
    select.value = selectedValue;
  }
}

function saveCurrentImpositionPreset() {
  let name = $("impositionPresetName").value.trim();
  if (!name && selectedImpositionPreset()) {
    name = selectedImpositionPreset().name;
  }
  if (!name) {
    name = window.prompt("保存する面付設定名を入力してください。", presetNameFromSettings(readSettings()))?.trim() || "";
  }
  if (!name) {
    setStatus("面付設定名を入力してください。", "error");
    return;
  }
  const items = loadImpositionPresets();
  const id = uniquePresetId(safeName(name).toLowerCase());
  const existing = items.findIndex(item => item.id === id);
  const item = {
    id,
    name,
    settings: readSettings(),
    updatedAt: new Date().toISOString()
  };
  if (existing >= 0) {
    items[existing] = item;
  } else {
    items.push(item);
  }
  saveImpositionPresets(items);
  renderImpositionPresetOptions(`${IMPOSITION_PRESET_PREFIX}${id}`);
  $("impositionPreset").value = `${IMPOSITION_PRESET_PREFIX}${id}`;
  persistLastSettings();
  setStatus(`面付設定「${name}」を保存しました。`, "ready");
  updatePreview();
}

function presetNameFromSettings(settings) {
  const product = settings.product === "saddle" ? "中綴じ" : settings.product === "perfect" ? "無線綴じ" : "端物";
  const binding = settings.binding === "right" ? "右綴じ" : settings.binding === "left" ? "左綴じ" : "天綴じ";
  return `${product} ${binding} ${settings.sheetW}x${settings.sheetH}`;
}

function selectedImpositionPreset() {
  const value = $("impositionPreset").value;
  if (!value.startsWith(IMPOSITION_PRESET_PREFIX)) return null;
  const id = value.slice(IMPOSITION_PRESET_PREFIX.length);
  return loadImpositionPresets().find(preset => preset.id === id) || null;
}

function applySelectedImpositionPreset() {
  const value = $("impositionPreset").value;
  if (!value.startsWith(IMPOSITION_PRESET_PREFIX)) return;
  const id = value.slice(IMPOSITION_PRESET_PREFIX.length);
  const item = loadImpositionPresets().find(preset => preset.id === id);
  if (!item) return;
  applySettings(item.settings);
  $("impositionPresetName").value = item.name;
  showSelectedImpositionPreset();
  persistLastSettings();
  setStatus(`面付設定「${item.name}」を読み込みました。`, "ready");
  updatePreview();
}

function updateSelectedImpositionPreset() {
  const item = selectedImpositionPreset();
  if (!item) {
    setStatus("更新する面付設定プリセットを選択してください。", "error");
    return;
  }
  const items = loadImpositionPresets();
  const index = items.findIndex(preset => preset.id === item.id);
  items[index] = {
    ...item,
    settings: readSettings(),
    updatedAt: new Date().toISOString()
  };
  saveImpositionPresets(items);
  showSelectedImpositionPreset();
  setStatus(`面付設定「${item.name}」を現在の設定で更新しました。`, "ready");
}

function renameSelectedImpositionPreset() {
  const item = selectedImpositionPreset();
  if (!item) {
    setStatus("名前を変更する面付設定プリセットを選択してください。", "error");
    return;
  }
  const name = window.prompt("新しい面付設定名を入力してください。", item.name)?.trim();
  if (!name) return;
  const id = uniquePresetId(safeName(name).toLowerCase(), item.id);
  const items = loadImpositionPresets().map(preset => preset.id === item.id
    ? { ...preset, id, name, updatedAt: new Date().toISOString() }
    : preset
  );
  saveImpositionPresets(items);
  renderImpositionPresetOptions(`${IMPOSITION_PRESET_PREFIX}${id}`);
  $("impositionPreset").value = `${IMPOSITION_PRESET_PREFIX}${id}`;
  $("impositionPresetName").value = name;
  showSelectedImpositionPreset();
  setStatus(`面付設定名を「${name}」に変更しました。`, "ready");
}

function uniquePresetId(baseId, keepId = null) {
  const items = loadImpositionPresets();
  let id = baseId || "preset";
  let suffix = 2;
  while (items.some(item => item.id === id && item.id !== keepId)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function showSelectedImpositionPreset() {
  const editor = $("impositionPresetEditor");
  if (!editor) return;
  const item = selectedImpositionPreset();
  editor.value = item ? JSON.stringify(item.settings, null, 2) : "";
}

function applyImpositionPresetEditor() {
  const item = selectedImpositionPreset();
  if (!item) {
    setStatus("編集する面付設定プリセットを選択してください。", "error");
    return;
  }
  try {
    const settings = JSON.parse($("impositionPresetEditor").value);
    const items = loadImpositionPresets().map(preset => preset.id === item.id
      ? { ...preset, settings, updatedAt: new Date().toISOString() }
      : preset
    );
    saveImpositionPresets(items);
    applySettings(settings);
    persistLastSettings();
    updatePreview();
    setStatus(`面付設定「${item.name}」をJSON内容で更新しました。`, "ready");
  } catch (error) {
    setStatus(`プリセットJSONを読み込めません: ${error.message || error}`, "error");
  }
}

function deleteSelectedImpositionPreset() {
  const value = $("impositionPreset").value;
  if (!value.startsWith(IMPOSITION_PRESET_PREFIX)) {
    setStatus("削除する面付設定プリセットを選択してください。", "error");
    return;
  }
  const id = value.slice(IMPOSITION_PRESET_PREFIX.length);
  saveImpositionPresets(loadImpositionPresets().filter(item => item.id !== id));
  renderImpositionPresetOptions("");
  $("impositionPreset").value = "";
  $("impositionPresetName").value = "";
  showSelectedImpositionPreset();
  setStatus("選択した面付設定プリセットを削除しました。", "ready");
}

function getCustomPreset(value) {
  if (!value || !value.startsWith(CUSTOM_PRESET_PREFIX)) return null;
  const id = value.slice(CUSTOM_PRESET_PREFIX.length);
  return loadCustomPresets().find(item => item.id === id) || null;
}

function saveCustomPresets(items) {
  localStorage.setItem(CUSTOM_PRESET_STORAGE, JSON.stringify(items));
}

function renderCustomPresetOptions(selectedValue = $("sheetPreset")?.value) {
  const select = $("sheetPreset");
  if (!select) return;
  select.querySelectorAll("option[data-custom='true']").forEach(option => option.remove());
  const customOption = select.querySelector("option[value='custom']");
  for (const item of loadCustomPresets()) {
    presets[`${CUSTOM_PRESET_PREFIX}${item.id}`] = [item.width, item.height];
    const option = document.createElement("option");
    option.value = `${CUSTOM_PRESET_PREFIX}${item.id}`;
    option.dataset.custom = "true";
    option.textContent = `${item.name} ${item.width} x ${item.height}`;
    select.insertBefore(option, customOption);
  }
  if (selectedValue && [...select.options].some(option => option.value === selectedValue)) {
    select.value = selectedValue;
  }
}

function saveCurrentSheetPreset() {
  let name = $("sheetPresetName").value.trim();
  if (!name) {
    name = window.prompt("保存する任意用紙サイズ名を入力してください。", `任意 ${$("sheetW").value}x${$("sheetH").value}`)?.trim() || "";
  }
  if (!name) {
    setStatus("任意の用紙サイズ名を入力してください。", "error");
    return;
  }
  const settings = readSettings();
  const items = loadCustomPresets();
  const id = safeName(name).toLowerCase();
  const existing = items.findIndex(item => item.id === id);
  const item = {
    id,
    name,
    width: settings.sheetW,
    height: settings.sheetH,
    orientation: settings.sheetOrientation
  };
  if (existing >= 0) {
    items[existing] = item;
  } else {
    items.push(item);
  }
  saveCustomPresets(items);
  renderCustomPresetOptions(`${CUSTOM_PRESET_PREFIX}${id}`);
  $("sheetPreset").value = `${CUSTOM_PRESET_PREFIX}${id}`;
  $("sheetPresetName").value = name;
  setStatus(`任意の用紙サイズ「${name}」を保存しました。`, "ready");
  updatePreview();
}

function deleteCurrentSheetPreset() {
  const value = $("sheetPreset").value;
  if (!value.startsWith(CUSTOM_PRESET_PREFIX)) {
    setStatus("削除できるのは保存した任意の用紙サイズのみです。", "error");
    return;
  }
  const id = value.slice(CUSTOM_PRESET_PREFIX.length);
  const items = loadCustomPresets().filter(item => item.id !== id);
  saveCustomPresets(items);
  delete presets[value];
  renderCustomPresetOptions("custom");
  $("sheetPreset").value = "custom";
  $("sheetPresetName").value = "";
  setStatus("選択した任意の用紙サイズを削除しました。", "ready");
  updatePreview();
}

function swapSheetDirection() {
  const w = $("sheetW").value;
  $("sheetW").value = $("sheetH").value;
  $("sheetH").value = w;
}

function analyzePdfFile(file, pdf, bytes) {
  const raw = pdfBytesToString(bytes);
  const pages = pdf.getPages();
  const sizes = pages.map(page => ({
    width: ptToMm(page.getWidth()),
    height: ptToMm(page.getHeight())
  }));
  const first = sizes[0] || { width: 0, height: 0 };
  const uniform = sizes.every(size =>
    Math.abs(size.width - first.width) < 0.2 && Math.abs(size.height - first.height) < 0.2
  );
  const header = raw.match(/%PDF-(\d\.\d)/);
  const pdfX = raw.match(/\/GTS_PDFXVersion\s*\(([^)]+)\)|<pdfxid:GTS_PDFXVersion>([^<]+)</);
  const pdfA = raw.match(/pdfaid:part=['"]?(\d)|<pdfaid:part>([^<]+)</);
  const outputIntentName = raw.match(/\/OutputConditionIdentifier\s*\(([^)]+)\)/);
  const outputIntent = /\/OutputIntent\b/.test(raw) || Boolean(outputIntentName);
  const color = {
    cmyk: countPdfToken(raw, "/DeviceCMYK"),
    rgb: countPdfToken(raw, "/DeviceRGB"),
    gray: countPdfToken(raw, "/DeviceGray"),
    icc: countPdfToken(raw, "/ICCBased"),
    spot: countPdfToken(raw, "/Separation") + countPdfToken(raw, "/DeviceN"),
    separation: countPdfToken(raw, "/Separation"),
    deviceN: countPdfToken(raw, "/DeviceN")
  };
  return {
    name: file.name,
    bytes: file.size,
    sizeText: formatBytes(file.size),
    pageCount: pdf.getPageCount(),
    firstPageMm: first,
    pageSizesUniform: uniform,
    pageSizesSummary: pageSizeSummary(sizes),
    pdfVersion: header ? header[1] : "不明",
    pdfX: pdfX ? (pdfX[1] || pdfX[2]) : "",
    pdfA: pdfA ? (pdfA[1] || pdfA[2]) : "",
    encrypted: /\/Encrypt\b/.test(raw),
    linearized: /\/Linearized\b/.test(raw),
    tagged: /\/MarkInfo\b[\s\S]{0,160}\/Marked\s+true/.test(raw),
    xmp: /\/Metadata\b|<x:xmpmeta\b/.test(raw),
    outputIntent,
    outputIntentName: outputIntentName ? outputIntentName[1] : "",
    color,
    images: countPdfToken(raw, "/Subtype /Image") + countPdfToken(raw, "/Subtype/Image"),
    fontsEmbedded: countPdfToken(raw, "/FontFile") + countPdfToken(raw, "/FontFile2") + countPdfToken(raw, "/FontFile3"),
    transparency: /\/SMask\b|\/ca\s+0?\.\d+|\/CA\s+0?\.\d+/.test(raw),
    overprint: /\/OP\s+true|\/op\s+true/.test(raw)
  };
}

function pdfBytesToString(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder("latin1").decode(view);
  }
  let out = "";
  const chunk = 32768;
  for (let i = 0; i < view.length; i += chunk) {
    out += String.fromCharCode(...view.subarray(i, i + chunk));
  }
  return out;
}

function countPdfToken(raw, token) {
  return (raw.match(new RegExp(`${escapeRegExp(token)}(?![A-Za-z0-9])`, "g")) || []).length;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pageSizeSummary(sizes) {
  const counts = new Map();
  for (const size of sizes) {
    const key = `${size.width.toFixed(1)} x ${size.height.toFixed(1)} mm`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].map(([key, count]) => `${key} (${count}P)`).join(" / ");
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "不明";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function renderPdfInfo(info) {
  const el = $("pdfInfo");
  if (!el) return;
  if (!info) {
    el.innerHTML = "PDF情報は読み込み後に表示します。";
    return;
  }
  el.innerHTML = [
    `<b>${escapeHtml(info.pageCount)}ページ</b>`,
    `${escapeHtml(info.pageSizesSummary || "ページサイズ不明")}`,
    `容量 ${escapeHtml(info.sizeText)}`,
    `PDF ${escapeHtml(info.pdfVersion)}${info.pdfX ? ` / ${escapeHtml(info.pdfX)}` : ""}`,
    `色: ${colorSummary(info)}`
  ].map(text => `<span>${text}</span>`).join("");
}

function colorSummary(info) {
  const parts = [];
  if (info.color.cmyk) parts.push(`CMYK ${info.color.cmyk}`);
  if (info.color.rgb) parts.push(`RGB ${info.color.rgb}`);
  if (info.color.gray) parts.push(`Gray ${info.color.gray}`);
  if (info.color.spot) parts.push(`特色 ${info.color.spot}`);
  if (info.color.icc) parts.push(`ICC ${info.color.icc}`);
  return parts.length ? parts.join(" / ") : "明示色空間なし";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[ch]));
}

function padPages(count, multiple) {
  const out = Array.from({ length: count }, (_, i) => i + 1);
  if ($("pagePolicy").value === "pad") {
    while (out.length % multiple !== 0) out.push(null);
  }
  return out;
}

function resetPageSequence(count) {
  pageSequence = Array.from({ length: count }, (_, i) => i + 1);
  renderPageSequenceEditor();
}

function renderPageSequenceEditor() {
  const editor = $("pageSequenceEditor");
  if (!editor) return;
  editor.value = pageSequence.map(page => page || "B").join(",");
}

function parsePageSequence(text, sourceCount) {
  const tokens = text.split(/[\s,]+/).map(token => token.trim()).filter(Boolean);
  const out = [];
  for (const token of tokens) {
    if (/^(B|b|blank|白)$/i.test(token)) {
      out.push(null);
      continue;
    }
    const page = Number(token);
    if (!Number.isInteger(page) || page < 1 || page > sourceCount) {
      throw new Error(`ページ指定「${token}」は元PDFの範囲外です。`);
    }
    out.push(page);
  }
  if (!out.length) throw new Error("ページ組替えリストが空です。");
  return out;
}

function applyPageSequenceFromEditor() {
  if (!sourcePdf) {
    setStatus("先にPDFを選択してください。", "error");
    return;
  }
  try {
    pageSequence = parsePageSequence($("pageSequenceEditor").value, sourcePdf.getPageCount());
    previewIndex = 0;
    setStatus(`ページ組替えを適用しました。論理ページ数: ${pageSequence.length}ページ`, "ready");
    updatePreview();
  } catch (error) {
    setStatus(`ページ組替えに失敗しました: ${error.message || error}`, "error");
  }
}

function padPageSequenceToMultiple(multiple) {
  if (!pageSequence.length) return;
  while (pageSequence.length % multiple !== 0) pageSequence.push(null);
  renderPageSequenceEditor();
  previewIndex = 0;
  updatePreview();
}

function sourcePageForLogical(pageNo) {
  if (!pageNo) return null;
  if (!pageSequence.length) return pageNo;
  return pageSequence[pageNo - 1] || null;
}

function logicalPageCount() {
  if (pageSequence.length) return pageSequence.length;
  return sourcePdf ? sourcePdf.getPageCount() : 0;
}

function isSignatureMode(mode) {
  return mode === "booklet" || mode.startsWith("signature-");
}

function isNupMode(mode) {
  return mode === "nup" || mode.startsWith("nup-");
}

function modeLabel(settings) {
  if (settings.mode === "booklet") return "折丁2面付け";
  if (settings.mode.startsWith("signature-")) {
    const preset = modePresets[settings.mode];
    const faces = preset ? preset.cols * preset.rows : settings.cols * settings.rows;
    return `折丁${settings.signatureSize}P ${faces}面付け`;
  }
  if (settings.mode === "nup-repeat") return `${settings.cols}x${settings.rows}同一面反復`;
  if (settings.mode === "nup-cut-stack") return `${settings.cols}x${settings.rows}丁合断裁`;
  if (settings.mode === "nup-work-sheet") return `${settings.cols}x${settings.rows}表裏別版`;
  return `${settings.cols}x${settings.rows}多面付け`;
}

function applyModePreset() {
  const mode = $("mode").value;
  const preset = modePresets[mode];
  if (preset) {
    if ($("product").value === "saddle") $("product").value = "perfect";
    $("signatureSize").value = String(preset.signatureSize);
    $("cols").value = String(preset.cols);
    $("rows").value = String(preset.rows);
    return;
  }
  if (mode === "booklet") {
    $("cols").value = "2";
    $("rows").value = "1";
  } else if (mode === "nup-repeat") {
    $("cols").value = "2";
    $("rows").value = "2";
    $("pageOrder").value = "repeat";
  } else if (mode === "nup-cut-stack") {
    $("cols").value = "2";
    $("rows").value = "2";
    $("pageOrder").value = "normal";
  } else if (mode === "nup-work-sheet") {
    $("cols").value = "2";
    $("rows").value = "1";
    $("pageOrder").value = "normal";
  } else if (mode === "nup") {
    $("cols").value = "2";
    $("rows").value = "2";
    $("pageOrder").value = "normal";
  }
}

function makeBookletPlan(pageCount, settings) {
  if (settings.product === "saddle") return makeSaddlePlan(pageCount, settings);

  const canInsertEvenRemainder = pageCount % 4 === 2;
  const canInsertOddWithBlank = pageCount % 4 === 1;
  const useInsertDuplex = settings.pagePolicy === "insert-duplex" && (canInsertEvenRemainder || canInsertOddWithBlank);
  const sourcePages = Array.from({ length: pageCount }, (_, i) => i + 1);
  const insertPages = useInsertDuplex ? selectedInsertPages(pageCount, settings) : [];
  let pages = useInsertDuplex
    ? sourcePages.filter(pageNo => !insertPages.includes(pageNo))
    : sourcePages;
  if (useInsertDuplex && canInsertOddWithBlank) {
    pages = [...pages, null];
  }
  if (settings.pagePolicy === "pad") {
    while (pages.length % 4 !== 0) pages.push(null);
  }
  const plan = [];
  const sigSize = settings.product === "saddle" ? pages.length : Math.max(4, Number(settings.signatureSize));
  for (let start = 0; start < pages.length; start += sigSize) {
    const sig = pages.slice(start, start + sigSize);
    while (sig.length % 4 !== 0) sig.push(null);
    let low = 0;
    let high = sig.length - 1;
    let folio = 1;
    while (low < high) {
      const front = settings.binding === "right"
        ? [sig[low], sig[high]]
        : [sig[high], sig[low]];
      const back = settings.binding === "right"
        ? [sig[high - 1], sig[low + 1]]
        : [sig[low + 1], sig[high - 1]];
      plan.push({ side: "表", signature: start / sigSize + 1, folio, pages: front });
      plan.push({ side: "裏", signature: start / sigSize + 1, folio, pages: back });
      low += 2;
      high -= 2;
      folio += 1;
    }
  }
  if (useInsertDuplex) {
    const signature = plan.length ? Math.max(...plan.map(item => item.signature)) + 1 : 1;
    const spread = insertDuplexSpread(pageCount, insertPages, settings);
    plan.push({ side: "差込 表", signature, folio: 1, type: "insert-duplex", pages: spread.front, rotations: spread.frontRotations });
    plan.push({ side: "差込 裏", signature, folio: 1, type: "insert-duplex", pages: spread.back, rotations: spread.backRotations });
  }
  return plan;
}

function makeSignaturePlan(pageCount, settings) {
  const sigSize = Math.max(4, Number(settings.signatureSize) || 4);
  const perSide = Math.max(2, Math.ceil(sigSize / 2));
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);
  if (settings.pagePolicy === "pad") {
    while (pages.length % sigSize !== 0) pages.push(null);
  }
  const plan = [];
  for (let start = 0; start < pages.length; start += sigSize) {
    const sig = pages.slice(start, start + sigSize);
    while (sig.length < sigSize) sig.push(null);
    const front = [];
    const back = [];
    let low = 0;
    let high = sig.length - 1;
    while (low < high) {
      if (settings.binding === "right") {
        front.push(sig[low], sig[high]);
        back.push(sig[high - 1], sig[low + 1]);
      } else {
        front.push(sig[high], sig[low]);
        back.push(sig[low + 1], sig[high - 1]);
      }
      low += 2;
      high -= 2;
    }
    while (front.length < perSide) front.push(null);
    while (back.length < perSide) back.push(null);
    const signature = Math.floor(start / sigSize) + 1;
    plan.push({ side: "表", signature, folio: 1, pages: front.slice(0, perSide), type: "signature" });
    plan.push({ side: "裏", signature, folio: 1, pages: back.slice(0, perSide), type: "signature" });
  }
  return plan;
}

function makeSaddlePlan(pageCount, settings) {
  const plan = [];
  const canInsertEvenRemainder = pageCount % 4 === 2;
  const useInsertDuplex = settings.pagePolicy === "insert-duplex" && canInsertEvenRemainder;
  const insertPair = useInsertDuplex ? middleInsertPages(pageCount) : [];
  const paddedCount = useInsertDuplex
    ? pageCount
    : settings.pagePolicy === "pad"
      ? nextMultiple(pageCount, 4)
      : pageCount;
  let low = 1;
  let high = paddedCount;
  let folio = 1;

  while (low < high) {
    if (useInsertDuplex && low === insertPair[0] && high === insertPair[1]) break;
    const front = settings.binding === "right"
      ? [pageOrBlank(low, pageCount), pageOrBlank(high, pageCount)]
      : [pageOrBlank(high, pageCount), pageOrBlank(low, pageCount)];
    const back = settings.binding === "right"
      ? [pageOrBlank(high - 1, pageCount), pageOrBlank(low + 1, pageCount)]
      : [pageOrBlank(low + 1, pageCount), pageOrBlank(high - 1, pageCount)];
    plan.push({ side: "表", signature: 1, folio, pages: front });
    plan.push({ side: "裏", signature: 1, folio, pages: back });
    low += 2;
    high -= 2;
    folio += 1;
  }

  if (useInsertDuplex) {
    const spread = saddleInsertDuplexSpread(insertPair, settings);
    plan.push({
      side: "差込 表",
      signature: 2,
      folio: 1,
      type: "insert-duplex",
      pages: spread.front,
      rotations: spread.frontRotations
    });
    plan.push({
      side: "差込 裏",
      signature: 2,
      folio: 1,
      type: "insert-duplex",
      pages: spread.back,
      rotations: spread.backRotations
    });
  }

  return plan;
}

function saddleInsertDuplexSpread(insertPair, settings) {
  const [frontPage, backPage] = insertPair;
  if (settings.binding === "right") {
    return {
      front: [frontPage, frontPage],
      back: [backPage, backPage],
      frontRotations: [0, 180],
      backRotations: [180, 0]
    };
  }
  return {
    front: [frontPage, frontPage],
    back: [backPage, backPage],
    frontRotations: [180, 0],
    backRotations: [0, 180]
  };
}

function nextMultiple(value, multiple) {
  return Math.ceil(value / multiple) * multiple;
}

function pageOrBlank(pageNo, pageCount) {
  return pageNo >= 1 && pageNo <= pageCount ? pageNo : null;
}

function selectedInsertPages(pageCount, settings) {
  return settings.insertPageSource === "middle"
    ? middleInsertPages(pageCount)
    : tailInsertPages(pageCount);
}

function tailInsertPages(pageCount) {
  return pageCount % 4 === 1 ? [pageCount, null] : [pageCount - 1, pageCount];
}

function middleInsertPages(pageCount) {
  const paddedCount = pageCount % 4 === 1 ? pageCount + 1 : pageCount;
  const left = Math.floor(paddedCount / 2);
  const right = left + 1;
  return [left <= pageCount ? left : null, right <= pageCount ? right : null];
}

function insertDuplexSpread(pageCount, insertPages, settings) {
  if (settings.insertPageSource !== "middle") {
    return saddleInsertDuplexSpread(insertPages, settings);
  }

  return {
    front: [insertPages[0], pageCount - 2],
    back: [pageCount - 3, insertPages[1]],
    frontRotations: [0, 180],
    backRotations: [0, 180]
  };
}

function makeNupPlan(pageCount, settings) {
  const perSide = settings.cols * settings.rows;
  const pages = settings.pageOrder === "reverse"
    ? Array.from({ length: pageCount }, (_, i) => pageCount - i)
    : Array.from({ length: pageCount }, (_, i) => i + 1);
  const plan = [];
  for (let i = 0; i < pages.length; i += perSide) {
    let sheetPages = pages.slice(i, i + perSide);
    if ((settings.pageOrder === "repeat" || settings.mode === "nup-repeat") && sheetPages[0]) {
      sheetPages = Array(perSide).fill(sheetPages[0]);
    } else if (settings.mode === "nup-cut-stack") {
      sheetPages = cutStackPages(pages, i, perSide, settings.rows, settings.cols);
    }
    while (sheetPages.length < perSide) sheetPages.push(null);
    plan.push({ side: "表", signature: Math.floor(i / perSide) + 1, folio: 1, pages: sheetPages });
    if (settings.mode === "nup-work-sheet") {
      const backPages = [...sheetPages].reverse();
      plan.push({ side: "裏", signature: Math.floor(i / perSide) + 1, folio: 1, pages: backPages });
    }
  }
  return plan;
}

function cutStackPages(pages, start, perSide, rows, cols) {
  const out = Array(perSide).fill(null);
  const stackHeight = Math.ceil(pages.length / perSide);
  for (let index = 0; index < perSide; index++) {
    const page = pages[start / perSide + index * stackHeight];
    const row = Math.floor(index / cols);
    const col = index % cols;
    out[row * cols + col] = page || null;
  }
  return out;
}

function currentPlan() {
  const settings = readSettings();
  const count = logicalPageCount();
  const plan = settings.mode === "booklet"
    ? makeBookletPlan(count, settings)
    : settings.mode.startsWith("signature-")
      ? makeSignaturePlan(count, settings)
      : makeNupPlan(count, settings);
  return { settings, count, plan };
}

function updatePreviewControls(total) {
  const pageInput = $("previewPage");
  const totalLabel = $("previewTotal");
  const first = $("previewFirst");
  const prev = $("previewPrev");
  const next = $("previewNext");
  const last = $("previewLast");
  const max = Math.max(total, 1);
  pageInput.max = String(max);
  pageInput.value = String(Math.min(previewIndex + 1, max));
  totalLabel.textContent = `/ ${max}`;
  first.disabled = previewIndex <= 0;
  prev.disabled = previewIndex <= 0;
  next.disabled = previewIndex >= max - 1;
  last.disabled = previewIndex >= max - 1;
}

function updatePreview() {
  const { settings, count, plan } = currentPlan();
  previewIndex = Math.min(Math.max(previewIndex, 0), Math.max(plan.length - 1, 0));
  const sheet = $("sheetInner");
  sheet.innerHTML = "";
  sheet.style.aspectRatio = `${settings.sheetW} / ${settings.sheetH}`;

  const gripper = document.createElement("div");
  gripper.className = "gripper";
  gripper.style.height = `${settings.gripper / settings.sheetH * 100}%`;
  sheet.appendChild(gripper);

  const selected = plan[previewIndex] || { pages: [] };
  const boxes = layoutBoxes(settings, selected);
  boxes.forEach((box, i) => {
    const div = document.createElement("div");
    div.className = "pagebox";
    div.style.left = `${box.x / settings.sheetW * 100}%`;
    div.style.top = `${box.y / settings.sheetH * 100}%`;
    div.style.width = `${box.w / settings.sheetW * 100}%`;
    div.style.height = `${box.h / settings.sheetH * 100}%`;
    const rotation = box.forceRotation ?? 0;
    div.innerHTML = `<span class="pagebox-content" style="transform: rotate(${rotation}deg)">${selected.pages[i] ? `P${selected.pages[i]}` : "白"}<small>${selected.side || "表"} / ${i + 1}面 / ${rotation}°</small></span>`;
    if (settings.printFolios && selected.pages[i]) {
      const folio = document.createElement("span");
      folio.className = `folio-preview ${settings.folioPosition}`;
      folio.textContent = `P${selected.pages[i]}`;
      div.appendChild(folio);
    }
    sheet.appendChild(div);
  });

  if (settings.cropMarks && settings.mode === "booklet" && boxes.length >= 2) {
    const gutterX = (boxes[0].x + boxes[0].w + boxes[1].x) / 2;
    for (const position of ["top", "bottom"]) {
      const mark = document.createElement("div");
      mark.className = `gutter-mark ${position}`;
      mark.style.left = `${gutterX / settings.sheetW * 100}%`;
      sheet.appendChild(mark);
    }
  }

  if (settings.foldMarks && settings.mode === "booklet") {
    const line = document.createElement("div");
    line.className = "foldline";
    line.style.left = "50%";
    line.style.top = `${settings.gripper / settings.sheetH * 100}%`;
    line.style.bottom = `${settings.tail / settings.sheetH * 100}%`;
    sheet.appendChild(line);
  }

  if (settings.spineMarks && isSignatureMode(settings.mode) && boxes.length >= 2) {
    const spine = document.createElement("div");
    const sorted = [...boxes].sort((a, b) => a.x - b.x);
    const gutterX = (sorted[0].x + sorted[0].w + sorted[1].x) / 2;
    const step = settings.spineMarkStep || 6;
    const y = sorted[0].y + Math.min(sorted[0].h - 12, 8 + (selected.signature - 1) * step);
    spine.className = "spine-preview";
    spine.style.left = `${gutterX / settings.sheetW * 100}%`;
    spine.style.top = `${y / settings.sheetH * 100}%`;
    spine.textContent = spineLabel(settings, selected);
    sheet.appendChild(spine);
  }

  const warnings = preflight(settings, count, plan);
  $("preflight").innerHTML = warnings.map(w => `<li class="${w.level || "info"}">${w.text}</li>`).join("");
  renderPlanList(plan);
  $("summary").textContent = count
    ? `${count}ページ / ${settings.sheetW}x${settings.sheetH}mm / ${modeLabel(settings)} / ${plan.length}版面 / 表示 ${previewIndex + 1}`
    : "PDFを選択すると台割と刷り本の概要を表示します。";
  updatePreviewControls(plan.length);
  $("badges").innerHTML = [
    settings.binding === "right" ? "右綴じ" : settings.binding === "left" ? "左綴じ" : "天綴じ",
    settings.duplex,
    `${settings.bleed}mm塗り足し`,
    `${settings.gripper}mmくわえ`,
    settings.grain === "long" ? "縦目" : "横目"
  ].map(x => `<span class="badge">${x}</span>`).join("");

  lastTicket = buildTicket(settings, count, plan, warnings);
  $("downloadTicket").disabled = !count;
}

function renderPlanList(plan) {
  const target = $("impositionPlan");
  if (!target) return;
  if (!plan.length) {
    target.innerHTML = "<p class=\"hint\">PDFを選択すると台割を表示します。</p>";
    return;
  }
  target.innerHTML = plan.map((item, index) => {
    const pages = item.pages.map(page => page ? logicalPageLabel(page) : "白").join(" - ");
    return `<div class="plan-row"><strong>${index + 1}面</strong><span>${escapeHtml(item.side)}</span><span>${escapeHtml(`${item.signature}折 / ${pages}`)}</span></div>`;
  }).join("");
}

function logicalPageLabel(pageNo) {
  const src = sourcePageForLogical(pageNo);
  if (!src) return `L${pageNo}:白`;
  return pageSequence.length ? `L${pageNo}->P${src}` : `P${pageNo}`;
}

function layoutBoxes(settings, side) {
  const boxes = [];
  const imposed = typeof side === "object" ? side : { side };
  const sideName = imposed.side || "表";
  const y = settings.gripper + (settings.sheetH - settings.gripper - settings.tail - settings.trimH) / 2;
  if (settings.mode === "booklet") {
    const totalW = settings.trimW * 2 + settings.gutter + settings.spineGutter;
    let x = (settings.sheetW - totalW) / 2;
    boxes.push({ x, y, w: settings.trimW, h: settings.trimH, gutterSide: "right" });
    x += settings.trimW + settings.gutter + settings.spineGutter;
    boxes.push({ x, y, w: settings.trimW, h: settings.trimH, gutterSide: "left" });
    if (imposed.type === "insert-duplex") {
      const preferred = settings.insertPosition === "right" ? 1 : 0;
      const other = preferred === 0 ? 1 : 0;
      const rotations = imposed.rotations || [];
      return [
        { ...boxes[preferred], forceRotation: rotations[0] ?? 0 },
        { ...boxes[other], forceRotation: rotations[1] ?? 180 }
      ];
    }
    return boxes;
  }

  const cols = settings.mode.startsWith("signature-")
    ? Math.max(1, Number(settings.cols) || 1)
    : settings.cols;
  const rows = settings.mode.startsWith("signature-")
    ? Math.max(1, Number(settings.rows) || 1)
    : settings.rows;
  const cellW = (settings.sheetW - settings.gutter * (cols - 1) - 24) / cols;
  const cellH = (settings.sheetH - settings.gripper - settings.tail - settings.gutter * (rows - 1) - 16) / rows;
  const w = Math.min(settings.trimW, cellW);
  const h = Math.min(settings.trimH, cellH);
  const startX = 12 + (cellW - w) / 2;
  const startY = settings.gripper + 8 + (cellH - h) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      boxes.push({
        x: startX + c * (cellW + settings.gutter),
        y: startY + r * (cellH + settings.gutter),
        w,
        h
      });
    }
  }
  return boxes;
}

function preflight(settings, count, plan) {
  const out = [];
  const signatureGrid = settings.mode.startsWith("signature-");
  const fitW = settings.mode === "booklet"
    ? settings.trimW * 2 + settings.gutter + settings.spineGutter + settings.bleed * 2
    : signatureGrid
      ? settings.cols * settings.trimW + (settings.cols - 1) * settings.gutter + settings.bleed * 2
    : settings.cols * settings.trimW + (settings.cols - 1) * settings.gutter + settings.bleed * 2;
  const fitH = settings.mode === "booklet"
    ? settings.trimH + settings.bleed * 2
    : signatureGrid
      ? settings.rows * settings.trimH + (settings.rows - 1) * settings.gutter + settings.bleed * 2
    : settings.rows * settings.trimH + (settings.rows - 1) * settings.gutter + settings.bleed * 2;
  const availableH = settings.sheetH - settings.gripper - settings.tail;
  if (!count) out.push({ level: "info", text: "PDF未読込です。面付け設定の下見のみ表示しています。" });
  if (pageSequence.length && sourceInfo && pageSequence.length !== sourceInfo.pageCount) {
    out.push({ level: "info", text: `ページ組替え適用中: 元PDF ${sourceInfo.pageCount}ページ → 論理 ${pageSequence.length}ページ。` });
  }
  if (pageSequence.some(page => page === null)) {
    out.push({ level: "info", text: `白ページを ${pageSequence.filter(page => page === null).length}ページ含みます。` });
  }
  if (sourceInfo) {
    out.push({ level: "ok", text: `PDF情報: ${sourceInfo.pageCount}ページ / ${sourceInfo.pageSizesSummary} / ${sourceInfo.sizeText} / PDF ${sourceInfo.pdfVersion}` });
    out.push({ level: "info", text: `カラー検出: ${colorSummary(sourceInfo)}。数値はPDF内部で検出した色空間指定の出現数です。` });
    if (sourceInfo.color.rgb) out.push({ level: "warn", text: "RGB色空間が含まれています。商業印刷ではCMYK変換条件と色味変化を確認してください。" });
    if (sourceInfo.color.spot) out.push({ level: "info", text: `特色版を検出しました。Separation ${sourceInfo.color.separation} / DeviceN ${sourceInfo.color.deviceN}。特色名と刷版分版を確認してください。` });
    if (sourceInfo.color.icc) out.push({ level: "ok", text: `埋め込みICCカラープロファイル参照を検出しました: ${sourceInfo.color.icc}件。` });
    if (sourceInfo.outputIntent) out.push({ level: "ok", text: `OutputIntentを検出しました${sourceInfo.outputIntentName ? `: ${sourceInfo.outputIntentName}` : "。"}` });
    if (!sourceInfo.outputIntent && !sourceInfo.color.icc) out.push({ level: "warn", text: "OutputIntentまたはICCプロファイルを検出できません。印刷条件プロファイルの指定を確認してください。" });
    if (sourceInfo.pdfX) out.push({ level: "ok", text: `PDF/X保存形式を検出しました: ${sourceInfo.pdfX}` });
    if (sourceInfo.pdfA) out.push({ level: "info", text: `PDF/Aメタデータを検出しました: part ${sourceInfo.pdfA}` });
    if (sourceInfo.encrypted) out.push({ level: "warn", text: "暗号化PDFの可能性があります。印刷工程で処理できるか確認してください。" });
    if (sourceInfo.transparency) out.push({ level: "warn", text: "透明効果またはソフトマスクを検出しました。RIP互換性と透明分割設定を確認してください。" });
    if (sourceInfo.overprint) out.push({ level: "info", text: "オーバープリント設定を検出しました。墨ノセ・特色ノセの意図を確認してください。" });
    if (!sourceInfo.pageSizesUniform) out.push({ level: "warn", text: "ページサイズが混在しています。仕上りサイズ自動取得後も全ページの寸法差を確認してください。" });
    if (sourceInfo.images) out.push({ level: "info", text: `画像オブジェクトを検出しました: ${sourceInfo.images}件。解像度の詳細確認は外部プリフライトで確認してください。` });
    if (sourceInfo.fontsEmbedded) out.push({ level: "ok", text: `埋め込みフォントらしきFontFileを検出しました: ${sourceInfo.fontsEmbedded}件。` });
    if (!sourceInfo.fontsEmbedded) out.push({ level: "warn", text: "埋め込みフォント情報を検出できません。文字化け防止のためフォント埋め込みを確認してください。" });
  }
  if (count && settings.mode.startsWith("signature-") && settings.pagePolicy === "insert-duplex" && count % settings.signatureSize !== 0) {
    out.push({ level: "warn", text: "折丁多面付けでは差し込み両面の別版出力は未適用です。折丁ページ数に合うよう白ページ追加または台割確認を行ってください。" });
  } else if (count && (count % 4 === 2 || count % 4 === 1) && settings.mode === "booklet" && settings.pagePolicy === "insert-duplex") {
    const oddNote = count % 4 === 1 ? "奇数ページのため末尾に白ページを1ページ追加し、" : "";
    const sourceLabel = settings.product === "saddle" || settings.insertPageSource === "middle" ? "本文中央の2ページ" : "末尾の2ページ";
    out.push({ level: "info", text: `${oddNote}${sourceLabel}を差し込み両面として別版面に出力します。` });
  } else if (count && count % 4 === 3 && settings.mode === "booklet" && settings.pagePolicy === "insert-duplex") {
    out.push({ level: "info", text: "奇数ページのため末尾に白ページを1ページ追加し、通常の4ページ単位の折丁として出力します。" });
  } else if (count && count % 4 !== 0 && settings.mode === "booklet") {
    out.push({ level: "warn", text: "中綴じは4ページ単位です。白ページ追加、差し込み両面、または台割確認が必要です。" });
  }
  if (count && settings.mode.startsWith("signature-") && count % settings.signatureSize !== 0 && settings.pagePolicy !== "pad") {
    out.push({ level: "warn", text: `${settings.signatureSize}P折丁の単位で割り切れません。白ページ追加または別丁構成を確認してください。` });
  }
  if (fitW > settings.sheetW || fitH > availableH) out.push({ level: "warn", text: "指定した仕上り・ドブ・塗り足しが用紙有効領域を超えています。" });
  if (settings.gripper < 8) out.push({ level: "warn", text: "くわえが8mm未満です。枚葉オフセットでは機械条件を確認してください。" });
  if (settings.bleed < 3) out.push({ level: "warn", text: "塗り足しが3mm未満です。断裁ズレ許容に注意してください。" });
  if (isSignatureMode(settings.mode) && settings.creep > 0 && settings.product !== "saddle") out.push({ level: "warn", text: "束見込み補正は中綴じで特に有効です。無線綴じでは背側削りと台割を確認してください。" });
  if (settings.spineMarks && settings.product === "saddle") out.push({ level: "warn", text: "背丁・背標は無線綴じ等の丁合管理用です。中綴じでは原則入れません。" });
  if (settings.spineMarks && settings.product === "flat") out.push({ level: "warn", text: "端物では背が形成されないため、背丁・背標は管理マークとしてのみ扱います。" });
  if (settings.grain === "short" && settings.product !== "flat") out.push({ level: "warn", text: "冊子物で横目指定です。背割れ・開き具合・折り方向を確認してください。" });
  out.push({ level: "info", text: `${plan.length || 0}面の出力予定です。ジョブチケットに針・紙目・両面方式・マーク条件を記録します。` });
  return out;
}

function buildTicket(settings, count, plan, warnings) {
  return {
    schema: "jp.print.imposition.ticket.v1",
    createdAt: new Date().toISOString(),
    job: {
      name: settings.jobName,
      sourcePages: count,
      folioStart: settings.folioStart,
      product: settings.product,
      binding: settings.binding
    },
    source: sourceInfo,
    pageSequence: pageSequence.map(page => page || "blank"),
    paper: {
      sheetMm: [settings.sheetW, settings.sheetH],
      orientation: settings.sheetOrientation,
      preset: settings.sheetPreset,
      gripperMm: settings.gripper,
      tailMm: settings.tail,
      guide: settings.guide,
      grain: settings.grain
    },
    imposition: {
      mode: settings.mode,
      duplex: settings.duplex,
      columns: settings.cols,
      rows: settings.rows,
      gutterMm: settings.gutter,
      spineGutterMm: settings.spineGutter,
      creepMm: settings.creep,
      signatureSize: settings.signatureSize,
      pagePolicy: settings.pagePolicy,
      insertPosition: settings.insertPosition,
      insertPageSource: settings.insertPageSource,
      plan
    },
    marks: {
      cropMarks: settings.cropMarks,
      cropMarkStyle: settings.cropMarkStyle,
      markColor: settings.markColor,
      foldMarks: settings.foldMarks,
      registerMarks: settings.registerMarks,
      colorBars: settings.colorBars,
      slug: settings.slug,
      printFolios: settings.printFolios,
      folioPosition: settings.folioPosition,
      folioSizePt: settings.folioSize,
      folioFont: settings.folioFont,
      folioHige: settings.folioHige,
      folioColor: settings.folioColor,
      folioCmyk: [settings.folioC, settings.folioM, settings.folioY, settings.folioK],
      spineMarks: settings.spineMarks,
      spineTextMode: settings.spineTextMode,
      spineText: settings.spineText,
      spineTextSizePt: settings.spineTextSize,
      spineMarkSizeMm: settings.spineMarkSize,
      spineMarkStepMm: settings.spineMarkStep,
      spineMarkShape: settings.spineMarkShape,
      markOffsetMm: settings.markOffset,
      markWeightPt: settings.markWeight
    },
    preflight: warnings
  };
}

async function generatePdf() {
  if (!sourceBytes || !window.PDFLib) {
    setStatus("PDFを選択し、PDFエンジンの準備完了を待ってください。", "error");
    return;
  }
  const button = $("makePdf");
  button.disabled = true;
  setStatus("面付けPDFを生成中です。", "busy");
  try {
    const { PDFDocument, degrees, rgb, StandardFonts } = PDFLib;
    const { settings, plan } = currentPlan();
    const src = await PDFDocument.load(sourceBytes);
    const out = await PDFDocument.create();
    const font = await out.embedFont(StandardFonts.Helvetica);
    const folioFont = await out.embedFont(resolveStandardFont(StandardFonts, settings.folioFont));
    const sheetW = mmToPt(settings.sheetW);
    const sheetH = mmToPt(settings.sheetH);
    const trimW = mmToPt(settings.trimW);
    const trimH = mmToPt(settings.trimH);

    for (const imposed of plan) {
      const page = out.addPage([sheetW, sheetH]);
      drawMarks(page, settings, font, imposed);
      const boxes = layoutBoxes(settings, imposed).slice(0, imposed.pages.length);
      for (let i = 0; i < boxes.length; i++) {
        const pageNo = imposed.pages[i];
        const sourcePageNo = sourcePageForLogical(pageNo);
        const b = boxes[i];
        const x = mmToPt(b.x);
        const y = sheetH - mmToPt(b.y + b.h);
        if (!sourcePageNo) {
          page.drawRectangle({ x, y, width: trimW, height: trimH, borderColor: rgb(.75, .75, .75), borderWidth: .4 });
          page.drawText("Blank", { x: x + 12, y: y + trimH / 2, size: 10, font, color: rgb(.55, .55, .55) });
          continue;
        }
        const [embedded] = await out.embedPages([src.getPage(sourcePageNo - 1)]);
        const srcW = embedded.width;
        const srcH = embedded.height;
        const rot = b.forceRotation ?? resolveRotation(settings, srcW, srcH, trimW, trimH);
        const pageSize = rotatedPageSize(srcW, srcH, rot);
        const scale = Math.min(trimW / pageSize.width, trimH / pageSize.height);
        const creep = creepOffset(settings, pageNo, src.getPageCount());
        drawPlacedPage(page, embedded, {
          x: x + mmToPt(creep),
          y,
          width: trimW,
          height: trimH,
          sourceWidth: pageSize.width,
          sourceHeight: pageSize.height,
          originalWidth: srcW,
          originalHeight: srcH,
          scale,
          rotate: rot,
          mirrorX: false
        });
        if (settings.cropMarks) drawCropMarks(page, x, y, trimW, trimH, settings, b);
        if (settings.printFolios) drawFolio(page, pageNo, x, y, trimW, trimH, settings, folioFont);
      }
      if (settings.spineMarks && isSignatureMode(settings.mode)) {
        drawSpineControlMarks(page, settings, font, imposed, boxes, sheetH);
      }
      if (settings.cropMarks && isSignatureMode(settings.mode)) {
        drawGutterCenterMarks(page, boxes, sheetH, settings);
      }
    }

    const bytes = await out.save();
    const saved = await saveBlob(new Blob([bytes], { type: "application/pdf" }), `${safeName(settings.jobName)}_imposed.pdf`, "application/pdf");
    if (saved === "picked") {
      setStatus("面付けPDFを指定した場所に保存しました。", "ready");
    } else if (saved === "download") {
      setStatus("面付けPDFを生成しました。ブラウザのダウンロード履歴を確認してください。", "ready");
    } else {
      setStatus("保存をキャンセルしました。", "busy");
    }
  } catch (error) {
    console.error(error);
    setStatus(`生成に失敗しました: ${error.message || error}`, "error");
  } finally {
    button.disabled = !sourceBytes || !window.PDFLib;
  }
}

function resolveRotation(settings, srcW, srcH, trimW, trimH) {
  if (settings.rotation !== "auto") return Number(settings.rotation);
  const sourceLandscape = srcW > srcH;
  const targetLandscape = trimW > trimH;
  return sourceLandscape === targetLandscape ? 0 : 90;
}

function rotatedPageSize(width, height, rotation) {
  const normalized = ((rotation % 360) + 360) % 360;
  return normalized === 90 || normalized === 270
    ? { width: height, height: width }
    : { width, height };
}

function resolveStandardFont(StandardFonts, value) {
  if (value === "times") return StandardFonts.TimesRoman;
  if (value === "courier") return StandardFonts.Courier;
  return StandardFonts.Helvetica;
}

function drawPlacedPage(page, embedded, placement) {
  const { degrees } = PDFLib;
  const drawnW = placement.sourceWidth * placement.scale;
  const drawnH = placement.sourceHeight * placement.scale;
  const baseX = placement.x + (placement.width - drawnW) / 2;
  const baseY = placement.y + (placement.height - drawnH) / 2;
  const originalW = placement.originalWidth || placement.sourceWidth;
  const originalH = placement.originalHeight || placement.sourceHeight;
  const normalized = ((placement.rotate % 360) + 360) % 360;
  if (placement.mirrorX) {
    page.drawPage(embedded, {
      x: baseX + drawnW,
      y: baseY,
      xScale: -placement.scale,
      yScale: placement.scale,
      rotate: degrees(placement.rotate)
    });
    return;
  }
  if (normalized === 90) {
    page.drawPage(embedded, {
      x: baseX + originalH * placement.scale,
      y: baseY,
      xScale: placement.scale,
      yScale: placement.scale,
      rotate: degrees(90)
    });
    return;
  }
  if (normalized === 180) {
    page.drawPage(embedded, {
      x: baseX + originalW * placement.scale,
      y: baseY + originalH * placement.scale,
      xScale: placement.scale,
      yScale: placement.scale,
      rotate: degrees(180)
    });
    return;
  }
  if (normalized === 270) {
    page.drawPage(embedded, {
      x: baseX,
      y: baseY + originalW * placement.scale,
      xScale: placement.scale,
      yScale: placement.scale,
      rotate: degrees(270)
    });
    return;
  }
  page.drawPage(embedded, {
    x: baseX,
    y: baseY,
    xScale: placement.scale,
    yScale: placement.scale,
    rotate: degrees(placement.rotate)
  });
}

function drawFolio(page, pageNo, x, y, w, h, settings, font) {
  const text = `P${pageNo}`;
  const size = Math.max(3, settings.folioSize || 6);
  const color = folioInk(settings);
  const margin = mmToPt(3);
  const textWidth = font.widthOfTextAtSize(text, size);
  const textHeight = size;
  const isTop = settings.folioPosition.startsWith("top");
  const isCenter = settings.folioPosition.endsWith("center");
  const isRight = settings.folioPosition.endsWith("right");
  const tx = isCenter ? x + (w - textWidth) / 2 : isRight ? x + w - margin - textWidth : x + margin;
  const ty = isTop ? y + h - margin - textHeight : y + margin;
  page.drawText(text, { x: tx, y: ty, size, font, color });
  if (settings.folioHige) {
    const lineY = ty + textHeight / 2;
    const gap = mmToPt(1.4);
    const len = mmToPt(4);
    page.drawLine({ start: { x: tx - gap - len, y: lineY }, end: { x: tx - gap, y: lineY }, thickness: settings.markWeight, color });
    page.drawLine({ start: { x: tx + textWidth + gap, y: lineY }, end: { x: tx + textWidth + gap + len, y: lineY }, thickness: settings.markWeight, color });
  }
}

function spineLabel(settings, imposed) {
  const ori = `${imposed.signature || 1}折`;
  if (settings.spineTextMode === "signature-only") return ori;
  const base = settings.spineTextMode === "custom" && settings.spineText
    ? settings.spineText
    : settings.jobName;
  return `${base || "Job"} ${ori}`;
}

function drawSpineControlMarks(page, settings, font, imposed, boxes, sheetH) {
  if (boxes.length < 2) return;
  const sorted = [...boxes].sort((a, b) => a.x - b.x);
  const gutterMm = (sorted[0].x + sorted[0].w + sorted[1].x) / 2;
  const gutterX = mmToPt(gutterMm);
  const topY = sheetH - mmToPt(sorted[0].y);
  const markSize = mmToPt(settings.spineMarkSize || 4);
  const step = mmToPt(settings.spineMarkStep || 6);
  const index = Math.max(0, (imposed.signature || 1) - 1);
  const markY = topY - mmToPt(12) - index * step;
  const text = asciiSlug(spineLabel(settings, imposed));
  const textSize = Math.max(3, settings.spineTextSize || 6);
  const color = markInk(settings);

  if (settings.spineMarkShape === "circle") {
    page.drawCircle({ x: gutterX, y: markY, size: markSize / 2, color });
  } else if (settings.spineMarkShape === "bar") {
    page.drawRectangle({ x: gutterX - markSize / 2, y: markY - markSize * 1.5, width: markSize, height: markSize * 3, color });
  } else {
    page.drawRectangle({ x: gutterX - markSize / 2, y: markY - markSize / 2, width: markSize, height: markSize, color });
  }

  page.drawText(text, {
    x: gutterX + mmToPt(2),
    y: markY - textSize / 2,
    size: textSize,
    font,
    color
  });
}

function markInk(settings) {
  const { cmyk } = PDFLib;
  return settings.markColor === "black" ? cmyk(0, 0, 0, 1) : cmyk(1, 1, 1, 1);
}

function folioInk(settings) {
  const { cmyk } = PDFLib;
  if (settings.folioColor === "registration") return cmyk(1, 1, 1, 1);
  if (settings.folioColor === "rich-black") return cmyk(.6, .4, .4, 1);
  if (settings.folioColor === "custom-cmyk") {
    return cmyk(
      clampPercent(settings.folioC),
      clampPercent(settings.folioM),
      clampPercent(settings.folioY),
      clampPercent(settings.folioK)
    );
  }
  return cmyk(0, 0, 0, 1);
}

function clampPercent(value) {
  return Math.min(100, Math.max(0, Number(value) || 0)) / 100;
}

function creepOffset(settings, pageNo, pageCount) {
  if (!isSignatureMode(settings.mode) || !settings.creep) return 0;
  const center = (pageCount + 1) / 2;
  const direction = settings.binding === "right" ? -1 : 1;
  return direction * (Math.abs(pageNo - center) / pageCount) * settings.creep;
}

function drawMarks(page, settings, font, imposed) {
  const { rgb, cmyk } = PDFLib;
  const markColor = markInk(settings);
  const w = mmToPt(settings.sheetW);
  const h = mmToPt(settings.sheetH);
  const grip = mmToPt(settings.gripper);
  page.drawRectangle({ x: 0, y: h - grip, width: w, height: grip, color: rgb(.93, .98, .97) });
  if (settings.slug) {
    const text = [
      `Job:${asciiSlug(settings.jobName)}`,
      `Side:${asciiSide(imposed.side)}`,
      `Sig:${imposed.signature}`,
      `Folio:${imposed.folio}`,
      `Duplex:${settings.duplex}`,
      `Guide:${settings.guide}`,
      `Grain:${settings.grain}`
    ].join(" / ");
    page.drawText(text, { x: mmToPt(8), y: h - mmToPt(7), size: 7, font, color: rgb(.05, .05, .05) });
  }
  if (settings.registerMarks) {
    [[w / 2, h - mmToPt(10)], [w / 2, mmToPt(10)], [mmToPt(10), h / 2], [w - mmToPt(10), h / 2]].forEach(([x, y]) => {
      page.drawCircle({ x, y, size: 4, borderColor: markColor, borderWidth: .3 });
      page.drawLine({ start: { x: x - 8, y }, end: { x: x + 8, y }, thickness: .25, color: markColor });
      page.drawLine({ start: { x, y: y - 8 }, end: { x, y: y + 8 }, thickness: .25, color: markColor });
    });
  }
  if (settings.colorBars) {
    const patch = mmToPt(settings.patchSize);
    const colors = [cmyk(1,0,0,0), cmyk(0,1,0,0), cmyk(0,0,1,0), cmyk(0,0,0,1), cmyk(1,1,0,0), cmyk(0,1,1,0), cmyk(1,0,1,0)];
    const y = settings.barPosition === "tail" ? mmToPt(3) : h - grip + mmToPt(2);
    colors.forEach((color, i) => page.drawRectangle({ x: mmToPt(28) + i * patch, y, width: patch, height: patch, color }));
    if (settings.barPosition === "both") {
      colors.forEach((color, i) => page.drawRectangle({ x: mmToPt(28) + i * patch, y: mmToPt(3), width: patch, height: patch, color }));
    }
  }
}

function drawCropMarks(page, x, y, w, h, settings, box = {}) {
  if (settings.cropMarkStyle === "japanese-double") {
    drawJapaneseDoubleCropMarks(page, x, y, w, h, settings, box.gutterSide);
    return;
  }
  const len = mmToPt(7);
  const off = mmToPt(settings.markOffset);
  const t = settings.markWeight;
  const color = markInk(settings);
  const marks = [
    [[x - off - len, y + h], [x - off, y + h]], [[x, y + h + off], [x, y + h + off + len]],
    [[x + w + off, y + h], [x + w + off + len, y + h]], [[x + w, y + h + off], [x + w, y + h + off + len]],
    [[x - off - len, y], [x - off, y]], [[x, y - off], [x, y - off - len]],
    [[x + w + off, y], [x + w + off + len, y]], [[x + w, y - off], [x + w, y - off - len]]
  ];
  marks.forEach(([[x1, y1], [x2, y2]]) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: t, color }));
  drawCenterCropMarks(page, x, y, w, h, settings, "western", box.gutterSide);
}

function drawGutterCenterMarks(page, boxes, sheetH, settings) {
  if (boxes.length < 2) return;
  const sorted = [...boxes].sort((a, b) => a.x - b.x);
  const gutterX = mmToPt((sorted[0].x + sorted[0].w + sorted[1].x) / 2);
  const topY = sheetH - mmToPt(sorted[0].y);
  const bottomY = sheetH - mmToPt(sorted[0].y + sorted[0].h);
  const gap = mmToPt(settings.markOffset);
  const len = mmToPt(12);
  const color = markInk(settings);
  const thickness = settings.markWeight;
  page.drawLine({ start: { x: gutterX, y: topY + gap }, end: { x: gutterX, y: topY + gap + len }, thickness, color });
  page.drawLine({ start: { x: gutterX, y: bottomY - gap }, end: { x: gutterX, y: bottomY - gap - len }, thickness, color });
}

function drawJapaneseDoubleCropMarks(page, x, y, w, h, settings, gutterSide) {
  const color = markInk(settings);
  const t = settings.markWeight;
  const len = mmToPt(10);
  const gap = mmToPt(settings.markOffset);
  const bleed = mmToPt(settings.bleed || 3);
  const left = x;
  const right = x + w;
  const bottom = y;
  const top = y + h;

  drawJapaneseCorner(left, top, -1, 1, gutterSide === "left");
  drawJapaneseCorner(right, top, 1, 1, gutterSide === "right");
  drawJapaneseCorner(left, bottom, -1, -1, gutterSide === "left");
  drawJapaneseCorner(right, bottom, 1, -1, gutterSide === "right");
  drawCenterCropMarks(page, x, y, w, h, settings, "japanese", gutterSide);

  function drawJapaneseCorner(cx, cy, sx, sy, isGutterSide) {
    if (isGutterSide) return;

    const horizontalStart = cx + sx * gap;
    const horizontalEnd = cx + sx * (gap + len);
    const verticalStart = cy + sy * gap;
    const verticalEnd = cy + sy * (gap + len);
    const bleedX = cx + sx * bleed;
    const bleedY = cy + sy * bleed;

    drawLine(horizontalStart, cy, horizontalEnd, cy);
    drawLine(cx, verticalStart, cx, verticalEnd);
    drawLine(horizontalStart, bleedY, horizontalEnd, bleedY);
    drawLine(bleedX, verticalStart, bleedX, verticalEnd);
  }

  function drawLine(x1, y1, x2, y2) {
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: t,
      color
    });
  }
}

function drawCenterCropMarks(page, x, y, w, h, settings, style, gutterSide) {
  const color = markInk(settings);
  const t = settings.markWeight;
  const gap = mmToPt(settings.markOffset);
  const len = mmToPt(style === "japanese" ? 9 : 14);
  const centerX = x + w / 2;
  const centerY = y + h / 2;
  drawLine(centerX, y + h + gap, centerX, y + h + gap + len);
  drawLine(centerX, y - gap, centerX, y - gap - len);
  if (gutterSide !== "left") drawLine(x - gap, centerY, x - gap - len, centerY);
  if (gutterSide !== "right") drawLine(x + w + gap, centerY, x + w + gap + len, centerY);

  function drawLine(x1, y1, x2, y2) {
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: t,
      color
    });
  }
}

async function saveBlob(blob, name, mimeType) {
  if ($("chooseSaveLocation")?.checked && window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{
          description: mimeType === "application/pdf" ? "PDF file" : "JSON file",
          accept: { [mimeType]: [`.${name.split(".").pop()}`] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "picked";
    } catch (error) {
      if (error && error.name === "AbortError") return "cancelled";
      console.warn("Save picker failed. Falling back to download.", error);
    }
  }
  downloadBlob(blob, name);
  return "download";
}

function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

function safeName(name) {
  return (name || "imposition").replace(/[\\/:*?"<>|]/g, "_");
}

function asciiSlug(value) {
  const text = String(value || "Untitled").normalize("NFKD").replace(/[^\x20-\x7E]/g, "_");
  return text.replace(/\s+/g, " ").trim().slice(0, 80) || "Untitled";
}

function asciiSide(side) {
  const labels = {
    "表": "Front",
    "裏": "Back",
    "差込 表": "Insert Front WT",
    "差込 裏": "Insert Back WT"
  };
  return labels[side] || asciiSlug(side);
}

function setStatus(message, state = "ready") {
  const status = $("engineStatus");
  status.textContent = message;
  status.classList.toggle("ready", state === "ready");
  status.classList.toggle("error", state === "error");
  status.classList.toggle("busy", state === "busy");
}

function wire() {
  const status = $("engineStatus");
  let ticks = 0;
  const wait = setInterval(() => {
    ticks += 1;
    if (window.PDFLib) {
      clearInterval(wait);
      setStatus("PDFエンジン準備完了", "ready");
      $("makePdf").disabled = !sourceBytes;
    } else if (ticks > 80) {
      clearInterval(wait);
      setStatus("PDFエンジン未読込。ページを再読み込みしてください。", "error");
    }
  }, 150);

  document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tabpane").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`[data-pane="${tab.dataset.tab}"]`).classList.add("active");
  }));

  renderCustomPresetOptions();
  renderImpositionPresetOptions();
  restoreLastSettings();

  $("sheetPreset").addEventListener("change", () => {
    applySheetPreset();
    persistLastSettings();
    updatePreview();
  });

  $("sheetOrientation").addEventListener("change", () => {
    if ($("sheetPreset").value.startsWith(CUSTOM_PRESET_PREFIX)) {
      swapSheetDirection();
    } else if (presets[$("sheetPreset").value]) {
      applySheetPreset();
    } else {
      swapSheetDirection();
    }
    persistLastSettings();
    updatePreview();
  });

  ids.forEach(id => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("input", () => {
      persistLastSettings();
      updatePreview();
    });
    el.addEventListener("change", () => {
      persistLastSettings();
      updatePreview();
    });
  });
  $("mode").addEventListener("change", () => {
    applyModePreset();
    persistLastSettings();
    updatePreview();
  });
  $("impositionPreset").addEventListener("change", applySelectedImpositionPreset);
  $("saveImpositionPreset").addEventListener("click", saveCurrentImpositionPreset);
  $("updateImpositionPreset").addEventListener("click", updateSelectedImpositionPreset);
  $("renameImpositionPreset").addEventListener("click", renameSelectedImpositionPreset);
  $("loadImpositionPresetEditor").addEventListener("click", showSelectedImpositionPreset);
  $("applyImpositionPresetEditor").addEventListener("click", applyImpositionPresetEditor);
  $("deleteImpositionPreset").addEventListener("click", deleteSelectedImpositionPreset);
  $("saveSheetPreset").addEventListener("click", saveCurrentSheetPreset);
  $("deleteSheetPreset").addEventListener("click", deleteCurrentSheetPreset);
  $("loadPageSequence").addEventListener("click", renderPageSequenceEditor);
  $("applyPageSequence").addEventListener("click", applyPageSequenceFromEditor);
  $("reversePageSequence").addEventListener("click", () => {
    if (!pageSequence.length && sourcePdf) resetPageSequence(sourcePdf.getPageCount());
    pageSequence.reverse();
    renderPageSequenceEditor();
    previewIndex = 0;
    updatePreview();
  });
  $("appendBlankPage").addEventListener("click", () => {
    if (!pageSequence.length && sourcePdf) resetPageSequence(sourcePdf.getPageCount());
    pageSequence.push(null);
    renderPageSequenceEditor();
    updatePreview();
  });
  $("padPageSequence4").addEventListener("click", () => {
    if (!pageSequence.length && sourcePdf) resetPageSequence(sourcePdf.getPageCount());
    padPageSequenceToMultiple(4);
  });
  $("previewFirst").addEventListener("click", () => {
    previewIndex = 0;
    updatePreview();
  });
  $("previewPrev").addEventListener("click", () => {
    previewIndex = Math.max(0, previewIndex - 1);
    updatePreview();
  });
  $("previewNext").addEventListener("click", () => {
    const { plan } = currentPlan();
    previewIndex = Math.min(Math.max(plan.length - 1, 0), previewIndex + 1);
    updatePreview();
  });
  $("previewLast").addEventListener("click", () => {
    const { plan } = currentPlan();
    previewIndex = Math.max(plan.length - 1, 0);
    updatePreview();
  });
  $("previewPage").addEventListener("change", () => {
    const { plan } = currentPlan();
    const max = Math.max(plan.length, 1);
    previewIndex = Math.min(max - 1, Math.max(0, Number($("previewPage").value) - 1 || 0));
    updatePreview();
  });
  $("pdfFile").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!window.PDFLib) {
      setStatus("PDFエンジンを読み込み中です。数秒後にもう一度PDFを選択してください。", "busy");
      event.target.value = "";
      return;
    }
    try {
      $("fileName").textContent = file.name;
      sourceBytes = await file.arrayBuffer();
      sourcePdf = await PDFLib.PDFDocument.load(sourceBytes);
      sourceInfo = analyzePdfFile(file, sourcePdf, sourceBytes);
      renderPdfInfo(sourceInfo);
      resetPageSequence(sourcePdf.getPageCount());
      const page = sourcePdf.getPage(0);
      $("trimW").value = ptToMm(page.getWidth()).toFixed(1);
      $("trimH").value = ptToMm(page.getHeight()).toFixed(1);
      $("makePdf").disabled = !window.PDFLib;
      setStatus("PDFを読み込みました。面付けPDFを生成できます。", "ready");
      updatePreview();
    } catch (error) {
      sourceBytes = null;
      sourcePdf = null;
      sourceInfo = null;
      pageSequence = [];
      renderPdfInfo(null);
      renderPageSequenceEditor();
      $("makePdf").disabled = true;
      setStatus(`PDF読込に失敗しました: ${error.message || error}`, "error");
    }
  });

  $("makePdf").addEventListener("click", generatePdf);
  $("downloadTicket").addEventListener("click", async () => {
    const data = JSON.stringify(lastTicket, null, 2);
    const saved = await saveBlob(new Blob([data], { type: "application/json" }), `${safeName(readSettings().jobName)}_job-ticket.json`, "application/json");
    if (saved === "picked") {
      setStatus("ジョブチケットを指定した場所に保存しました。", "ready");
    } else if (saved === "download") {
      setStatus("ジョブチケットを生成しました。ブラウザのダウンロード履歴を確認してください。", "ready");
    } else {
      setStatus("保存をキャンセルしました。", "busy");
    }
  });

  updatePreview();
}

window.addEventListener("DOMContentLoaded", wire);
