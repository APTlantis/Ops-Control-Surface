import appIconUrl from "../src-tauri/icons/Square44x44Logo.png";

import { OperationalObject } from "./types";

const logoModules = import.meta.glob("./assets/project-icons/*.webp", {
  eager: true,
  import: "default",
});

const projectLogos = Object.entries(logoModules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url as string);

const projectIconMap: Record<string, string> = {
  aegis: projectLogos.find((url) => url.includes("rust")) ?? "",
  aptconsole: projectLogos.find((url) => url.includes("powershell")) ?? "",
  "archive-ui-lab": projectLogos.find((url) => url.includes("react")) ?? "",
  "city-hall": projectLogos.find((url) => url.includes("vue")) ?? "",
  "docs-hub": projectLogos.find((url) => url.includes("markdown")) ?? "",
  "evidence-pipeline": projectLogos.find((url) => url.includes("prometheus")) ?? "",
  filecabinet: projectLogos.find((url) => url.includes("csharp")) ?? "",
  structa: projectLogos.find((url) => url.includes("toml")) ?? "",
};

function hashProjectId(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

export function iconForProject(project: OperationalObject) {
  const mapped = projectIconMap[project.id];
  if (mapped) return mapped;
  if (!projectLogos.length) return appIconUrl;
  return projectLogos[hashProjectId(project.id) % projectLogos.length] ?? appIconUrl;
}
