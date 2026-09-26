import { DIECUT } from "./geometry.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const FACE_LABELS = { front: "正面", back: "背面", left: "左侧", right: "右侧", top: "顶面" };
const DEFAULT_SETTINGS = Object.freeze({ fit: "cover", opacity: 100, scale: 100, offsetX: 0, offsetY: 0, rotation: 0 });
const faces = Object.fromEntries(DIECUT.panels.map(({ id }) => [id, { settings: { ...DEFAULT_SETTINGS }, blob: null, url: null, dataURL: null, name: "", naturalWidth: 0, naturalHeight: 0 }]));
let selectedFace = "front";
let foldProgress = 100;
let viewPitch = -17;
let viewYaw = -31;
let unit = 1.7;
let databasePromise;
let storageReady = false;
let saveTimer;
let exportURL;

const $ = (selector) => document.querySelector(selector);
const svg = $("#net-svg");
const stage = $("#stage");
const model = $("#model");
const camera = $("#camera");
const status = $("#save-status");
const panelById = Object.fromEntries(DIECUT.panels.map((panel) => [panel.id, panel]));
const imageGroups = {};
const labelGroups = {};

function svgNode(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function makeNet() {
  svg.setAttribute("viewBox", DIECUT.viewBox);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const defs = svgNode("defs");
  const gradient = svgNode("linearGradient", { id: "paper-gradient", x1: "0%", y1: "0%", x2: "100%", y2: "100%" });
  gradient.append(svgNode("stop", { offset: "0%", "stop-color": "#f0dfb7" }), svgNode("stop", { offset: "100%", "stop-color": "#dbc48d" }));
  defs.append(gradient);
  for (const panel of DIECUT.panels) {
    const clip = svgNode("clipPath", { id: `clip-${panel.id}`, clipPathUnits: "userSpaceOnUse" });
    if (panel.id === "top") {
      clip.append(svgNode("path", { d: "M285 120 V34 Q285 30 289 30 H371 Q375 30 375 34 V120 Z" }));
    } else {
      clip.append(svgNode("rect", { x: panel.x, y: panel.y, width: panel.width, height: panel.height }));
    }
    defs.append(clip);
  }
  svg.append(defs);

  const completeOutline = `${DIECUT.perimeter} ${DIECUT.backHole}`;
  svg.append(svgNode("path", {
    d: completeOutline, fill: "url(#paper-gradient)", "fill-rule": "evenodd",
    stroke: "none", "data-structure": "paper",
  }));

  const artwork = svgNode("g", { id: "artwork-layer" });
  for (const panel of DIECUT.panels) {
    const group = svgNode("g", { "clip-path": `url(#clip-${panel.id})`, "data-export-face": panel.id });
    artwork.append(group);
    imageGroups[panel.id] = group;
  }
  svg.append(artwork);

  // These two layers are intentionally independent: exported artwork remains
  // clipped to its panel while cut and crease information stays visible.
  const cut = svgNode("path", {
    d: completeOutline, fill: "none", stroke: "#176b44", "stroke-width": 0.9,
    "stroke-linecap": "round", "stroke-linejoin": "round", "data-structure": "cut",
  });
  svg.append(cut);
  const creaseLayer = svgNode("g", { stroke: "#176b44", "stroke-width": 0.7, "stroke-dasharray": "4 2", "data-structure": "crease" });
  for (const line of DIECUT.creases) {
    creaseLayer.append(svgNode("line", { x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2, "data-crease": line.id }));
  }
  svg.append(creaseLayer);

  const labels = svgNode("g", { id: "panel-labels", fill: "#41514b", "text-anchor": "middle", "font-size": "10.5", "font-weight": "600" });
  for (const panel of DIECUT.panels) {
    const group = svgNode("g", { "data-label-face": panel.id });
    const label = svgNode("text", { x: panel.x + panel.width / 2, y: panel.y + panel.height / 2 - 2 });
    label.textContent = FACE_LABELS[panel.id];
    const size = svgNode("text", { x: panel.x + panel.width / 2, y: panel.y + panel.height / 2 + 12, "font-size": "7.5", "font-weight": "400" });
    size.textContent = panel.id === "top" ? "90 × 90 mm" : "90 × 235 mm";
    group.append(label, size);
    labels.append(group);
    labelGroups[panel.id] = group;
  }
  svg.append(labels);

  const selected = svgNode("rect", { id: "selected-outline", x: 285.8, y: 120.8, width: 88.4, height: 233.4, rx: 1, fill: "none", stroke: "#d07e25", "stroke-width": 1.5, "stroke-dasharray": "5 3", "pointer-events": "none" });
  svg.append(selected);
  const hits = svgNode("g", { id: "panel-hit-areas", fill: "transparent" });
  for (const panel of DIECUT.panels) {
    const hit = svgNode("rect", { x: panel.x, y: panel.y, width: panel.width, height: panel.height, "data-select-face": panel.id, style: "cursor:pointer" });
    hits.append(hit);
  }
  svg.append(hits);
}

function fillFlapPaths() {
  for (const path of document.querySelectorAll("[data-flap]")) path.setAttribute("d", DIECUT.flapPaths[path.dataset.flap]);
}

function imageSize(faceId, dimensionScale = 1) {
  const face = faces[faceId];
  const panel = panelById[faceId];
  if (!face.blob || !face.naturalWidth || !face.naturalHeight) return null;
  const width = panel.width * dimensionScale;
  const height = panel.height * dimensionScale;
  const ratio = face.settings.fit === "cover"
    ? Math.max(width / face.naturalWidth, height / face.naturalHeight)
    : Math.min(width / face.naturalWidth, height / face.naturalHeight);
  const scale = ratio * face.settings.scale / 100;
  return { width: face.naturalWidth * scale, height: face.naturalHeight * scale };
}

function updateNetImage(faceId) {
  const face = faces[faceId];
  const panel = panelById[faceId];
  const group = imageGroups[faceId];
  group.replaceChildren();
  labelGroups[faceId].style.display = face.blob ? "none" : "";
  const size = imageSize(faceId);
  if (!size) return;
  const cx = panel.x + panel.width / 2;
  const cy = panel.y + panel.height / 2;
  const tx = panel.width * face.settings.offsetX / 100;
  const ty = panel.height * face.settings.offsetY / 100;
  const offsetGroup = svgNode("g", { transform: `translate(${tx} ${ty})` });
  const image = svgNode("image", {
    href: face.url,
    x: cx - size.width / 2,
    y: cy - size.height / 2,
    width: size.width,
    height: size.height,
    opacity: face.settings.opacity / 100,
    transform: `rotate(${face.settings.rotation} ${cx} ${cy})`,
    preserveAspectRatio: "none",
  });
  offsetGroup.append(image);
  group.append(offsetGroup);
}

function update3DImage(faceId) {
  const holder = document.querySelector(`[data-texture-face="${faceId}"] .texture`);
  holder.replaceChildren();
  const face = faces[faceId];
  const size = imageSize(faceId, unit);
  if (!size) return;
  const img = document.createElement("img");
  img.src = face.url;
  img.alt = "";
  img.draggable = false;
  img.style.width = `${size.width}px`;
  img.style.height = `${size.height}px`;
  img.style.opacity = String(face.settings.opacity / 100);
  const dx = panelById[faceId].width * unit * face.settings.offsetX / 100;
  const dy = panelById[faceId].height * unit * face.settings.offsetY / 100;
  img.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px) rotate(${face.settings.rotation}deg)`;
  holder.append(img);
}

function refreshFace(faceId) {
  updateNetImage(faceId);
  update3DImage(faceId);
  const tab = document.querySelector(`.face-tab[data-face="${faceId}"]`);
  tab.classList.toggle("has-image", Boolean(faces[faceId].blob));
  if (faceId === selectedFace) refreshEditor();
}

function refreshEditor() {
  const face = faces[selectedFace];
  const settings = face.settings;
  $("#selected-face-title").textContent = FACE_LABELS[selectedFace];
  $("#face-dimensions").textContent = selectedFace === "top" ? "90 × 90 mm" : "90 × 235 mm";
  $("#fit-mode").value = settings.fit;
  for (const [key, id] of Object.entries({ opacity: "opacity", scale: "scale", offsetX: "offset-x", offsetY: "offset-y", rotation: "rotation" })) {
    $(`#${id}`).value = settings[key];
  }
  $("#opacity-value").textContent = `${settings.opacity}%`;
  $("#scale-value").textContent = `${settings.scale}%`;
  $("#offset-x-value").textContent = `${settings.offsetX}%`;
  $("#offset-y-value").textContent = `${settings.offsetY}%`;
  $("#rotation-value").textContent = `${settings.rotation}°`;
  $("#remove-image").disabled = !face.blob;
  $("#file-name").textContent = face.blob ? face.name : "支持 PNG、JPG、WebP；只放在当前面。";
  const preview = $("#image-preview");
  preview.replaceChildren();
  if (face.blob) {
    const img = document.createElement("img");
    img.src = face.url;
    img.alt = `${FACE_LABELS[selectedFace]}已上传图片`;
    preview.append(img);
  } else {
    const span = document.createElement("span");
    span.textContent = "尚未上传图片";
    preview.append(span);
  }
}

function selectFace(faceId) {
  if (!faces[faceId]) return;
  selectedFace = faceId;
  for (const tab of document.querySelectorAll(".face-tab")) {
    const active = tab.dataset.face === faceId;
    tab.classList.toggle("is-selected", active);
    tab.setAttribute("aria-pressed", String(active));
  }
  const panel = panelById[faceId];
  const outline = $("#selected-outline");
  outline.setAttribute("x", panel.x + 0.8);
  outline.setAttribute("y", panel.y + 0.8);
  outline.setAttribute("width", panel.width - 1.6);
  outline.setAttribute("height", panel.height - 1.6);
  refreshEditor();
  scheduleSave();
}

function phase(value, start, end) { return Math.max(0, Math.min(1, (value - start) / (end - start))); }

function resizeModel() {
  const rect = stage.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;
  const t = foldProgress / 100;
  const flat = Math.min((rect.width - 38) / 390, (rect.height - 48) / 430);
  const closed = Math.min((rect.width - 54) / 190, (rect.height - 52) / 315);
  unit = Math.max(0.62, (flat * (1 - t) + closed * t) * (1 - 0.05 * Math.sin(Math.PI * t)));
  for (const [name, amount] of Object.entries({ wall: 90, height: 235, glue: 15, dust: 31, bottom: 47, top: 90, tuck: 34, "back-one": 18, "back-two": 67, "back-three": 25 })) {
    stage.style.setProperty(`--${name}`, `${amount * unit}px`);
  }
  model.style.transform = `translate(-50%, -50%) translate(${(-37.5 * (1 - t)) * unit}px, ${(31.5 * (1 - t)) * unit}px) translateZ(${45 * unit * t}px) rotateY(${180 * t}deg)`;
  for (const id of Object.keys(faces)) update3DImage(id);
}

function updateCamera() { camera.style.transform = `rotateX(${viewPitch}deg) rotateY(${viewYaw}deg)`; }

function setFold(value, persist = true) {
  foldProgress = Math.max(0, Math.min(100, Number(value)));
  const t = foldProgress / 100;
  const wall = 90 * phase(t, 0, 0.72);
  const bottom = 90 * phase(t, 0.25, 1);
  const dust = 90 * phase(t, 0.34, 0.9);
  const back = 90 * phase(t, 0.38, 0.92);
  const lid = 90 * phase(t, 0.5, 1);
  const tuck = 90 * phase(t, 0.65, 1);
  const glue = 90 * phase(t, 0.22, 0.92);
  $("#left-hinge").style.transform = `rotateY(${-wall}deg)`;
  $("#right-hinge").style.transform = `rotateY(${wall}deg)`;
  $("#front-hinge").style.transform = `rotateY(${wall}deg)`;
  $("#glue-hinge").style.transform = `rotateY(${-glue}deg)`;
  $("#left-dust").style.transform = `rotateX(${dust}deg)`;
  $("#right-dust").style.transform = `rotateX(${dust}deg)`;
  $("#top-hinge").style.transform = `rotateX(${lid}deg)`;
  $("#tuck-hinge").style.transform = `rotateX(${tuck}deg)`;
  for (const id of ["left-bottom", "back-bottom", "right-bottom", "front-bottom"]) {
    $(`#${id}`).style.transform = `rotateX(${-bottom}deg)`;
  }
  for (const id of ["back-segment-1", "back-segment-2"]) {
    $(`#${id}`).style.transform = `rotateX(${back}deg)`;
  }
  $("#back-segment-3").style.transform = `rotateX(${-back}deg)`;
  // These pieces are tucked behind opaque walls/roof at full closure. Fade
  // their paper surfaces as they become internal to avoid browser 3D sorting
  // drawing an interior edge on an exterior face.
  const internalVisibility = 1 - phase(t, 0.82, 1);
  for (const selector of [
    "#glue-hinge svg", "#tuck-hinge svg", ".segment-1 > .paper-segment",
    ".segment-2 > svg", ".segment-3 > .paper-segment",
  ]) $(selector).style.opacity = String(internalVisibility);
  $("#fold-progress").value = foldProgress;
  $("#fold-value").textContent = `${Math.round(foldProgress)}%`;
  for (const button of document.querySelectorAll("[data-fold]")) button.classList.toggle("is-active", Number(button.dataset.fold) === foldProgress);
  resizeModel();
  if (persist) scheduleSave();
}

function imageDimensions(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("图片无法读取"));
    image.src = url;
  });
}

async function setImage(faceId, blob, name, persist = true) {
  const face = faces[faceId];
  const url = URL.createObjectURL(blob);
  let dimensions;
  let dataURL;
  try {
    [dimensions, dataURL] = await Promise.all([imageDimensions(url), fileToDataURL(blob)]);
  }
  catch (error) { URL.revokeObjectURL(url); throw error; }
  if (face.url) URL.revokeObjectURL(face.url);
  face.blob = blob;
  face.url = url;
  face.dataURL = dataURL;
  face.name = name;
  face.naturalWidth = dimensions.width;
  face.naturalHeight = dimensions.height;
  refreshFace(faceId);
  if (persist) scheduleSave();
}

function removeImage(faceId) {
  const face = faces[faceId];
  if (face.url) URL.revokeObjectURL(face.url);
  face.blob = null;
  face.url = null;
  face.dataURL = null;
  face.name = "";
  face.naturalWidth = 0;
  face.naturalHeight = 0;
  refreshFace(faceId);
  scheduleSave();
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error("IndexedDB 不可用")); return; }
    const request = indexedDB.open("diecut-preview", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("designs");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return databasePromise;
}

async function readSavedDesign() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction("designs", "readonly").objectStore("designs").get(DIECUT.id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeSavedDesign() {
  const db = await openDatabase();
  const value = {
    version: 1,
    selectedFace,
    foldProgress,
    faces: Object.fromEntries(Object.entries(faces).map(([id, face]) => [id, { settings: { ...face.settings }, blob: face.blob, name: face.name }])),
  };
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("designs", "readwrite");
    transaction.objectStore("designs").put(value, DIECUT.id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function scheduleSave() {
  if (exportURL) {
    URL.revokeObjectURL(exportURL);
    exportURL = null;
    $("#download-link").hidden = true;
  }
  if (!storageReady) return;
  status.textContent = "正在保存到本机…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await writeSavedDesign(); status.textContent = "已保存到本机"; }
    catch (error) { console.error(error); status.textContent = "本机保存失败，请先导出 SVG"; }
  }, 400);
}

async function restoreDesign() {
  try {
    const saved = await readSavedDesign();
    if (saved?.version === 1) {
      for (const id of Object.keys(faces)) {
        const record = saved.faces?.[id];
        if (!record) continue;
        faces[id].settings = { ...DEFAULT_SETTINGS, ...record.settings };
        if (record.blob instanceof Blob) {
          try { await setImage(id, record.blob, record.name || "已保存的图片", false); }
          catch (error) { console.warn(`无法恢复${id}图片`, error); }
        }
      }
      selectFace(saved.selectedFace || "front");
      setFold(Number.isFinite(saved.foldProgress) ? saved.foldProgress : 100, false);
    }
    status.textContent = "已保存到本机";
  } catch (error) {
    console.warn("本机保存不可用", error);
    status.textContent = "本机保存不可用";
  } finally {
    storageReady = true;
    refreshEditor();
  }
}

function fileToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function exportSVG() {
  const button = $("#export-svg");
  button.disabled = true;
  button.textContent = "正在导出…";
  try {
    const copy = svg.cloneNode(true);
    copy.setAttribute("xmlns", SVG_NS);
    copy.setAttribute("width", "411mm");
    copy.setAttribute("height", "443mm");
    copy.querySelector("#panel-hit-areas")?.remove();
    copy.querySelector("#selected-outline")?.remove();
    for (const id of Object.keys(faces)) {
      if (!faces[id].blob) continue;
      const image = copy.querySelector(`[data-export-face="${id}"] image`);
      image?.setAttribute("href", faces[id].dataURL);
    }
    const source = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(copy)}`;
    const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
    const expectedImages = Object.values(faces).filter((face) => face.blob).length;
    const embeddedImages = [...parsed.querySelectorAll("image")];
    if (parsed.querySelector("parsererror") || embeddedImages.length !== expectedImages ||
      embeddedImages.some((image) => !image.getAttribute("href")?.startsWith("data:image/"))) {
      throw new Error("导出的 SVG 未能完整嵌入图片");
    }
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    if (exportURL) URL.revokeObjectURL(exportURL);
    exportURL = URL.createObjectURL(blob);
    const link = $("#download-link");
    link.href = exportURL;
    link.download = "刀板图-90x90x235-设计预览.svg";
    link.textContent = expectedImages ? `保存文件（${expectedImages} 张图）` : "保存文件";
    link.hidden = false;
    link.click();
  } catch (error) {
    console.error(error);
    window.alert("SVG 导出失败，请检查上传的图片后重试。");
  } finally {
    button.disabled = false;
    button.textContent = "导出 SVG";
  }
}

function attachControls() {
  $("#face-selector").addEventListener("click", (event) => {
    const button = event.target.closest("[data-face]");
    if (button) selectFace(button.dataset.face);
  });
  svg.addEventListener("click", (event) => {
    const hit = event.target.closest("[data-select-face]");
    if (hit) selectFace(hit.dataset.selectFace);
  });
  $("#image-upload").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { window.alert("请选择 PNG、JPG 或 WebP 图片。"); return; }
    const targetFace = selectedFace;
    try { await setImage(targetFace, file, file.name); }
    catch (error) { console.error(error); window.alert("图片无法读取，请换一张图片重试。"); }
  });
  $("#remove-image").addEventListener("click", () => removeImage(selectedFace));
  $("#fit-mode").addEventListener("change", (event) => {
    faces[selectedFace].settings.fit = event.target.value;
    refreshFace(selectedFace);
    scheduleSave();
  });
  for (const [id, key] of Object.entries({ opacity: "opacity", scale: "scale", "offset-x": "offsetX", "offset-y": "offsetY", rotation: "rotation" })) {
    $(`#${id}`).addEventListener("input", (event) => {
      faces[selectedFace].settings[key] = Number(event.target.value);
      refreshFace(selectedFace);
      scheduleSave();
    });
  }
  $("#reset-adjustment").addEventListener("click", () => {
    faces[selectedFace].settings = { ...DEFAULT_SETTINGS };
    refreshFace(selectedFace);
    scheduleSave();
  });
  $("#fold-progress").addEventListener("input", (event) => setFold(event.target.value));
  for (const button of document.querySelectorAll("[data-fold]")) button.addEventListener("click", () => setFold(button.dataset.fold));
  $("#reset-view").addEventListener("click", () => { viewPitch = -17; viewYaw = -31; updateCamera(); });
  $("#export-svg").addEventListener("click", exportSVG);
  $("#clear-design").addEventListener("click", async () => {
    if (!window.confirm("清空这台设备上保存的五面图片与设置？")) return;
    for (const id of Object.keys(faces)) {
      if (faces[id].url) URL.revokeObjectURL(faces[id].url);
      faces[id] = { settings: { ...DEFAULT_SETTINGS }, blob: null, url: null, dataURL: null, name: "", naturalWidth: 0, naturalHeight: 0 };
      refreshFace(id);
    }
    selectFace("front");
    setFold(100);
    scheduleSave();
  });
  for (const button of document.querySelectorAll("[data-view]")) {
    button.addEventListener("click", () => {
      document.body.dataset.mobileView = button.dataset.view;
      for (const other of document.querySelectorAll("[data-view]")) {
        const active = other === button;
        other.classList.toggle("is-active", active);
        other.setAttribute("aria-pressed", String(active));
      }
      requestAnimationFrame(resizeModel);
    });
  }
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  stage.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    viewYaw += (event.clientX - lastX) * 0.38;
    viewPitch = Math.max(-80, Math.min(80, viewPitch - (event.clientY - lastY) * 0.3));
    lastX = event.clientX;
    lastY = event.clientY;
    updateCamera();
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) stage.addEventListener(name, () => { dragging = false; });
  new ResizeObserver(resizeModel).observe(stage);
}

makeNet();
fillFlapPaths();
attachControls();
for (const id of Object.keys(faces)) refreshFace(id);
updateCamera();
setFold(100, false);
restoreDesign();
