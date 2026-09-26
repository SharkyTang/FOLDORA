import { openDB, type IDBPDatabase } from "idb";
import { DIECUT } from "../box/reference";
import { EDITABLE_FACES, emptyProject, faceSize, type EditableFaceId, type Project } from "./types";
import { migrateProjectV2, migrateProjectV3, validateProjectV2, validateProjectV3, validateProjectV4 } from "./migration";

const DB_NAME = "packaging-editor-v01";
const projectKey = (id: string) => `project:${id}`;
let dbPromise: Promise<IDBPDatabase> | undefined;
let saveQueue: Promise<void> = Promise.resolve();

function database(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore("projects");
      db.createObjectStore("assets");
    },
  });
  return dbPromise;
}

export async function saveProject(project: Project): Promise<void> {
  const snapshot = structuredClone(project);
  saveQueue = saveQueue.catch(() => undefined).then(async () => {
    const db = await database();
    await db.put("projects", snapshot, projectKey(snapshot.id));
  });
  return saveQueue;
}

export async function saveAssetBlob(id: string, blob: Blob): Promise<void> {
  const db = await database();
  await db.put("assets", blob, id);
}

export async function loadAssetUrls(project: Project): Promise<Record<string, string>> {
  const db = await database();
  const urls: Record<string, string> = {};
  for (const asset of Object.values(project.assets)) {
    if (asset.source === "builtin") {
      if (asset.path) urls[asset.id] = asset.path;
    } else {
      const blob = await db.get("assets", asset.id);
      if (blob instanceof Blob) urls[asset.id] = URL.createObjectURL(blob);
    }
  }
  return urls;
}

type LegacyFace = {
  settings?: { fit?: string; scale?: number; offsetX?: number; offsetY?: number; rotation?: number; opacity?: number };
  blob?: Blob;
  name?: string;
};
type LegacyDesign = { version?: number; selectedFace?: string; faces?: Record<string, LegacyFace> };

async function readLegacy(): Promise<LegacyDesign | null> {
  return new Promise((resolve) => {
    const request = indexedDB.open("diecut-preview");
    let newlyCreated = false;
    request.onupgradeneeded = () => { newlyCreated = true; };
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result;
      if (newlyCreated || !db.objectStoreNames.contains("designs")) { db.close(); resolve(null); return; }
      const transaction = db.transaction("designs", "readonly");
      const get = transaction.objectStore("designs").get(DIECUT.id);
      get.onsuccess = () => { db.close(); resolve((get.result as LegacyDesign) ?? null); };
      get.onerror = () => { db.close(); resolve(null); };
    };
  });
}

async function migrateLegacy(): Promise<Project | null> {
  const old = await readLegacy();
  if (old?.version !== 1 || !old.faces) return null;
  const project = emptyProject();
  if ((EDITABLE_FACES as readonly string[]).includes(old.selectedFace as EditableFaceId)) project.selectedFace = old.selectedFace as EditableFaceId;
  for (const faceId of EDITABLE_FACES) {
    const oldFace = old.faces[faceId];
    if (!(oldFace?.blob instanceof Blob)) continue;
    try {
      const image = await createImageBitmap(oldFace.blob);
      const { width: faceWidth, height: faceHeight } = faceSize(faceId);
      const settings = oldFace.settings ?? {};
      const baseScale = settings.fit === "contain"
        ? Math.min(faceWidth / image.width, faceHeight / image.height)
        : Math.max(faceWidth / image.width, faceHeight / image.height);
      const objectWidth = image.width * baseScale * (settings.scale ?? 100) / 100;
      const objectHeight = image.height * baseScale * (settings.scale ?? 100) / 100;
      const assetId = `legacy-${faceId}`;
      await saveAssetBlob(assetId, oldFace.blob);
      project.assets[assetId] = {
        id: assetId, name: oldFace.name || `${faceId} 图片`,
        mime: oldFace.blob.type === "image/jpeg" ? "image/jpeg" : "image/png",
        source: "upload", naturalWidth: image.width, naturalHeight: image.height,
      };
      project.faces[faceId].push({
        id: crypto.randomUUID(), type: "asset", faceId, assetId, name: oldFace.name || `${faceId} 图片`,
        x: (faceWidth - objectWidth) / 2 + faceWidth * (settings.offsetX ?? 0) / 100,
        y: (faceHeight - objectHeight) / 2 + faceHeight * (settings.offsetY ?? 0) / 100,
        width: objectWidth, height: objectHeight, rotation: settings.rotation ?? 0,
        opacity: (settings.opacity ?? 100) / 100, visible: true, locked: false,
      });
      image.close();
    } catch { /* Skip a damaged legacy image without touching the old database. */ }
  }
  await saveProject(project);
  await setActiveProjectId(project.id);
  return project;
}

export async function listProjects(): Promise<{ id: string; name: string; mode: Project["mode"] }[]> {
  const db = await database();
  const keys = await db.getAllKeys("projects");
  const records = await Promise.all(keys.filter((key) => typeof key === "string" && key.startsWith("project:"))
    .map((key) => db.get("projects", key)));
  return records.filter(validateProjectV4).map((project) => ({ id: project.id, name: project.name, mode: project.mode }));
}

export async function setActiveProjectId(id: string): Promise<void> {
  const db = await database();
  await db.put("projects", id, "active-id");
}

export async function loadProjectById(id: string): Promise<Project> {
  const db = await database();
  const record = await db.get("projects", projectKey(id));
  if (!validateProjectV4(record)) throw new Error("项目数据损坏；原始记录没有被覆盖。");
  return record;
}

export async function deleteProjectById(id: string): Promise<void> {
  const db = await database();
  await db.delete("projects", projectKey(id));
}

async function blobBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(new Error("素材读取失败。"));
    reader.readAsDataURL(blob);
  });
}

export async function exportProjectBundle(project: Project): Promise<Blob> {
  const db = await database();
  const assets: Record<string, { mime: string; data: string }> = {};
  for (const asset of Object.values(project.assets)) {
    if (asset.source !== "upload") continue;
    const blob = await db.get("assets", asset.id);
    if (!(blob instanceof Blob)) throw new Error(`备份失败：缺少素材 ${asset.name}。`);
    assets[asset.id] = { mime: blob.type, data: await blobBase64(blob) };
  }
  return new Blob([JSON.stringify({ format: "foldora", bundleVersion: 1, project, assets })],
    { type: "application/vnd.foldora+json" });
}

export async function importProjectBundle(file: File): Promise<Project> {
  if (file.size > 100 * 1024 * 1024) throw new Error("备份文件超过 100 MB。 ");
  let bundle: unknown;
  try { bundle = JSON.parse(await file.text()); } catch { throw new Error("备份文件不是有效的 FOLDORA 数据。 "); }
  if (!bundle || typeof bundle !== "object" || (bundle as { format?: unknown }).format !== "foldora" ||
      (bundle as { bundleVersion?: unknown }).bundleVersion !== 1) throw new Error("备份格式或版本不受支持。 ");
  const record = bundle as { project?: unknown; assets?: unknown };
  if (!validateProjectV4(record.project) || !record.assets || typeof record.assets !== "object")
    throw new Error("备份中的项目结构不完整。 ");
  const project = structuredClone(record.project);
  project.id = crypto.randomUUID();
  project.name = `${project.name} · 导入`;
  const binary: { id: string; blob: Blob }[] = [];
  for (const asset of Object.values(project.assets)) {
    if (asset.source !== "upload") continue;
    const encoded = (record.assets as Record<string, unknown>)[asset.id];
    if (!encoded || typeof encoded !== "object" || typeof (encoded as { data?: unknown }).data !== "string" ||
        typeof (encoded as { mime?: unknown }).mime !== "string") throw new Error(`备份缺少素材 ${asset.name}。`);
    const data = (encoded as { data: string; mime: string }).data;
    const mime = (encoded as { data: string; mime: string }).mime;
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data) || !["image/png", "image/jpeg"].includes(mime))
      throw new Error(`备份素材 ${asset.name} 无效。`);
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    if (bytes.byteLength > 10 * 1024 * 1024) throw new Error(`素材 ${asset.name} 超过 10 MB。`);
    const nextId = crypto.randomUUID();
    delete project.assets[asset.id];
    project.assets[nextId] = { ...asset, id: nextId };
    for (const objects of Object.values(project.faces)) for (const object of objects)
      if (object.type === "asset" && object.assetId === asset.id) object.assetId = nextId;
    binary.push({ id: nextId, blob: new Blob([bytes], { type: mime }) });
  }
  const db = await database();
  const transaction = db.transaction(["projects", "assets"], "readwrite");
  for (const item of binary) await transaction.objectStore("assets").put(item.blob, item.id);
  await transaction.objectStore("projects").put(project, projectKey(project.id));
  await transaction.objectStore("projects").put(project.id, "active-id");
  await transaction.done;
  return project;
}

export async function loadOrCreateProject(): Promise<{ project: Project; migrated: boolean }> {
  const db = await database();
  const activeId = await db.get("projects", "active-id");
  if (typeof activeId === "string") {
    const active = await db.get("projects", projectKey(activeId));
    if (!validateProjectV4(active)) throw new Error("本机当前项目无法读取；原始记录保持不变。");
    return { project: active, migrated: false };
  }
  const saved = await db.get("projects", "current") as unknown;
  if (saved) {
    if (validateProjectV4(saved)) {
      const transaction = db.transaction("projects", "readwrite");
      await transaction.store.put(saved, projectKey(saved.id));
      await transaction.store.put(saved.id, "active-id");
      await transaction.done;
      return { project: saved, migrated: false };
    }
    if (validateProjectV3(saved)) {
      const project = migrateProjectV3(saved);
      project.assets = { ...emptyProject().assets, ...saved.assets };
      const transaction = db.transaction("projects", "readwrite");
      if (!await transaction.store.get("original-v3")) await transaction.store.put(saved, "original-v3");
      await transaction.store.put(project, projectKey(project.id));
      await transaction.store.put(project.id, "active-id");
      await transaction.done;
      return { project, migrated: true };
    }
    if (validateProjectV2(saved)) {
      const project = migrateProjectV3(migrateProjectV2(saved));
      const transaction = db.transaction("projects", "readwrite");
      const backup = await transaction.store.get("original-v2");
      if (!backup) await transaction.store.put(saved, "original-v2");
      await transaction.store.put(project, projectKey(project.id));
      await transaction.store.put(project.id, "active-id");
      await transaction.done;
      return { project, migrated: true };
    }
    throw new Error("本机项目版本无法读取；原始记录保持不变，请先备份浏览器数据。");
  }
  const migrated = await migrateLegacy();
  if (migrated) return { project: migrated, migrated: true };
  const project = emptyProject();
  const transaction = db.transaction("projects", "readwrite");
  await transaction.store.put(project, projectKey(project.id));
  await transaction.store.put(project.id, "active-id");
  await transaction.done;
  return { project, migrated: false };
}
