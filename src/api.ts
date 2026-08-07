import { invoke } from "@tauri-apps/api/core";
import {
  BoardData,
  CardDisplayConfig,
  CardType,
  CustomField,
  Project,
  ProjectBasicsUpdate,
  ProjectInput,
  ProjectPriority,
  ProjectRelease,
  ProjectStatus,
  ReleaseReadinessProfile,
  ReleaseReceipt,
  ReleaseReceiptItem,
  ReleaseReceiptItemCategory,
  ReleaseReceiptItemSeverity,
  ReleaseReceiptSourceType,
  Requirement,
  TagDefinition,
} from "./types";
import { mockBoardData } from "./mockData";

const isTauri = "__TAURI_INTERNALS__" in window;

let browserData: BoardData = structuredClone(mockBoardData);

const defaultVisibleFields: Record<CardType, CardDisplayConfig["visibleFields"]> = {
  project: ["description", "tags", "tasks", "release", "requirements"],
  release: ["release", "requirements", "evidence", "tags"],
  requirement: ["requirements", "priority", "owner", "tags"],
  evidence: ["evidence", "requirements", "release", "tags"],
  task: ["tasks", "priority", "owner", "tags"],
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function cardTypeFromTags(tags: string[]): CardType {
  if (tags.includes("Released")) return "release";
  if (tags.includes("Evidence")) return "evidence";
  if (tags.includes("Security")) return "requirement";
  return "project";
}

function severityFromPriority(priority: ProjectPriority): Requirement["severity"] {
  if (priority === "P1") return "critical";
  if (priority === "P2") return "high";
  if (priority === "P3") return "medium";
  return "low";
}

function profileForProject(project: Project): ReleaseReadinessProfile {
  const terms = [project.cardType, project.category, ...project.tags, ...project.stack].join(" ").toLowerCase();
  if (terms.includes("website") || terms.includes("docs")) return "wds";
  if (terms.includes("cli") || terms.includes("command")) return "cts";
  if (terms.includes("wpf") || terms.includes("tauri") || terms.includes("desktop")) return "drs";
  return "generic";
}

const receiptProfileVersion = "2026.08.06";
const receiptGeneratorVersion = "aptlantis-ops-receipts-v0.2";

function receiptItem(
  id: string,
  key: string,
  status: ReleaseReceiptItem["status"],
  severity: ReleaseReceiptItemSeverity,
  category: ReleaseReceiptItemCategory,
  label: string,
  detail: string,
  source: string,
  sourceType: ReleaseReceiptSourceType,
  checkedAt: string,
  evidencePath?: string | null,
): ReleaseReceiptItem {
  return {
    id,
    key,
    title: label,
    category,
    status,
    severity,
    label,
    detail,
    message: detail,
    rationale: null,
    source,
    sourceType,
    sourceRef: evidencePath ?? source,
    evidenceRefs: evidencePath ? [evidencePath] : [],
    checkedAt,
    evidencePath,
  };
}

function hasDocument(project: Project, pattern: RegExp) {
  return project.documents.some((document) => document.exists && pattern.test(`${document.kind} ${document.title} ${document.path}`));
}

function statusLabel(status: ReleaseReceipt["status"]) {
  return status.replaceAll("_", " ");
}

function inputFingerprint(project: Project, release: ProjectRelease, items: ReleaseReceiptItem[]) {
  return btoa(
    encodeURIComponent(
      JSON.stringify({
        projectId: project.id,
        updatedAt: project.updatedAt,
        release,
        requirements: project.requirements.map((item) => [item.id, item.status, item.blocking, item.evidencePath, item.updatedAt]),
        tasks: project.tasks.map((item) => [item.id, item.completed]),
        docs: project.documents.map((item) => [item.id, item.exists, item.updatedAt]),
        items: items.map((item) => [item.key, item.status, item.severity]),
      }),
    ),
  ).slice(0, 32);
}

function countsForItems(items: ReleaseReceiptItem[]) {
  return {
    pass: items.filter((item) => item.status === "pass").length,
    warn: items.filter((item) => item.status === "warn").length,
    fail: items.filter((item) => item.status === "fail").length,
    unavailable: items.filter((item) => item.status === "unavailable").length,
    notApplicable: items.filter((item) => item.status === "not_applicable").length,
    blocking: items.filter((item) => item.severity === "blocking" && item.status === "fail").length,
    missingEvidence: items.filter((item) => item.status === "fail" || item.status === "warn").filter((item) => !item.evidenceRefs.length).length,
  };
}

function receiptStatus(items: ReleaseReceiptItem[]): ReleaseReceipt["status"] {
  if (items.some((item) => item.severity === "blocking" && item.status === "fail")) return "not_ready";
  if (items.some((item) => item.severity === "required" && item.status === "unavailable")) return "indeterminate";
  if (items.some((item) => item.status === "fail")) return "not_ready";
  if (items.some((item) => item.status === "unavailable")) return "indeterminate";
  if (items.some((item) => item.status === "warn")) return "ready_with_warnings";
  return "ready";
}

function buildReceiptMarkdown(project: Project, release: ProjectRelease, receipt: Omit<ReleaseReceipt, "markdown">, items: ReleaseReceiptItem[]) {
  const marker = (itemStatus: ReleaseReceiptItem["status"]) =>
    itemStatus === "pass"
      ? "PASS"
      : itemStatus === "fail"
        ? "FAIL"
        : itemStatus === "warn"
          ? "WARN"
          : itemStatus === "unavailable"
            ? "UNAVAILABLE"
            : itemStatus === "not_applicable"
              ? "N/A"
              : "INFO";
  const groups = [
    ["Blocking", items.filter((item) => item.severity === "blocking" && ["fail", "unavailable"].includes(item.status))],
    ["Required Checks", items.filter((item) => item.severity === "required" && !["fail", "unavailable"].includes(item.status))],
    ["Warnings", items.filter((item) => item.status === "warn")],
    ["Unavailable", items.filter((item) => item.status === "unavailable")],
    ["Evidence", items.filter((item) => item.evidenceRefs.length > 0)],
    ["Informational", items.filter((item) => item.status === "info" || item.status === "not_applicable")],
  ] as const;
  return [
    `# Release Receipt - ${project.name} ${release.version}`,
    "",
    `- Project: ${project.name}`,
    `- Profile: ${receipt.profile.toUpperCase()}`,
    `- Profile version: ${receipt.profileVersion}`,
    `- Receipt status: ${statusLabel(receipt.status)}`,
    `- Readiness score: ${receipt.readiness}%`,
    `- Generated: ${receipt.generatedAt}`,
    `- Generator: ${receipt.generatorVersion}`,
    `- Fingerprint: ${receipt.inputFingerprint}`,
    "",
    "## Decision Summary",
    "",
    receipt.summary,
    "",
    ...groups.flatMap(([title, group]) =>
      group.length
        ? [
            `## ${title}`,
            "",
            ...group.map((item) => `- [${marker(item.status)}] ${item.label}: ${item.detail}${item.evidencePath ? ` (${item.evidencePath})` : ""}`),
            "",
          ]
        : [],
    ),
  ].join("\n");
}

function generateBrowserReceipt(project: Project, releaseId?: string): ReleaseReceipt {
  const release = project.releases.find((item) => item.id === releaseId) ?? project.releases[0];
  const now = new Date().toISOString();
  const profile = profileForProject(project);
  const blocking = project.requirements.filter((requirement) => requirement.blocking && !["satisfied", "waived"].includes(requirement.status));
  const satisfiedRequirements = project.requirements.filter((requirement) => ["satisfied", "waived"].includes(requirement.status));
  const evidenceDocs = project.documents.filter((document) => document.kind === "evidence" && document.exists);
  const completedTasks = project.tasks.filter((task) => task.completed);
  const items: ReleaseReceiptItem[] = [];

  if (!release) {
    items.push(receiptItem(`${project.id}-receipt-no-release`, "release-record", "fail", "blocking", "version", "Release record", "No release record is attached to this card.", "board", "sqlite", now));
  } else {
    items.push(receiptItem(`${project.id}-receipt-release`, "release-record", "pass", "required", "version", "Release record", `${release.version} is tracked as ${release.status}.`, "board", "sqlite", now));
  }

  if (project.dbId === "holding" || project.availability === "unreachable") {
    items.push(receiptItem(`${project.id}-receipt-unreachable`, "project-folder", "unavailable", "required", "filesystem", "Project folder", "Project is retained but filesystem checks are unavailable.", "workspace", "filesystem", now, project.rootPath));
  } else {
    items.push(receiptItem(`${project.id}-receipt-folder`, "project-folder", "unavailable", "recommended", "filesystem", "Project folder", "Browser preview cannot inspect the folder; Tauri will check this path.", "workspace", "filesystem", now, project.rootPath));
  }

  items.push(
    blocking.length
      ? receiptItem(`${project.id}-receipt-blockers`, "blocking-requirements", "fail", "blocking", "requirements", "Blocking requirements", `${blocking.length} blocking requirement(s) remain open.`, "requirements", "requirement", now)
      : receiptItem(`${project.id}-receipt-blockers`, "blocking-requirements", "pass", "blocking", "requirements", "Blocking requirements", "No open blocking requirements.", "requirements", "requirement", now),
  );
  items.push(
    satisfiedRequirements.length
      ? receiptItem(`${project.id}-receipt-reqs`, "requirement-evidence", "pass", "required", "requirements", "Requirement evidence", `${satisfiedRequirements.length} requirement(s) are satisfied or waived.`, "requirements", "requirement", now)
      : receiptItem(`${project.id}-receipt-reqs`, "requirement-evidence", "warn", "required", "requirements", "Requirement evidence", "No satisfied requirements are recorded yet.", "requirements", "requirement", now),
  );
  items.push(
    evidenceDocs.length
      ? receiptItem(`${project.id}-receipt-evidence`, "evidence-documents", "pass", "required", "evidence", "Evidence documents", `${evidenceDocs.length} evidence record(s) are linked.`, "evidence", "sqlite", now, evidenceDocs[0].path)
      : receiptItem(`${project.id}-receipt-evidence`, "evidence-documents", "warn", "required", "evidence", "Evidence documents", "No linked release evidence document is marked present.", "evidence", "sqlite", now),
  );
  items.push(
    completedTasks.length === project.tasks.length && project.tasks.length > 0
      ? receiptItem(`${project.id}-receipt-tasks`, "checklist", "pass", "recommended", "tasks", "Checklist", "All card checklist items are complete.", "tasks", "sqlite", now)
      : receiptItem(`${project.id}-receipt-tasks`, "checklist", "warn", "recommended", "tasks", "Checklist", `${completedTasks.length}/${project.tasks.length} checklist items complete.`, "tasks", "sqlite", now),
  );

  const profileChecks: Record<ReleaseReadinessProfile, ReleaseReceiptItem[]> = {
    drs: [
      receiptItem(`${project.id}-receipt-drs-manifest`, "drs-manifest", hasDocument(project, /manifest/i) ? "pass" : "fail", "blocking", "manifest", "DRS manifest", hasDocument(project, /manifest/i) ? "Manifest document is linked." : "Project manifest is missing.", "DRS", "derived", now),
      receiptItem(`${project.id}-receipt-drs-note`, "drs-release-note", hasDocument(project, /release|changelog/i) ? "pass" : "warn", "required", "documentation", "DRS release note", hasDocument(project, /release|changelog/i) ? "Release documentation is linked." : "Release note or checklist is not linked yet.", "DRS", "derived", now),
    ],
    cts: [
      receiptItem(`${project.id}-receipt-cts-contract`, "cts-contract", hasDocument(project, /contract|readme|manifest/i) ? "pass" : "warn", "required", "documentation", "CTS command contract", hasDocument(project, /contract|readme|manifest/i) ? "Command-facing docs are linked." : "Command contract evidence is not linked yet.", "CTS", "derived", now),
      receiptItem(`${project.id}-receipt-cts-automation`, "cts-automation", "not_applicable", "recommended", "standard-validator", "CTS automation surface", "No CTS executable adapter is registered yet.", "CTS", "derived", now),
    ],
    wds: [
      receiptItem(`${project.id}-receipt-wds-deploy`, "wds-deploy", hasDocument(project, /deploy|release|evidence/i) ? "pass" : "warn", "required", "documentation", "WDS deployment record", hasDocument(project, /deploy|release|evidence/i) ? "Deployment or publication evidence is linked." : "Deployment record is not linked yet.", "WDS", "derived", now),
      receiptItem(`${project.id}-receipt-wds-routes`, "wds-routes", "warn", "required", "evidence", "WDS route checks", "Key route and accessibility checks need explicit evidence.", "WDS", "derived", now),
    ],
    generic: [
      receiptItem(`${project.id}-receipt-generic`, "generic-evidence", evidenceDocs.length ? "pass" : "warn", "recommended", "evidence", "Generic release evidence", evidenceDocs.length ? "Evidence exists for a generic release gate." : "Generic release evidence is still light.", "board", "derived", now),
    ],
  };
  items.push(...profileChecks[profile]);

  const status = receiptStatus(items);
  const receiptRelease = release ?? {
    id: `${project.id}-release`,
    projectId: project.id,
    version: "unplanned",
    status: "Missing",
    targetDate: "",
    readiness: 0,
    notes: "",
  };
  const counts = countsForItems(items);
  const blockers = items.filter((item) => item.severity === "blocking" && item.status === "fail").map((item) => item.label);
  const evidenceRefs = Array.from(new Set(items.flatMap((item) => item.evidenceRefs)));
  const missingEvidence = items.filter((item) => ["fail", "warn"].includes(item.status) && item.evidenceRefs.length === 0).map((item) => item.label);
  const filesystemReachable = !items.some((item) => item.category === "filesystem" && item.status === "unavailable");
  const summary =
    status === "ready"
      ? "Ready evidence is complete for the selected profile."
      : status === "ready_with_warnings"
        ? "Release has supporting evidence, but some receipt items still need attention."
        : status === "indeterminate"
          ? "Release evidence is partially unavailable, so the release posture cannot be finalized."
          : "Release is blocked by missing or failed evidence.";
  const id = `${project.id}-${receiptRelease.id}-${Date.now()}-receipt`;
  const baseReceipt = {
    id,
    projectId: project.id,
    releaseId: receiptRelease.id,
    projectName: project.name,
    releaseVersion: receiptRelease.version,
    profile,
    profileVersion: receiptProfileVersion,
    status,
    freshness: filesystemReachable ? "fresh" as const : "partially_unavailable" as const,
    readiness: receiptRelease.readiness,
    generatedAt: now,
    generatorVersion: receiptGeneratorVersion,
    inputFingerprint: "",
    counts,
    blockers,
    evidenceRefs,
    missingEvidence,
    filesystemReachable,
    validatorRuns: [],
    summary,
    items,
  };
  const receipt = { ...baseReceipt, inputFingerprint: inputFingerprint(project, receiptRelease, items) };
  return { ...receipt, markdown: buildReceiptMarkdown(project, receiptRelease, receipt, items) };
}

function projectFromInput(input: ProjectInput, existingProjects: Project[]): Project {
  const idBase = input.id?.trim() || slugify(input.name) || `project-${existingProjects.length + 1}`;
  const id = existingProjects.some((project) => project.id === idBase) ? `${idBase}-${existingProjects.length + 1}` : idBase;
  const now = new Date().toISOString();
  const cardType = cardTypeFromTags(input.tags);
  const order =
    Math.max(
      0,
      ...existingProjects
        .filter((project) => project.boardId === input.boardId && project.status === input.status)
        .map((project) => project.cardOrder),
    ) + 1;

  return {
    id,
    boardId: input.boardId,
    dbId: input.dbId,
    availability: input.availability ?? "available",
    source: "manual",
    name: input.name,
    description: input.description,
    cardType,
    displayConfig: { cardType, visibleFields: defaultVisibleFields[cardType] },
    status: input.status,
    priority: input.priority,
    category: input.category,
    stack: input.stack,
    tags: input.tags,
    rootPath: input.rootPath || `K:\\Aptlantis\\Workspace\\${input.name.replaceAll(" ", "")}`,
    createdAt: now,
    updatedAt: now,
    cardOrder: order,
    owner: input.owner || "aptlantis",
    accent: input.accent || "cyan",
    blockedReason: input.status === "blocked" ? "Dependency or project requirement needs attention." : null,
    customFields: [
      {
        id: `${id}-field-source`,
        projectId: id,
        label: "Canonical Source",
        value: "manual intake",
        fieldType: "text",
        showOnCard: false,
        position: 1,
      },
    ],
    requirements: [
      {
        id: `${id}-req-manifest`,
        projectId: id,
        title: "Project manifest is current",
        status: "open",
        severity: severityFromPriority(input.priority),
        blocking: input.priority === "P1",
        source: "project manifest",
        evidencePath: `project/${id}.manifest.toml`,
        notes: "Created from project intake.",
        updatedAt: now,
      },
    ],
    documents: [
      {
        id: `${id}-manifest`,
        projectId: id,
        kind: "manifest",
        title: `${input.name}.manifest.toml`,
        path: `project/${id}.manifest.toml`,
        updatedAt: now.slice(0, 10),
        exists: false,
      },
    ],
    tasks: [
      {
        id: `${id}-task-1`,
        projectId: id,
        title: "Define project manifest",
        completed: false,
        source: "project/tasks.toml",
        position: 1,
      },
      {
        id: `${id}-task-2`,
        projectId: id,
        title: "Document operator workflow",
        completed: false,
        source: "project/tasks.toml",
        position: 2,
      },
      {
        id: `${id}-task-3`,
        projectId: id,
        title: "Package release notes",
        completed: false,
        source: "project/releases.toml",
        position: 3,
      },
    ],
    releases: [
      {
        id: `${id}-release`,
        projectId: id,
        version: "v0.1.0",
        status: "Target",
        targetDate: now.slice(0, 10),
        readiness: 0,
        notes: "New project intake; release target is not yet planned.",
      },
    ],
    receipts: [],
    activity: [
      {
        id: `${id}-activity-1`,
        projectId: id,
        message: "Created project card from intake.",
        createdAt: now,
      },
    ],
  };
}

export async function getBoardData(): Promise<BoardData> {
  if (!isTauri) {
    return browserData;
  }

  return invoke<BoardData>("get_board_data");
}

export async function moveProject(projectId: string, status: ProjectStatus, cardOrder: number): Promise<BoardData> {
  if (!isTauri) {
    browserData = {
      ...browserData,
      projects: browserData.projects.map((project) =>
        project.id === projectId ? { ...project, status, cardOrder, updatedAt: new Date().toISOString() } : project,
      ),
    };
    return browserData;
  }

  return invoke<BoardData>("move_project", {
    projectId,
    status,
    cardOrder,
  });
}

export async function createProject(input: ProjectInput): Promise<BoardData> {
  if (!isTauri) {
    const project = projectFromInput(input, browserData.projects);
    const tagDefinitions = [...browserData.tagDefinitions];
    for (const tag of project.tags) {
      if (!tagDefinitions.some((definition) => definition.tag === tag)) {
        tagDefinitions.push({ tag, color: "#8b5cf6", description: null });
      }
    }
    browserData = {
      ...browserData,
      tagDefinitions: tagDefinitions.sort((a, b) => a.tag.localeCompare(b.tag)),
      projects: [...browserData.projects, project],
    };
    return browserData;
  }

  return invoke<BoardData>("create_project", { input });
}

export async function updateProjectBasics(update: ProjectBasicsUpdate): Promise<BoardData> {
  if (!isTauri) {
    const now = new Date().toISOString();
    const tagDefinitions = [...browserData.tagDefinitions];
    for (const tag of update.tags) {
      if (!tagDefinitions.some((definition) => definition.tag === tag)) {
        tagDefinitions.push({ tag, color: "#8b5cf6", description: null });
      }
    }
    browserData = {
      ...browserData,
      tagDefinitions: tagDefinitions.sort((a, b) => a.tag.localeCompare(b.tag)),
      projects: browserData.projects.map((project) =>
        project.id === update.projectId
          ? {
              ...project,
              boardId: update.boardId,
              dbId: update.dbId,
              availability: update.availability,
              status: update.status,
              priority: update.priority,
              tags: update.tags,
              stack: update.stack,
              category: update.tags[0] ?? project.category,
              updatedAt: now,
            }
          : project,
      ),
    };
    return browserData;
  }

  return invoke<BoardData>("update_project_basics", { update });
}

export async function updateProjectSetup(
  projectId: string,
  setup: { cardType: CardType; displayConfig: CardDisplayConfig; customFields: CustomField[] },
): Promise<BoardData> {
  if (!isTauri) {
    browserData = {
      ...browserData,
      projects: browserData.projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              cardType: setup.cardType,
              displayConfig: setup.displayConfig,
              customFields: setup.customFields.map((field, index) => ({ ...field, projectId, position: index + 1 })),
              updatedAt: new Date().toISOString(),
            }
          : project,
      ),
    };
    return browserData;
  }

  return invoke<BoardData>("update_project_setup", { projectId, setup });
}

export async function updateRelease(release: ProjectRelease): Promise<BoardData> {
  if (!isTauri) {
    browserData = {
      ...browserData,
      projects: browserData.projects.map((project) =>
        project.id === release.projectId
          ? {
              ...project,
              releases: project.releases.map((item) => (item.id === release.id ? release : item)),
              updatedAt: new Date().toISOString(),
            }
          : project,
      ),
    };
    return browserData;
  }

  return invoke<BoardData>("update_release", { release });
}

export async function createRequirement(projectId: string): Promise<BoardData> {
  const requirement: Requirement = {
    id: crypto.randomUUID(),
    projectId,
    title: "New requirement",
    status: "open",
    severity: "medium",
    blocking: false,
    source: "manual",
    evidencePath: "",
    notes: "",
    updatedAt: new Date().toISOString(),
  };

  if (!isTauri) {
    browserData = {
      ...browserData,
      projects: browserData.projects.map((project) =>
        project.id === projectId ? { ...project, requirements: [...project.requirements, requirement] } : project,
      ),
    };
    return browserData;
  }

  return invoke<BoardData>("create_requirement", { requirement });
}

export async function updateRequirement(requirement: Requirement): Promise<BoardData> {
  const next = { ...requirement, updatedAt: new Date().toISOString() };
  if (!isTauri) {
    browserData = {
      ...browserData,
      projects: browserData.projects.map((project) =>
        project.id === next.projectId
          ? { ...project, requirements: project.requirements.map((item) => (item.id === next.id ? next : item)) }
          : project,
      ),
    };
    return browserData;
  }

  return invoke<BoardData>("update_requirement", { requirement: next });
}

export async function deleteRequirement(projectId: string, requirementId: string): Promise<BoardData> {
  if (!isTauri) {
    browserData = {
      ...browserData,
      projects: browserData.projects.map((project) =>
        project.id === projectId
          ? { ...project, requirements: project.requirements.filter((requirement) => requirement.id !== requirementId) }
          : project,
      ),
    };
    return browserData;
  }

  return invoke<BoardData>("delete_requirement", { projectId, requirementId });
}

export async function updateTagDefinition(tagDefinition: TagDefinition): Promise<BoardData> {
  if (!isTauri) {
    const existing = browserData.tagDefinitions.some((item) => item.tag === tagDefinition.tag);
    browserData = {
      ...browserData,
      tagDefinitions: existing
        ? browserData.tagDefinitions.map((item) => (item.tag === tagDefinition.tag ? tagDefinition : item))
        : [...browserData.tagDefinitions, tagDefinition].sort((a, b) => a.tag.localeCompare(b.tag)),
    };
    return browserData;
  }

  return invoke<BoardData>("update_tag_definition", { tagDefinition });
}

export async function generateReleaseReceipt(projectId: string, releaseId?: string): Promise<BoardData> {
  if (!isTauri) {
    browserData = {
      ...browserData,
      projects: browserData.projects.map((project) => {
        if (project.id !== projectId) return project;
        const receipt = generateBrowserReceipt(project, releaseId);
        return {
          ...project,
          receipts: [receipt, ...project.receipts],
          updatedAt: new Date().toISOString(),
        };
      }),
    };
    return browserData;
  }

  return invoke<BoardData>("generate_release_receipt", { projectId, releaseId: releaseId ?? null });
}

export async function scanWorkspace(rootPath?: string): Promise<BoardData> {
  if (!isTauri) {
    return browserData;
  }

  return invoke<BoardData>("scan_workspace", { rootPath });
}

export async function openPath(path: string): Promise<void> {
  if (!isTauri) {
    console.info("Open path requested:", path);
    return;
  }

  await invoke("open_path", { path });
}
