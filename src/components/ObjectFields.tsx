import { FieldDefinition, FieldGroup, OperationalObject } from "../types";
import { getPathValue, setPathValue } from "../objectRegistry";

function formatValue(value: unknown) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  return String(value ?? "");
}

export function FieldGroupsEditor({
  object,
  groups,
  onChange,
}: {
  object: OperationalObject;
  groups: FieldGroup[];
  onChange: (object: OperationalObject) => void;
}) {
  function updateField(field: FieldDefinition, value: unknown) {
    onChange(setPathValue(object, field.path, value));
  }

  return (
    <div className="schema-groups">
      {groups.map((group) => (
        <section className="schema-group" key={group.title}>
          <div className="panel-title">
            <strong>{group.title}</strong>
          </div>
          <div className="editor-panel">
            {group.fields.map((field) => {
              const value = getPathValue(object, field.path);
              if (field.kind === "checkbox") {
                return (
                  <label className="toggle-row" key={field.path}>
                    <input type="checkbox" checked={Boolean(value)} onChange={(event) => updateField(field, event.target.checked)} />
                    {field.label}
                  </label>
                );
              }
              if (field.kind === "textarea") {
                return (
                  <label className="full-field" key={field.path}>
                    {field.label}
                    <textarea value={formatValue(value)} onChange={(event) => updateField(field, event.target.value)} />
                  </label>
                );
              }
              if (field.kind === "tags") {
                return (
                  <label className="full-field" key={field.path}>
                    {field.label}
                    <input
                      value={formatValue(value)}
                      onChange={(event) => updateField(field, event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))}
                    />
                  </label>
                );
              }
              return (
                <label key={field.path}>
                  {field.label}
                  <input value={formatValue(value)} onChange={(event) => updateField(field, event.target.value)} />
                </label>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function SummaryField({ label, value }: { label: string; value: unknown }) {
  const display = formatValue(value).trim();
  return (
    <article>
      <span>{label}</span>
      <strong>{display || "Missing"}</strong>
    </article>
  );
}
