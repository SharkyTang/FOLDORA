"use client";

import dynamic from "next/dynamic";

const EditorWorkspace = dynamic(() => import("@/components/editor/EditorWorkspace"), {
  ssr: false,
  loading: () => <main className="editor-loading">正在加载包装编辑器…</main>,
});

export function EditorEntry() { return <EditorWorkspace />; }
