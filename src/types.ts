export type ProjectStatus =
  | "backlog"
  | "planned"
  | "in-progress"
  | "review"
  | "released"
  | "blocked";

export type ProjectPriority = "P1" | "P2" | "P3" | "P4";

export type BoardId = "primary" | "secondary";

export type ProjectDbId = "active" | "archive" | "holding";

export type ProjectAvailability = "available" | "unreachable";

export type CardType = "project" | "release" | "requirement" | "evidence" | "task";

export type RequirementStatus = "open" | "in-progress" | "satisfied" | "waived";

export type RequirementSeverity = "low" | "medium" | "high" | "critical";

export type ReleaseReadinessProfile = "drs" | "cts" | "wds" | "generic";

export type ReleaseReceiptStatus = "ready" | "ready_with_warnings" | "not_ready" | "indeterminate";

export type ReleaseReceiptFreshness = "fresh" | "stale" | "partially_unavailable" | "superseded";

export type ReleaseReceiptItemStatus = "pass" | "warn" | "fail" | "info" | "unavailable" | "not_applicable";

export type ReleaseReceiptItemSeverity = "info" | "recommended" | "required" | "blocking";

export type ReleaseReceiptItemCategory =
  | "manifest"
  | "version"
  | "requirements"
  | "tasks"
  | "evidence"
  | "artifact"
  | "security"
  | "documentation"
  | "filesystem"
  | "standard-validator";

export type ReleaseReceiptSourceType = "sqlite" | "filesystem" | "requirement" | "validator" | "derived";

export type CardField =
  | "description"
  | "tags"
  | "tasks"
  | "release"
  | "requirements"
  | "evidence"
  | "priority"
  | "owner"
  | "custom";

export interface Workspace {
  id: string;
  name: string;
  rootPath: string;
  storageUsedGb: number;
}

export interface BoardDefinition {
  id: BoardId;
  name: string;
  description: string;
}

export interface ProjectDbDefinition {
  id: ProjectDbId;
  name: string;
  description: string;
}

export interface ProjectDocument {
  id: string;
  projectId: string;
  kind: string;
  title: string;
  path: string;
  updatedAt: string;
  exists: boolean;
}

export interface ProjectTask {
  id: string;
  projectId: string;
  title: string;
  completed: boolean;
  source: string;
  position: number;
  dueDate?: string | null;
}

export interface ProjectRelease {
  id: string;
  projectId: string;
  version: string;
  status: string;
  targetDate: string;
  readiness: number;
  notes: string;
}

export interface ReleaseReceiptItem {
  id: string;
  key: string;
  title: string;
  category: ReleaseReceiptItemCategory;
  status: ReleaseReceiptItemStatus;
  severity: ReleaseReceiptItemSeverity;
  label: string;
  detail: string;
  message: string;
  rationale?: string | null;
  source: string;
  sourceType: ReleaseReceiptSourceType;
  sourceRef?: string | null;
  evidenceRefs: string[];
  checkedAt: string;
  evidencePath?: string | null;
}

export interface ReleaseReceiptCounts {
  pass: number;
  warn: number;
  fail: number;
  unavailable: number;
  notApplicable: number;
  blocking: number;
  missingEvidence: number;
}

export interface ReleaseReceipt {
  id: string;
  projectId: string;
  releaseId: string;
  projectName: string;
  releaseVersion: string;
  profile: ReleaseReadinessProfile;
  profileVersion: string;
  status: ReleaseReceiptStatus;
  freshness: ReleaseReceiptFreshness;
  readiness: number;
  counts: ReleaseReceiptCounts;
  blockers: string[];
  evidenceRefs: string[];
  missingEvidence: string[];
  filesystemReachable: boolean;
  validatorRuns: string[];
  generatedAt: string;
  generatorVersion: string;
  inputFingerprint: string;
  summary: string;
  markdown: string;
  items: ReleaseReceiptItem[];
}

export interface CustomField {
  id: string;
  projectId: string;
  label: string;
  value: string;
  fieldType: "text" | "link" | "date" | "number";
  showOnCard: boolean;
  position: number;
}

export interface CardDisplayConfig {
  cardType: CardType;
  visibleFields: CardField[];
}

export interface TagDefinition {
  tag: string;
  color: string;
  description?: string | null;
}

export interface Requirement {
  id: string;
  projectId: string;
  title: string;
  status: RequirementStatus;
  severity: RequirementSeverity;
  blocking: boolean;
  source: string;
  evidencePath?: string | null;
  notes?: string | null;
  updatedAt: string;
}

export interface ActivityEvent {
  id: string;
  projectId: string;
  message: string;
  createdAt: string;
}

export interface Project {
  id: string;
  boardId: BoardId;
  dbId: ProjectDbId;
  availability: ProjectAvailability;
  name: string;
  description: string;
  cardType: CardType;
  displayConfig: CardDisplayConfig;
  status: ProjectStatus;
  priority: ProjectPriority;
  category: string;
  stack: string[];
  tags: string[];
  rootPath: string;
  createdAt: string;
  updatedAt: string;
  cardOrder: number;
  owner: string;
  accent: string;
  blockedReason?: string | null;
  customFields: CustomField[];
  requirements: Requirement[];
  documents: ProjectDocument[];
  tasks: ProjectTask[];
  releases: ProjectRelease[];
  receipts: ReleaseReceipt[];
  activity: ActivityEvent[];
}

export interface ProjectInput {
  id?: string;
  boardId: BoardId;
  dbId: ProjectDbId;
  availability?: ProjectAvailability;
  name: string;
  description: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  category: string;
  tags: string[];
  stack: string[];
  rootPath?: string;
  owner?: string;
  accent?: string;
}

export interface ProjectBasicsUpdate {
  projectId: string;
  boardId: BoardId;
  dbId: ProjectDbId;
  availability: ProjectAvailability;
  status: ProjectStatus;
  priority: ProjectPriority;
  tags: string[];
  stack: string[];
}

export interface BoardData {
  workspace: Workspace;
  boards: BoardDefinition[];
  projectDbs: ProjectDbDefinition[];
  projects: Project[];
  tagDefinitions: TagDefinition[];
}

export interface BoardColumn {
  id: ProjectStatus;
  title: string;
  tone: string;
}

export interface BoardMetrics {
  total: number;
  active: number;
  inProgress: number;
  blocked: number;
  readyToShip: number;
  readyWithReceipt: number;
  releaseBlocked: number;
  missingEvidence: number;
  storageUsedGb: number;
}
