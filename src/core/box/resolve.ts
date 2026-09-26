import { deriveCustomNet } from "./custom";
import { generateGeometry } from "./geometry";
import type { Project } from "../project/types";

export function geometryForProject(project: Project) {
  return project.mode === "custom" && project.customNet
    ? deriveCustomNet(project.customNet).geometry
    : generateGeometry(project.templateId, project.dimensions);
}
