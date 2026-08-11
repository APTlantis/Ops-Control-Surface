import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Building2, FolderKanban, GripVertical, Power, Tag } from "lucide-react";
import { objectRegistry } from "../objectRegistry";
import { OperationalObject, TagDefinition } from "../types";

const icons = {
  project: FolderKanban,
  "powershell-operator": Power,
  "city-hall": Building2,
};

function cardSignals(object: OperationalObject) {
  if (object.objectType === "project") {
    return [
      ["Lifecycle", object.payload.classification.lifecycle],
      ["Attention", object.payload.classification.attention],
      ["Root", object.payload.location.root],
    ];
  }
  if (object.objectType === "powershell-operator") {
    return [
      ["Scope", object.payload.execution.scope],
      ["Mutation", object.payload.execution.mutation],
      ["Elevation", object.payload.execution.elevation],
    ];
  }
  return [
    ["Maturity", object.payload.governance.maturity],
    ["Adoption", object.payload.governance.adoption],
    ["Domain", object.payload.governance.domain],
  ];
}

function cardFocus(object: OperationalObject) {
  if (object.objectType === "project") {
    return {
      label: "Attention",
      value: object.payload.classification.attention || "Missing",
      detail: object.payload.classification.lifecycle || "Lifecycle missing",
    };
  }
  if (object.objectType === "powershell-operator") {
    return {
      label: object.payload.state.enabled ? "Enabled" : "Disabled",
      value: object.payload.execution.mutation || "read-only",
      detail: object.payload.state.lastResult || object.payload.output.kind || "No result yet",
    };
  }
  return {
    label: object.payload.governance.standardized ? "Standardized" : "Not Standardized",
    value: object.payload.governance.maturity || "Missing",
    detail: object.payload.governance.adoption || "Adoption missing",
  };
}

export function ObjectCard({
  object,
  tagDefinitions,
  selected,
  onSelect,
}: {
  object: OperationalObject;
  tagDefinitions: TagDefinition[];
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: object.id });
  const definition = objectRegistry[object.objectType];
  const Icon = icons[object.objectType];
  const tagColor = (tag: string) => tagDefinitions.find((definition) => definition.tag === tag)?.color ?? "#6b7cff";
  const focus = cardFocus(object);

  return (
    <article
      className={`project-card object-card object-card-${object.objectType} ${selected ? "selected" : ""} ${isDragging ? "dragging" : ""}`}
      onClick={onSelect}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <div className="card-header">
        <div>
          <span className={`project-icon project-icon-card tone-${definition.accent}`}>
            <Icon size={15} />
          </span>
          <strong>{object.identity.acronym ? `${object.identity.acronym} - ${object.identity.name}` : object.identity.name}</strong>
        </div>
        <button className="drag-handle" title="Drag object" {...attributes} {...listeners}>
          <GripVertical size={15} />
        </button>
      </div>
      <div className="card-type-row">
        <span>{definition.shortLabel}</span>
        <small>{object.schema}</small>
        {object.board.pinned && <small>Pinned</small>}
      </div>
      <div className="object-focus">
        <span>{focus.label}</span>
        <strong>{focus.value}</strong>
        <small>{focus.detail}</small>
      </div>
      <p>{object.identity.summary || "No summary entered."}</p>
      <div className="tag-row">
        {object.metadata.tags.slice(0, 3).map((tag) => (
          <span key={tag} style={{ borderColor: tagColor(tag), background: `${tagColor(tag)}26`, color: "#e8f2ff" }}>
            <Tag size={11} />
            {tag}
          </span>
        ))}
        {object.metadata.tags.length > 3 && <span>+{object.metadata.tags.length - 3}</span>}
      </div>
      <div className="card-signal-row">
        {cardSignals(object)
          .filter(([, value]) => String(value ?? "").trim())
          .slice(0, 3)
          .map(([label, value]) => (
            <span key={label} title={label}>
              <small>{label}</small>
              {value}
            </span>
          ))}
      </div>
      <footer>
        <span>{object.identity.id || object.id}</span>
        <span>{object.board.lane}</span>
      </footer>
    </article>
  );
}
