"use client";

import { create } from "zustand";
import { emptyProject, faceSize, type AssetMeta, type DesignObject, type EditableFaceId, type Project, type TextObject } from "./types";

type ObjectPatch = Partial<DesignObject>;
type Store = {
  project: Project;
  selectedObjectId: string | null;
  past: Project[];
  future: Project[];
  gestureStart: Project | null;
  loadProject: (project: Project) => void;
  setFace: (face: EditableFaceId) => void;
  selectObject: (id: string | null) => void;
  addText: () => void;
  addAssetObject: (asset: AssetMeta, width?: number, height?: number) => void;
  patchObject: (id: string, patch: ObjectPatch, remember?: boolean) => void;
  removeObject: (id: string) => void;
  reorderObject: (id: string, direction: "up" | "down" | "top" | "bottom") => void;
  beginGesture: () => void;
  endGesture: () => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
};

const copy = (project: Project): Project => structuredClone(project);
const remember = (past: Project[], project: Project): Project[] => [...past.slice(-49), copy(project)];

export const useProjectStore = create<Store>((set) => ({
  project: emptyProject(),
  selectedObjectId: null,
  past: [], future: [], gestureStart: null,
  loadProject: (project) => set({ project, selectedObjectId: null, past: [], future: [], gestureStart: null }),
  setFace: (face) => set((state) => ({ project: { ...state.project, selectedFace: face }, selectedObjectId: null })),
  selectObject: (id) => set({ selectedObjectId: id }),
  addText: () => set((state) => {
    const faceId = state.project.selectedFace;
    const { height } = faceSize(faceId);
    const id = crypto.randomUUID();
    const object: TextObject = {
      id, type: "text", faceId, name: "文字", x: 13, y: Math.min(25, height / 3), width: 64, height: 15,
      rotation: 0, opacity: 1, visible: true, locked: false,
      text: "HELLO", fontFamily: "Arial", fontSizePt: 24, fontWeight: "normal", fontStyle: "normal", color: "#173f35", textAlign: "center",
    };
    const project = copy(state.project);
    project.faces[faceId].push(object);
    return { project, selectedObjectId: id, past: remember(state.past, state.project), future: [] };
  }),
  addAssetObject: (asset, width, height) => set((state) => {
    const faceId = state.project.selectedFace;
    const size = faceSize(faceId);
    const objectWidth = Math.min(size.width * 0.65, width ?? 42);
    const objectHeight = Math.min(size.height * 0.65, height ?? objectWidth * asset.naturalHeight / asset.naturalWidth);
    const id = crypto.randomUUID();
    const project = copy(state.project);
    project.assets[asset.id] = asset;
    project.faces[faceId].push({ id, type: "asset", faceId, name: asset.name, assetId: asset.id,
      x: (size.width - objectWidth) / 2, y: (size.height - objectHeight) / 2,
      width: objectWidth, height: objectHeight, rotation: 0, opacity: 1, visible: true, locked: false });
    return { project, selectedObjectId: id, past: remember(state.past, state.project), future: [] };
  }),
  patchObject: (id, patch, keepHistory = true) => set((state) => {
    const faceId = state.project.selectedFace;
    const index = state.project.faces[faceId].findIndex((object) => object.id === id);
    if (index < 0) return state;
    const project = copy(state.project);
    project.faces[faceId][index] = { ...project.faces[faceId][index], ...patch } as DesignObject;
    return { project, past: keepHistory && !state.gestureStart ? remember(state.past, state.project) : state.past,
      future: keepHistory && !state.gestureStart ? [] : state.future };
  }),
  removeObject: (id) => set((state) => {
    const faceId = state.project.selectedFace;
    if (!state.project.faces[faceId].some((object) => object.id === id)) return state;
    const project = copy(state.project);
    project.faces[faceId] = project.faces[faceId].filter((object) => object.id !== id);
    return { project, selectedObjectId: null, past: remember(state.past, state.project), future: [] };
  }),
  reorderObject: (id, direction) => set((state) => {
    const faceId = state.project.selectedFace;
    const items = state.project.faces[faceId];
    const from = items.findIndex((object) => object.id === id);
    if (from < 0) return state;
    const to = direction === "top" ? items.length - 1 : direction === "bottom" ? 0 : from + (direction === "up" ? 1 : -1);
    if (to < 0 || to >= items.length || to === from) return state;
    const project = copy(state.project);
    const [item] = project.faces[faceId].splice(from, 1);
    project.faces[faceId].splice(to, 0, item);
    return { project, past: remember(state.past, state.project), future: [] };
  }),
  beginGesture: () => set((state) => ({ gestureStart: state.gestureStart ?? copy(state.project) })),
  endGesture: () => set((state) => {
    if (!state.gestureStart) return state;
    const changed = JSON.stringify(state.gestureStart) !== JSON.stringify(state.project);
    return { gestureStart: null, past: changed ? remember(state.past, state.gestureStart) : state.past, future: changed ? [] : state.future };
  }),
  undo: () => set((state) => {
    if (!state.past.length) return state;
    const project = state.past.at(-1)!;
    return { project, past: state.past.slice(0, -1), future: [copy(state.project), ...state.future].slice(0, 50), selectedObjectId: null, gestureStart: null };
  }),
  redo: () => set((state) => {
    if (!state.future.length) return state;
    const project = state.future[0];
    return { project, past: remember(state.past, state.project), future: state.future.slice(1), selectedObjectId: null, gestureStart: null };
  }),
  clear: () => set((state) => ({ project: emptyProject(), selectedObjectId: null, past: remember(state.past, state.project), future: [] })),
}));
