const $ = (id) => document.getElementById(id);
const mmToPt = (mm) => mm * 72 / 25.4;
const ptToMm = (pt) => pt * 25.4 / 72;

let sourceBytes = null;
let sourcePdf = null;
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
  "788x1091": [788, 1091],
  "545x788": [545, 788],
  "625x880": [625, 880],
  "765x1085": [765, 1085],
  "450x625": [450, 625],
  "542x765": [542, 765],
  "320x450": [320, 450],
  "364x515": [364, 515],
};

const ids = [
  "jobName", "trimW", "trimH", "bleed", "safeMargin", "binding", "product",
  "pagePolicy", "folioStart", "sheetPreset", "sheetOrientation", "sheetW", "sheetH", "gripper",
  "tail", "guide", "grain", "mode", "duplex", "cols", "rows", "gutter",
  "spineGutter", "creep", "signatureSize", "rotation", "pageOrder",
  "insertPosition", "insertPageSource", "cropMarks", "cropMarkStyle", "markColor", "foldMarks", "registerMarks", "colorBars", "slug",
  "printFolios", "folioPosition", "folioSize", "folioFont", "folioHige", "folioColor", "folioC", "folioM", "folioY", "folioK",
  "mirrorBack", "markOffset", "markWeight", "patchSize", "barPosition"
];

function readSettings() {
  const s = {};
  for (const id of ids) {
    const el = $(id);
    s[id] = el.type === "checkbox" ? el.checked : el.value;
  }
  for (const id of ["trimW", "trimH", "bleed", "safeMargin", "folioStart", "sheetW", "sheetH", "gripper", "tail", "cols", "rows", "gutter", "spineGutter", "creep", "signatureSize", "markOffset", "markWeight", "patchSize", "folioSize", "folioC", "folioM", "folioY", "folioK"]) {
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
  const name = $("impositionPresetName").value.trim();
  if (!name) {
    setStatus("面付設定名を入力してください。", "error");
    return;
  }
  const items = loadImpositionPresets();
  const id = safeName(name).toLowerCase();
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

function applySelectedImpositionPreset() {
  const value = $("impositionPreset").value;
  if (!value.startsWith(IMPOSITION_PRESET_PREFIX)) return;
  const id = value.slice(IMPOSITION_PRESET_PREFIX.length);
  const item = loadImpositionPresets().find(preset => preset.id === id);
  if (!item) return;
  applySettings(item.settings);
  persistLastSettings();
  setStatus(`面付設定「${item.name}」を読み込みました。`, "ready");
  updatePreview();
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
  const name = $("sheetPresetName").value.trim();
  if (!name) {
    setStatus("マスタ用紙サイズ名を入力してください。", "error");
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
  setStatus(`マスタ用紙サイズ「${name}」を保存しました。`, "ready");
  updatePreview();
}

function deleteCurrentSheetPreset() {
  const value = $("sheetPreset").value;
  if (!value.startsWith(CUSTOM_PRESET_PREFIX)) {
    setStatus("削除できるのは保存したマスタ用紙サイズのみです。", "error");
    return;
  }
  const id = value.slice(CUSTOM_PRESET_PREFIX.length);
  const items = loadCustomPresets().filter(item => item.id !== id);
  saveCustomPresets(items);
  delete presets[value];
  renderCustomPresetOptions("custom");
  $("sheetPreset").value = "custom";
  setStatus("選択したマスタ用紙サイズを削除しました。", "ready");
  updatePreview();
}

function swapSheetDirection() {
  const w = $("sheetW").value;
  $("sheetW").value = $("sheetH").value;
  $("sheetH").value = w;
}

function padPages(count, multiple) {
  const out = Array.from({ length: count }, (_, i) => i + 1);
  if ($("pagePolicy").value === "pad") {
    while (out.length % multiple !== 0) out.push(null);
  }
  return out;
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
    if (settings.pageOrder === "repeat" && sheetPages[0]) {
      sheetPages = Array(perSide).fill(sheetPages[0]);
    }
    while (sheetPages.length < perSide) sheetPages.push(null);
    plan.push({ side: "表", signature: Math.floor(i / perSide) + 1, folio: 1, pages: sheetPages });
  }
  return plan;
}

function currentPlan() {
  const settings = readSettings();
  const count = sourcePdf ? sourcePdf.getPageCount() : 0;
  const plan = settings.mode === "booklet" ? makeBookletPlan(count, settings) : makeNupPlan(count, settings);
  return { settings, count, plan };
}

function updatePreviewControls(total) {
  const pageInput = $("previewPage");
  const totalLabel = $("previewTotal");
  const prev = $("previewPrev");
  const next = $("previewNext");
  const max = Math.max(total, 1);
  pageInput.max = String(max);
  pageInput.value = String(Math.min(previewIndex + 1, max));
  totalLabel.textContent = `/ ${max}`;
  prev.disabled = previewIndex <= 0;
  next.disabled = previewIndex >= max - 1;
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

  const warnings = preflight(settings, count, plan);
  $("preflight").innerHTML = warnings.map(w => `<li class="${w.level === "warn" ? "warn" : ""}">${w.text}</li>`).join("");
  $("summary").textContent = count
    ? `${count}ページ / ${settings.sheetW}x${settings.sheetH}mm / ${settings.mode === "booklet" ? "折丁2面付け" : `${settings.cols}x${settings.rows}多面付け`} / ${plan.length}版面 / 表示 ${previewIndex + 1}`
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

  const cellW = (settings.sheetW - settings.gutter * (settings.cols - 1) - 24) / settings.cols;
  const cellH = (settings.sheetH - settings.gripper - settings.tail - settings.gutter * (settings.rows - 1) - 16) / settings.rows;
  const w = Math.min(settings.trimW, cellW);
  const h = Math.min(settings.trimH, cellH);
  const startX = 12 + (cellW - w) / 2;
  const startY = settings.gripper + 8 + (cellH - h) / 2;
  for (let r = 0; r < settings.rows; r++) {
    for (let c = 0; c < settings.cols; c++) {
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
  const fitW = settings.mode === "booklet"
    ? settings.trimW * 2 + settings.gutter + settings.spineGutter + settings.bleed * 2
    : settings.cols * settings.trimW + (settings.cols - 1) * settings.gutter + settings.bleed * 2;
  const fitH = settings.mode === "booklet"
    ? settings.trimH + settings.bleed * 2
    : settings.rows * settings.trimH + (settings.rows - 1) * settings.gutter + settings.bleed * 2;
  const availableH = settings.sheetH - settings.gripper - settings.tail;
  if (!count) out.push({ level: "info", text: "PDF未読込です。面付け設定の下見のみ表示しています。" });
  if (count && (count % 4 === 2 || count % 4 === 1) && settings.mode === "booklet" && settings.pagePolicy === "insert-duplex") {
    const oddNote = count % 4 === 1 ? "奇数ページのため末尾に白ページを1ページ追加し、" : "";
    const sourceLabel = settings.product === "saddle" || settings.insertPageSource === "middle" ? "本文中央の2ページ" : "末尾の2ページ";
    out.push({ level: "info", text: `${oddNote}${sourceLabel}を差し込み両面として別版面に出力します。` });
  } else if (count && count % 4 === 3 && settings.mode === "booklet" && settings.pagePolicy === "insert-duplex") {
    out.push({ level: "info", text: "奇数ページのため末尾に白ページを1ページ追加し、通常の4ページ単位の折丁として出力します。" });
  } else if (count && count % 4 !== 0 && settings.mode === "booklet") {
    out.push({ level: "warn", text: "中綴じは4ページ単位です。白ページ追加、差し込み両面、または台割確認が必要です。" });
  }
  if (fitW > settings.sheetW || fitH > availableH) out.push({ level: "warn", text: "指定した仕上り・ドブ・塗り足しが用紙有効領域を超えています。" });
  if (settings.gripper < 8) out.push({ level: "warn", text: "くわえが8mm未満です。枚葉オフセットでは機械条件を確認してください。" });
  if (settings.bleed < 3) out.push({ level: "warn", text: "塗り足しが3mm未満です。断裁ズレ許容に注意してください。" });
  if (settings.mode === "booklet" && settings.creep > 0 && settings.product !== "saddle") out.push({ level: "warn", text: "束見込み補正は中綴じで特に有効です。無線綴じでは背側削りと台割を確認してください。" });
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
        const b = boxes[i];
        const x = mmToPt(b.x);
        const y = sheetH - mmToPt(b.y + b.h);
        if (!pageNo) {
          page.drawRectangle({ x, y, width: trimW, height: trimH, borderColor: rgb(.75, .75, .75), borderWidth: .4 });
          page.drawText("Blank", { x: x + 12, y: y + trimH / 2, size: 10, font, color: rgb(.55, .55, .55) });
          continue;
        }
        const [embedded] = await out.embedPages([src.getPage(pageNo - 1)]);
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
      if (settings.cropMarks && settings.mode === "booklet") {
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
  if (settings.mode !== "booklet" || !settings.creep) return 0;
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
    el.addEventListener("input", () => {
      persistLastSettings();
      updatePreview();
    });
    el.addEventListener("change", () => {
      persistLastSettings();
      updatePreview();
    });
  });
  $("impositionPreset").addEventListener("change", applySelectedImpositionPreset);
  $("saveImpositionPreset").addEventListener("click", saveCurrentImpositionPreset);
  $("deleteImpositionPreset").addEventListener("click", deleteSelectedImpositionPreset);
  $("saveSheetPreset").addEventListener("click", saveCurrentSheetPreset);
  $("deleteSheetPreset").addEventListener("click", deleteCurrentSheetPreset);
  $("previewPrev").addEventListener("click", () => {
    previewIndex = Math.max(0, previewIndex - 1);
    updatePreview();
  });
  $("previewNext").addEventListener("click", () => {
    const { plan } = currentPlan();
    previewIndex = Math.min(Math.max(plan.length - 1, 0), previewIndex + 1);
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
      const page = sourcePdf.getPage(0);
      $("trimW").value = ptToMm(page.getWidth()).toFixed(1);
      $("trimH").value = ptToMm(page.getHeight()).toFixed(1);
      $("makePdf").disabled = !window.PDFLib;
      setStatus("PDFを読み込みました。面付けPDFを生成できます。", "ready");
      updatePreview();
    } catch (error) {
      sourceBytes = null;
      sourcePdf = null;
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
