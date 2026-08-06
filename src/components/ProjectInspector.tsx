import { useEffect, useState } from "react";
import {
  CheckSquare,
  Circle,
  ClipboardCopy,
  ExternalLink,
  FileCheck2,
  FileText,
  History,
  ListChecks,
  NotebookTabs,
  PackageCheck,
  Palette,
  Pin,
  Plus,
  X,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { openPath } from "../api";
import { iconForProject } from "../projectIcons";
import { useUiStore } from "../store";
import {
  CardDisplayConfig,
  CardField,
  CardType,
  CustomField,
  BoardDefinition,
  ProjectDbDefinition,
  Project,
  ProjectBasicsUpdate,
  ProjectRelease,
  ReleaseReceipt,
  ReleaseReceiptItem,
  Requirement,
  TagDefinition,
} from "../types";

const tabs = [
  ["overview", NotebookTabs, "Overview"],
  ["tasks", ListChecks, "Tasks"],
  ["files", FileText, "Files"],
  ["evidence", ShieldCheck, "Evidence"],
  ["receipt", FileCheck2, "Receipt"],
  ["releases", PackageCheck, "Release"],
  ["requirements", ShieldAlert, "Reqs"],
  ["setup", SlidersHorizontal, "Setup"],
  ["tags", Palette, "Tags"],
  ["activity", History, "Activity"],
] as const;

const cardTypes: CardType[] = ["project", "release", "requirement", "evidence", "task"];
const defaultFieldsByType: Record<CardType, CardField[]> = {
  project: ["description", "tags", "tasks", "release", "requirements"],
  release: ["release", "requirements", "evidence", "tags"],
  requirement: ["requirements", "priority", "owner", "tags"],
  evidence: ["evidence", "requirements", "release", "tags"],
  task: ["tasks", "priority", "owner", "tags"],
};
const cardFields: Array<[CardField, string]> = [
  ["description", "Description"],
  ["tags", "Tags"],
  ["tasks", "Tasks"],
  ["release", "Release"],
  ["requirements", "Requirements"],
  ["evidence", "Evidence"],
  ["priority", "Priority"],
  ["owner", "Owner"],
  ["custom", "Custom fields"],
];

interface ProjectInspectorProps {
  project: Project;
  boards: BoardDefinition[];
  projectDbs: ProjectDbDefinition[];
  tagDefinitions: TagDefinition[];
  onUpdateProjectBasics: (update: ProjectBasicsUpdate) => void;
  onUpdateProjectSetup: (
    projectId: string,
    setup: { cardType: CardType; displayConfig: CardDisplayConfig; customFields: CustomField[] },
  ) => void;
  onUpdateRelease: (release: ProjectRelease) => void;
  onGenerateReceipt: (projectId: string, releaseId?: string) => void;
  onCreateRequirement: (projectId: string) => void;
  onUpdateRequirement: (requirement: Requirement) => void;
  onDeleteRequirement: (projectId: string, requirementId: string) => void;
  onUpdateTagDefinition: (tagDefinition: TagDefinition) => void;
  compareMode?: boolean;
  isPinnedForCompare?: boolean;
  onPinCompare?: (projectId: string) => void;
  onClearCompare?: () => void;
  isGeneratingReceipt?: boolean;
}

export function ProjectInspector({
  project,
  boards,
  projectDbs,
  tagDefinitions,
  onUpdateProjectBasics,
  onUpdateProjectSetup,
  onUpdateRelease,
  onGenerateReceipt,
  onCreateRequirement,
  onUpdateRequirement,
  onDeleteRequirement,
  onUpdateTagDefinition,
  compareMode = false,
  isPinnedForCompare = false,
  onPinCompare,
  onClearCompare,
  isGeneratingReceipt = false,
}: ProjectInspectorProps) {
  const { activeTab, setActiveTab } = useUiStore();
  const release = project.releases[0];
  const completedTasks = project.tasks.filter((task) => task.completed).length;
  const blockingRequirements = project.requirements.filter(
    (requirement) => requirement.blocking && !["satisfied", "waived"].includes(requirement.status),
  ).length;
  const iconUrl = iconForProject(project);

  return (
    <section className={`inspector ${compareMode ? "compare-inspector" : ""}`}>
      <header className="inspector-header">
        <div className="inspector-icon">
          <img src={iconUrl} alt="" />
        </div>
        <div className="inspector-title">
          <h2>{project.name}</h2>
          <span>
            {project.cardType} card | {project.dbId} db | #{project.id.slice(0, 2).toUpperCase()}-001
          </span>
        </div>
        <div className="inspector-actions">
          {isPinnedForCompare ? (
            <button className="icon-button" title="Clear comparison" onClick={onClearCompare}>
              <X size={15} />
            </button>
          ) : (
            <button className="icon-button" title="Pin for comparison" onClick={() => onPinCompare?.(project.id)}>
              <Pin size={15} />
            </button>
          )}
        </div>
      </header>

      <p className="inspector-description">{project.description}</p>

      <div className="field-grid">
        <label>
          Status
          <select
            value={project.status}
            onChange={(event) =>
              onUpdateProjectBasics({
                projectId: project.id,
                boardId: project.boardId,
                dbId: project.dbId,
                availability: project.availability,
                status: event.target.value as Project["status"],
                priority: project.priority,
                tags: project.tags,
                stack: project.stack,
              })
            }
          >
            <option value="backlog">Backlog</option>
            <option value="planned">Planned</option>
            <option value="in-progress">In Progress</option>
            <option value="review">Review</option>
            <option value="released">Released</option>
            <option value="blocked">Blocked</option>
          </select>
        </label>
        <label>
          Priority
          <select
            value={project.priority}
            onChange={(event) =>
              onUpdateProjectBasics({
                projectId: project.id,
                boardId: project.boardId,
                dbId: project.dbId,
                availability: project.availability,
                status: project.status,
                priority: event.target.value as Project["priority"],
                tags: project.tags,
                stack: project.stack,
              })
            }
          >
            <option value="P1">P1</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
            <option value="P4">P4</option>
          </select>
        </label>
      </div>

      <div className="placement-row">
        <label>
          Board
          <select
            value={project.boardId}
            onChange={(event) =>
              onUpdateProjectBasics({
                projectId: project.id,
                boardId: event.target.value as Project["boardId"],
                dbId: project.dbId,
                availability: project.availability,
                status: project.status,
                priority: project.priority,
                tags: project.tags,
                stack: project.stack,
              })
            }
          >
            {boards.map((board) => (
              <option key={board.id} value={board.id}>
                {board.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          DB
          <select
            value={project.dbId}
            onChange={(event) =>
              onUpdateProjectBasics({
                projectId: project.id,
                boardId: project.boardId,
                dbId: event.target.value as Project["dbId"],
                availability: event.target.value === "holding" ? "unreachable" : project.availability,
                status: project.status,
                priority: project.priority,
                tags: project.tags,
                stack: project.stack,
              })
            }
          >
            {projectDbs.map((db) => (
              <option key={db.id} value={db.id}>
                {db.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Availability
          <select
            value={project.availability}
            onChange={(event) =>
              onUpdateProjectBasics({
                projectId: project.id,
                boardId: project.boardId,
                dbId: event.target.value === "unreachable" ? "holding" : project.dbId,
                availability: event.target.value as Project["availability"],
                status: project.status,
                priority: project.priority,
                tags: project.tags,
                stack: project.stack,
              })
            }
          >
            <option value="available">Available</option>
            <option value="unreachable">Unreachable</option>
          </select>
        </label>
      </div>

      <div className="stack-row">
        {project.stack.map((item) => {
          const color = tagDefinitions.find((definition) => definition.tag === item)?.color ?? "#6b7cff";
          return (
            <span key={item} style={{ borderColor: color, background: `${color}26` }}>
              {item}
            </span>
          );
        })}
      </div>

      <div className={`milestone ${blockingRequirements > 0 ? "blocked" : ""}`}>
        <div>
          <span>Release record</span>
          <strong>{release ? `${release.version} - ${release.status}` : "No release target"}</strong>
        </div>
        <span>{release?.targetDate}</span>
        <div className="progress-track">
          <span style={{ width: `${release?.readiness ?? 0}%` }} />
        </div>
        <small>{blockingRequirements > 0 ? `${blockingRequirements} blocking` : `${release?.readiness ?? 0}%`}</small>
      </div>

      <nav className="tabs">
        {tabs.map(([id, Icon, label]) => (
          <button className={activeTab === id ? "active" : ""} key={id} onClick={() => setActiveTab(id)}>
            <Icon size={15} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="tab-panel">
        {activeTab === "overview" && (
          <>
            <StatusSummary project={project} />
            <PanelTitle title="Checklist" count={`${completedTasks}/${project.tasks.length}`} />
            <Checklist project={project} />
            <PanelTitle title="Release Notes" />
            <div className="notes-box">{release?.notes}</div>
          </>
        )}
        {activeTab === "tasks" && <Checklist project={project} />}
        {activeTab === "files" && <DocumentList project={project} />}
        {activeTab === "evidence" && <DocumentList project={project} kind="evidence" />}
        {activeTab === "receipt" && (
          <ReceiptPanel project={project} receipt={project.receipts[0]} onGenerateReceipt={onGenerateReceipt} isGenerating={isGeneratingReceipt} />
        )}
        {activeTab === "releases" && release && <ReleaseEditor release={release} onUpdateRelease={onUpdateRelease} />}
        {activeTab === "requirements" && (
          <RequirementsEditor
            project={project}
            onCreateRequirement={onCreateRequirement}
            onUpdateRequirement={onUpdateRequirement}
            onDeleteRequirement={onDeleteRequirement}
          />
        )}
        {activeTab === "setup" && <SetupEditor project={project} onUpdateProjectSetup={onUpdateProjectSetup} />}
        {activeTab === "tags" && (
          <TagPalette
            project={project}
            tagDefinitions={tagDefinitions}
            onUpdateTagDefinition={onUpdateTagDefinition}
            onUpdateProjectBasics={onUpdateProjectBasics}
          />
        )}
        {activeTab === "activity" && (
          <div className="activity-list">
            {project.activity.map((item) => (
              <article key={item.id}>
                <strong>{item.message}</strong>
                <span>{item.createdAt.replace("T", " ")}</span>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PanelTitle({ title, count }: { title: string; count?: string }) {
  return (
    <div className="panel-title">
      <strong>{title}</strong>
      {count && <span>{count}</span>}
    </div>
  );
}

function StatusSummary({ project }: { project: Project }) {
  const release = project.releases[0];
  const blockingRequirements = project.requirements.filter(
    (requirement) => requirement.blocking && !["satisfied", "waived"].includes(requirement.status),
  ).length;
  const evidenceCount = project.documents.filter((document) => document.kind === "evidence" && document.exists).length;
  const receipt = project.receipts[0];

  return (
    <div className="status-summary">
      <article>
        <span>Card Type</span>
        <strong>{project.cardType}</strong>
      </article>
      <article>
        <span>Release</span>
        <strong>{release?.version ?? "unset"}</strong>
      </article>
      <article className={blockingRequirements > 0 ? "alert" : ""}>
        <span>Blocking</span>
        <strong>{blockingRequirements}</strong>
      </article>
      <article>
        <span>Evidence</span>
        <strong>{evidenceCount}</strong>
      </article>
      <article className={receipt?.status === "not_ready" ? "alert" : ""}>
        <span>Receipt</span>
        <strong>{receipt ? receipt.status.replaceAll("_", " ") : "none"}</strong>
      </article>
    </div>
  );
}

function Checklist({ project }: { project: Project }) {
  return (
    <div className="checklist">
      {project.tasks.map((task) => (
        <div key={task.id}>
          {task.completed ? <CheckSquare size={16} /> : <Circle size={16} />}
          <span>{task.title}</span>
        </div>
      ))}
    </div>
  );
}

function ReleaseEditor({ release, onUpdateRelease }: { release: ProjectRelease; onUpdateRelease: (release: ProjectRelease) => void }) {
  const [draft, setDraft] = useState(release);

  useEffect(() => setDraft(release), [release]);

  function save(next = draft) {
    onUpdateRelease({ ...next, readiness: Math.max(0, Math.min(100, Number(next.readiness) || 0)) });
  }

  return (
    <div className="editor-panel">
      <label>
        Version
        <input value={draft.version} onChange={(event) => setDraft({ ...draft, version: event.target.value })} onBlur={() => save()} />
      </label>
      <label>
        Status
        <input value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })} onBlur={() => save()} />
      </label>
      <label>
        Target date
        <input
          type="date"
          value={draft.targetDate}
          onChange={(event) => setDraft({ ...draft, targetDate: event.target.value })}
          onBlur={() => save()}
        />
      </label>
      <label>
        Readiness
        <input
          type="range"
          min="0"
          max="100"
          value={draft.readiness}
          onChange={(event) => {
            const next = { ...draft, readiness: Number(event.target.value) };
            setDraft(next);
            save(next);
          }}
        />
        <span>{draft.readiness}%</span>
      </label>
      <label className="full-field">
        Notes
        <textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} onBlur={() => save()} />
      </label>
    </div>
  );
}

function ReceiptPanel({
  project,
  receipt,
  onGenerateReceipt,
  isGenerating,
}: {
  project: Project;
  receipt?: ReleaseReceipt;
  onGenerateReceipt: (projectId: string, releaseId?: string) => void;
  isGenerating: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const release = project.releases[0];
  const rawGroups: Array<[string, ReleaseReceiptItem[]]> = receipt
    ? [
        [
          "Blocking",
          receipt.items.filter((item) => item.severity === "blocking" && ["fail", "unavailable"].includes(item.status)),
        ],
        [
          "Required checks",
          receipt.items.filter((item) => item.severity === "required" && !["fail", "unavailable"].includes(item.status)),
        ],
        ["Warnings", receipt.items.filter((item) => item.status === "warn")],
        ["Unavailable", receipt.items.filter((item) => item.status === "unavailable")],
        ["Evidence", receipt.items.filter((item) => item.evidenceRefs.length > 0)],
        ["Informational", receipt.items.filter((item) => ["info", "not_applicable"].includes(item.status))],
      ]
    : [];
  const groups = rawGroups.filter(([, items]) => items.length > 0);

  async function copyReceipt() {
    if (!receipt) return;
    await navigator.clipboard.writeText(receipt.markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="receipt-panel">
      <div className={`receipt-summary receipt-${receipt?.status ?? "empty"}`}>
        <div>
          <span>Release receipt</span>
          <strong>{receipt ? `${receipt.releaseVersion} - ${receipt.profile.toUpperCase()}` : "No receipt generated"}</strong>
        </div>
        <small>{receipt ? receipt.generatedAt.replace("T", " ").slice(0, 16) : release?.version ?? "No release"}</small>
        {receipt && (
          <div className="receipt-decision">
            <strong>{receipt.status.replaceAll("_", " ")}</strong>
            <span>{receipt.readiness}%</span>
          </div>
        )}
        <p>{receipt?.summary ?? "Generate a receipt to record why this card is or is not ready to ship."}</p>
        <div className="receipt-counts">
          <span>{receipt?.counts.pass ?? 0} pass</span>
          <span>{receipt?.counts.warn ?? 0} warn</span>
          <span>{receipt?.counts.fail ?? 0} fail</span>
          <span>{receipt?.counts.unavailable ?? 0} unavailable</span>
          <span>{receipt?.counts.blocking ?? 0} blockers</span>
        </div>
        {receipt && <small className="receipt-freshness">{receipt.freshness.replaceAll("_", " ")} | {receipt.inputFingerprint}</small>}
      </div>
      <div className="receipt-actions">
        <button className="primary-button" onClick={() => onGenerateReceipt(project.id, release?.id)} disabled={isGenerating || !release}>
          <FileCheck2 size={16} />
          {isGenerating ? "Generating" : "Generate Receipt"}
        </button>
        <button className="secondary-button" onClick={copyReceipt} disabled={!receipt}>
          <ClipboardCopy size={15} />
          {copied ? "Copied" : "Copy Markdown"}
        </button>
      </div>
      {receipt ? (
        <div className="receipt-items">
          {groups.map(([title, items]) => (
            <section className="receipt-group" key={title as string}>
              <PanelTitle title={title as string} count={`${items.length}`} />
              {items.map((item) => (
                <article className={`receipt-item ${item.status}`} key={`${title}-${item.id}`}>
                  <span>{item.status.replaceAll("_", " ")}</span>
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.detail}</p>
                    <small>{item.evidencePath || item.sourceRef || item.source}</small>
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="empty-panel">
          <strong>No release receipt yet</strong>
          <span>This card can generate one from its release, requirements, tasks, evidence, and reachable project folder.</span>
        </div>
      )}
    </div>
  );
}

function RequirementsEditor({
  project,
  onCreateRequirement,
  onUpdateRequirement,
  onDeleteRequirement,
}: {
  project: Project;
  onCreateRequirement: (projectId: string) => void;
  onUpdateRequirement: (requirement: Requirement) => void;
  onDeleteRequirement: (projectId: string, requirementId: string) => void;
}) {
  return (
    <div className="requirement-list">
      <button className="new-project-button" onClick={() => onCreateRequirement(project.id)}>
        <Plus size={16} />
        Add Requirement
      </button>
      {project.requirements.map((requirement) => (
        <article className={`requirement-card ${requirement.blocking ? "blocking" : ""}`} key={requirement.id}>
          <input
            value={requirement.title}
            onChange={(event) => onUpdateRequirement({ ...requirement, title: event.target.value })}
          />
          <div className="field-grid">
            <label>
              Status
              <select
                value={requirement.status}
                onChange={(event) => onUpdateRequirement({ ...requirement, status: event.target.value as Requirement["status"] })}
              >
                <option value="open">Open</option>
                <option value="in-progress">In Progress</option>
                <option value="satisfied">Satisfied</option>
                <option value="waived">Waived</option>
              </select>
            </label>
            <label>
              Severity
              <select
                value={requirement.severity}
                onChange={(event) => onUpdateRequirement({ ...requirement, severity: event.target.value as Requirement["severity"] })}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>
          </div>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={requirement.blocking}
              onChange={(event) => onUpdateRequirement({ ...requirement, blocking: event.target.checked })}
            />
            Blocks release
          </label>
          <input
            value={requirement.source}
            onChange={(event) => onUpdateRequirement({ ...requirement, source: event.target.value })}
            placeholder="Source"
          />
          <input
            value={requirement.evidencePath ?? ""}
            onChange={(event) => onUpdateRequirement({ ...requirement, evidencePath: event.target.value })}
            placeholder="Evidence path or link"
          />
          <textarea
            value={requirement.notes ?? ""}
            onChange={(event) => onUpdateRequirement({ ...requirement, notes: event.target.value })}
            placeholder="Notes"
          />
          <button className="danger-button" onClick={() => onDeleteRequirement(project.id, requirement.id)}>
            <Trash2 size={14} />
            Delete
          </button>
        </article>
      ))}
    </div>
  );
}

function SetupEditor({
  project,
  onUpdateProjectSetup,
}: {
  project: Project;
  onUpdateProjectSetup: (
    projectId: string,
    setup: { cardType: CardType; displayConfig: CardDisplayConfig; customFields: CustomField[] },
  ) => void;
}) {
  function save(cardType: CardType, visibleFields: CardField[], customFields = project.customFields) {
    onUpdateProjectSetup(project.id, {
      cardType,
      displayConfig: { cardType, visibleFields },
      customFields,
    });
  }

  function toggleField(field: CardField) {
    const fields = project.displayConfig.visibleFields.includes(field)
      ? project.displayConfig.visibleFields.filter((item) => item !== field)
      : [...project.displayConfig.visibleFields, field];
    save(project.cardType, fields);
  }

  function updateCustomField(next: CustomField) {
    save(
      project.cardType,
      project.displayConfig.visibleFields,
      project.customFields.map((field) => (field.id === next.id ? next : field)),
    );
  }

  function deleteCustomField(fieldId: string) {
    save(
      project.cardType,
      project.displayConfig.visibleFields,
      project.customFields.filter((field) => field.id !== fieldId),
    );
  }

  return (
    <div className="editor-panel">
      <label>
        Card type
        <select
          value={project.cardType}
          onChange={(event) => {
            const nextType = event.target.value as CardType;
            save(nextType, defaultFieldsByType[nextType]);
          }}
        >
          {cardTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <button className="secondary-button" onClick={() => save(project.cardType, defaultFieldsByType[project.cardType])}>
        Apply {project.cardType} preset
      </button>
      <div className="full-field checkbox-grid">
        {cardFields.map(([field, label]) => (
          <label key={field}>
            <input type="checkbox" checked={project.displayConfig.visibleFields.includes(field)} onChange={() => toggleField(field)} />
            {label}
          </label>
        ))}
      </div>
      <PanelTitle title="Custom Fields" />
      {project.customFields.map((field) => (
        <div className="custom-field-editor" key={field.id}>
          <input value={field.label} onChange={(event) => updateCustomField({ ...field, label: event.target.value })} />
          <input value={field.value} onChange={(event) => updateCustomField({ ...field, value: event.target.value })} />
          <label>
            <input
              type="checkbox"
              checked={field.showOnCard}
              onChange={(event) => updateCustomField({ ...field, showOnCard: event.target.checked })}
            />
            Card
          </label>
          <button className="icon-button danger-icon" title="Delete custom field" onClick={() => deleteCustomField(field.id)}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        className="new-project-button"
        onClick={() =>
          save(project.cardType, [...new Set([...project.displayConfig.visibleFields, "custom" as CardField])], [
            ...project.customFields,
            {
              id: crypto.randomUUID(),
              projectId: project.id,
              label: "New field",
              value: "",
              fieldType: "text",
              showOnCard: true,
              position: project.customFields.length + 1,
            },
          ])
        }
      >
        <Plus size={16} />
        Add Custom Field
      </button>
    </div>
  );
}

function TagPalette({
  project,
  tagDefinitions,
  onUpdateTagDefinition,
  onUpdateProjectBasics,
}: {
  project: Project;
  tagDefinitions: TagDefinition[];
  onUpdateTagDefinition: (tagDefinition: TagDefinition) => void;
  onUpdateProjectBasics: (update: ProjectBasicsUpdate) => void;
}) {
  function toggleTag(tag: string) {
    const tags = project.tags.includes(tag) ? project.tags.filter((item) => item !== tag) : [...project.tags, tag];
    onUpdateProjectBasics({
      projectId: project.id,
      boardId: project.boardId,
      dbId: project.dbId,
      availability: project.availability,
      status: project.status,
      priority: project.priority,
      tags,
      stack: tags.slice(0, 3),
    });
  }

  return (
    <div className="tag-palette">
      {tagDefinitions.map((definition) => (
        <label className={project.tags.includes(definition.tag) ? "in-card" : ""} key={definition.tag}>
          <span style={{ background: definition.color }} />
          <strong>{definition.tag}</strong>
          <small>{project.tags.includes(definition.tag) ? "On card" : "Workspace"}</small>
          <input type="checkbox" checked={project.tags.includes(definition.tag)} onChange={() => toggleTag(definition.tag)} />
          <input
            type="color"
            value={definition.color}
            onChange={(event) => onUpdateTagDefinition({ ...definition, color: event.target.value })}
          />
        </label>
      ))}
    </div>
  );
}

function DocumentList({ project, kind }: { project: Project; kind?: string }) {
  const documents = kind ? project.documents.filter((document) => document.kind === kind) : project.documents;
  return (
    <div className="document-list">
      {documents.map((document) => (
        <button key={document.id} onClick={() => openPath(`${project.rootPath}\\${document.path}`)}>
          <FileText size={16} />
          <span>
            <strong>{document.title}</strong>
            <small>{document.path}</small>
          </span>
          <ExternalLink size={14} />
        </button>
      ))}
      {documents.length === 0 && (
        <div className="empty-panel">
          <strong>No documents found</strong>
          <span>This project does not have matching files yet.</span>
        </div>
      )}
    </div>
  );
}
