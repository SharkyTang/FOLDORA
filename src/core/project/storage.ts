import { openDB, type IDBPDatabase } from "idb";
import { DIECUT } from "../box/reference";
import { EDITABLE_FACES, emptyProject, faceSize, type EditableFaceId, type Project } from "./types";

const DB_NAME = "packaging-editor-v01";
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
    await db.put("projects", snapshot, "current");
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
  if (EDITABLE_FACES.includes(old.selectedFace as EditableFaceId)) project.selectedFace = old.selectedFace as EditableFaceId;
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
  return project;
}

export async function loadOrCreateProject(): Promise<{ project: Project; migrated: boolean }> {
  const db = await database();
  const saved = await db.get("projects", "current") as Project | undefined;
  if (saved) {
    if (saved.version !== 2 || saved.templateId !== DIECUT.id || !saved.faces?.front) {
      throw new Error("本机项目版本无法读取，请备份浏览器数据后重试。");
    }
    return { project: { ...saved, assets: { ...emptyProject().assets, ...saved.assets } }, migrated: false };
  }
  const migrated = await migrateLegacy();
  return { project: migrated ?? emptyProject(), migrated: Boolean(migrated) };
}
