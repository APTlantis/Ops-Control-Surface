import { Building2, ExternalLink, FolderKanban, Pin, Power, X } from "lucide-react";
import { useEffect, useState } from "react";
import { openPath } from "../api";
import { lanesForBoard, normalizeDraftForSave, objectRegistry } from "../objectRegistry";
import { BoardDefinition, FieldGroup, InspectorTabDefinition, OperationalObject, TagDefinition, UpdateObjectInput } from "../types";
import { useUiStore } from "../store";
import { FieldGroupsEditor, SummaryField } from "./ObjectFields";

const icons = {
  project: FolderKanban,
  "powershell-operator": Power,
  "city-hall": Building2,
};

export function ObjectInspector({
  object,
  boards,
  tagDefinitions,
  onUpdateObject,
  compareMode = false,
  isPinnedForCompare = false,
  onPinCompare,
  onClearCompare,
}: {
  object: OperationalObject;
  boards: BoardDefinition[];
  tagDefinitions: TagDefinition[];
  onUpdateObject: (update: UpdateObjectInput) => void;
  compareMode?: boolean;
  isPinnedForCompare?: boolean;
  onPinCompare?: (objectId: string) => void;
  onClearCompare?: () => void;
}) {
  const { activeTab, setActiveTab } = useUiStore();
  const [draft, setDraft] = useState(object);
  const definition = objectRegistry[object.objectType];
  const Icon = icons[object.objectType];
  const activeCapabilityTab = definition.inspectorTabs.some((tab) => tab.id === activeTab) ? activeTab : definition.inspectorTabs[0]?.id ?? "overview";

  useEffect(() => {
    setDraft(object);
    if (!definition.inspectorTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(definition.inspectorTabs[0]?.id ?? "overview");
    }
  }, [activeTab, definition.inspectorTabs, object, setActiveTab]);

  function save(next = draft) {
    const normalized = normalizeDraftForSave(next);
    onUpdateObject({
      id: normalized.id,
      identity: normalized.identity,
      board: normalized.board,
      metadata: {
        tags: normalized.metadata.tags,
        notes: normalized.metadata.notes,
      },
      payload: normalized.payload,
    });
  }

  return (
    <section className={`inspector ${compareMode ? "compare-inspector" : ""}`}>
      <header className="inspector-header">
        <div className={`inspector-icon tone-${definition.accent}`}>
          <Icon size={22} />
        </div>
        <div className="inspector-title">
          <h2>{object.identity.acronym ? `${object.identity.acronym} - ${object.identity.name}` : object.identity.name}</h2>
          <span>
            {definition.label} | {object.schema} v{object.schemaVersion}
          </span>
        </div>
        <div className="inspector-actions">
          {isPinnedForCompare ? (
            <button className="icon-button" title="Clear comparison" onClick={onClearCompare}>
              <X size={15} />
            </button>
          ) : (
            <button className="icon-button" title="Pin for comparison" onClick={() => onPinCompare?.(object.id)}>
              <Pin size={15} />
            </button>
          )}
        </div>
      </header>

      <p className="inspector-description">{object.identity.summary || "No summary entered."}</p>
      <ObjectSummary object={object} />

      <nav className="tabs">
        {definition.inspectorTabs.map((tab) => (
          <button className={activeCapabilityTab === tab.id ? "active" : ""} key={tab.id} title={tab.capability} onClick={() => setActiveTab(tab.id)}>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      <div className="tab-panel">
        {activeCapabilityTab !== "placement" && activeCapabilityTab !== "metadata" && (
          <>
            <FieldGroupsEditor object={draft} groups={groupsForTab(definition.inspectorGroups, definition.inspectorTabs, activeCapabilityTab)} onChange={setDraft} />
            <button className="primary-button inspector-save" onClick={() => save()} disabled={!draft.identity.name.trim()}>
              Save {definition.inspectorTabs.find((tab) => tab.id === activeCapabilityTab)?.label ?? "Details"}
            </button>
            <ObjectActions object={object} />
          </>
        )}
        {activeCapabilityTab === "placement" && (
          <div className="editor-panel">
            <label>
              Board
              <select
                value={draft.board.board}
                onChange={(event) => {
                  const board = event.target.value as OperationalObject["board"]["board"];
                  const lane = lanesForBoard(board).find((item) => !item.placeholder)?.id ?? draft.board.lane;
                  setDraft({ ...draft, board: { ...draft.board, board, lane } });
                }}
              >
                {boards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Lane
              <select value={draft.board.lane} onChange={(event) => setDraft({ ...draft, board: { ...draft.board, lane: event.target.value } })}>
                {lanesForBoard(draft.board.board)
                  .filter((lane) => !lane.placeholder)
                  .map((lane) => (
                    <option key={lane.id} value={lane.id}>
                      {lane.title}
                    </option>
                  ))}
              </select>
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={draft.board.pinned}
                onChange={(event) => setDraft({ ...draft, board: { ...draft.board, pinned: event.target.checked } })}
              />
              Pinned
            </label>
            <button className="primary-button inspector-save" onClick={() => save()} disabled={!draft.identity.name.trim()}>
              Save Placement
            </button>
          </div>
        )}
        {activeCapabilityTab === "metadata" && (
          <>
            <FieldGroupsEditor object={draft} groups={definition.inspectorGroups.filter((group) => group.title === "Metadata")} onChange={setDraft} />
            <TagPalette object={draft} tagDefinitions={tagDefinitions} onChange={setDraft} />
            <button className="primary-button inspector-save" onClick={() => save()} disabled={!draft.identity.name.trim()}>
              Save Metadata
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function groupsForTab(groups: FieldGroup[], tabs: InspectorTabDefinition[], activeTab: string) {
  const tab = tabs.find((item) => item.id === activeTab);
  if (!tab?.groupTitles?.length) return groups.filter((group) => group.title !== "Metadata");
  return groups.filter((group) => tab.groupTitles?.includes(group.title));
}

function ObjectSummary({ object }: { object: OperationalObject }) {
  if (object.objectType === "project") {
    return (
      <div className="status-summary">
        <SummaryField label="Lifecycle" value={object.payload.classification.lifecycle} />
        <SummaryField label="Attention" value={object.payload.classification.attention} />
        <SummaryField label="Root" value={object.payload.location.root} />
        <SummaryField label="Version" value={object.payload.release.version || object.payload.release.targetVersion} />
      </div>
    );
  }
  if (object.objectType === "powershell-operator") {
    return (
      <div className="status-summary">
        <SummaryField label="Script" value={object.payload.source.script} />
        <SummaryField label="Elevation" value={object.payload.execution.elevation} />
        <SummaryField label="Mutation" value={object.payload.execution.mutation} />
        <SummaryField label="Enabled" value={object.payload.state.enabled} />
      </div>
    );
  }
  return (
    <div className="status-summary">
      <SummaryField label="Document" value={object.payload.document.path} />
      <SummaryField label="Maturity" value={object.payload.governance.maturity} />
      <SummaryField label="Adoption" value={object.payload.governance.adoption} />
      <SummaryField label="Attention" value={object.payload.operation.attention} />
    </div>
  );
}

function ObjectActions({ object }: { object: OperationalObject }) {
  const actions: Array<[string, string]> = [];
  if (object.objectType === "project" && object.payload.location.root) actions.push(["Open Root", object.payload.location.root]);
  if (object.objectType === "powershell-operator" && object.payload.source.script) actions.push(["Open Script", object.payload.source.script]);
  if (object.objectType === "city-hall" && object.payload.document.path) actions.push(["Open Document", object.payload.document.path]);

  if (!actions.length) return null;
  return (
    <div className="document-list object-actions">
      {actions.map(([label, path]) => (
        <button key={label} onClick={() => openPath(path)}>
          <ExternalLink size={15} />
          <span>
            <strong>{label}</strong>
            <small>{path}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

function TagPalette({
  object,
  tagDefinitions,
  onChange,
}: {
  object: OperationalObject;
  tagDefinitions: TagDefinition[];
  onChange: (object: OperationalObject) => void;
}) {
  function toggleTag(tag: string) {
    const tags = object.metadata.tags.includes(tag) ? object.metadata.tags.filter((item) => item !== tag) : [...object.metadata.tags, tag];
    onChange({ ...object, metadata: { ...object.metadata, tags } });
  }

  return (
    <div className="tag-palette">
      {tagDefinitions.map((definition) => (
        <label className={object.metadata.tags.includes(definition.tag) ? "in-card" : ""} key={definition.tag}>
          <span style={{ background: definition.color }} />
          <strong>{definition.tag}</strong>
          <small>{object.metadata.tags.includes(definition.tag) ? "On object" : "Workspace"}</small>
          <input type="checkbox" checked={object.metadata.tags.includes(definition.tag)} onChange={() => toggleTag(definition.tag)} />
          <input type="color" value={definition.color} readOnly />
        </label>
      ))}
    </div>
  );
}
