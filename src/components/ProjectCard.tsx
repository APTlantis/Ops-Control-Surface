import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckSquare, Circle, FileCheck2, Flag, GripVertical, ShieldAlert } from "lucide-react";
import { iconForProject } from "../projectIcons";
import { CardField, Project, TagDefinition } from "../types";

export function ProjectCard({
  project,
  tagDefinitions,
  selected,
  onSelect,
}: {
  project: Project;
  tagDefinitions: TagDefinition[];
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id });
  const completedTasks = project.tasks.filter((task) => task.completed).length;
  const release = project.releases[0];
  const visible = new Set<CardField>(project.displayConfig.visibleFields);
  const blockingRequirements = project.requirements.filter(
    (requirement) => requirement.blocking && !["satisfied", "waived"].includes(requirement.status),
  ).length;
  const satisfiedRequirements = project.requirements.filter((requirement) => requirement.status === "satisfied").length;
  const evidenceCount = project.documents.filter((document) => document.kind === "evidence" && document.exists).length;
  const tagColor = (tag: string) => tagDefinitions.find((definition) => definition.tag === tag)?.color ?? "#6b7cff";
  const iconUrl = iconForProject(project);

  return (
    <article
      className={`project-card ${selected ? "selected" : ""} ${isDragging ? "dragging" : ""} ${
        project.availability === "unreachable" ? "unreachable" : ""
      }`}
      onClick={onSelect}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <div className="card-header">
        <div>
          <span className="project-icon project-icon-card">
            <img src={iconUrl} alt="" />
          </span>
          <strong>{project.name}</strong>
        </div>
        <button className="drag-handle" title="Drag project" {...attributes} {...listeners}>
          <GripVertical size={15} />
        </button>
      </div>
      <div className="card-type-row">
        <span>{project.cardType}</span>
        {release && visible.has("release") && <small>{release.version}</small>}
        {project.source === "sample" && <small>Sample</small>}
        {project.source === "scan" && <small>Scanned</small>}
        {project.dbId === "holding" && <small>Holding DB</small>}
        {project.availability === "unreachable" && <small>Unreachable</small>}
      </div>
      {visible.has("description") && <p>{project.description}</p>}
      {visible.has("tags") && (
        <div className="tag-row">
          {project.tags.slice(0, 3).map((tag) => (
            <span key={tag} style={{ borderColor: tagColor(tag), background: `${tagColor(tag)}26`, color: "#e8f2ff" }}>
              {tag}
            </span>
          ))}
          {project.tags.length > 3 && <span>+{project.tags.length - 3}</span>}
        </div>
      )}
      <div className="card-signal-row">
        {visible.has("release") && release && (
          <span title="Release target">
            <Flag size={13} />
            {release.readiness}%
          </span>
        )}
        {visible.has("requirements") && (
          <span className={blockingRequirements > 0 ? "danger" : ""} title="Requirement gates">
            <ShieldAlert size={13} />
            {satisfiedRequirements}/{project.requirements.length}
          </span>
        )}
        {visible.has("evidence") && (
          <span title="Evidence documents">
            <FileCheck2 size={13} />
            {evidenceCount}
          </span>
        )}
      </div>
      {visible.has("tasks") && (
        <div className="task-preview">
          {project.tasks.slice(0, 2).map((task) => (
            <div key={task.id}>
              {task.completed ? <CheckSquare size={14} /> : <Circle size={14} />}
              <span>{task.title}</span>
            </div>
          ))}
        </div>
      )}
      {visible.has("custom") && project.customFields.some((field) => field.showOnCard) && (
        <div className="custom-preview">
          {project.customFields
            .filter((field) => field.showOnCard)
            .slice(0, 2)
            .map((field) => (
              <span key={field.id}>
                {field.label}: {field.value}
              </span>
            ))}
        </div>
      )}
      <footer>
        <span className={`priority priority-${project.priority.toLowerCase()}`}>{project.priority}</span>
        <span>
          {completedTasks}/{project.tasks.length}
        </span>
        <span>#{project.id.slice(0, 2).toUpperCase()}-001</span>
      </footer>
    </article>
  );
}
