# 2. PowerShell Operator Schema

## `POWERSHELL-OPERATOR-SCHEMA.md`

### Purpose

A PowerShell Operator represents a reusable PowerShell procedure that can be discovered, configured, and executed from the Operations Control Surface.

An Operator is not merely a `.ps1` file record.

It describes the **operational contract surrounding execution**:

* what the script does
* where it can run
* what it requires
* what it may modify
* what parameters it accepts
* what result it produces

### Schema

```toml
schema = "aptlantis.powershell-operator"
schema_version = "0.1"

[identity]
id = ""
name = ""
summary = ""

[source]
script = ""

[execution]
scope = ""
working_directory = ""
elevation = "none"
mutation = "read-only"
shell = "pwsh"

[parameters]
discovery = "powershell"

[output]
kind = "console"
artifact_path = ""

[state]
enabled = true
last_run = ""
last_result = ""

[board]
board = ""
lane = ""
pinned = false

[metadata]
tags = []
notes = ""
created_at = ""
updated_at = ""
```

### Field Contract

| Field                         | Purpose                                         |
| ----------------------------- | ----------------------------------------------- |
| `identity.*`                  | Stable identity and human description           |
| `source.script`               | Actual script location                          |
| `execution.scope`             | What the operator acts upon                     |
| `execution.working_directory` | Required execution context                      |
| `execution.elevation`         | Whether privilege is required                   |
| `execution.mutation`          | Operational risk / expected filesystem effect   |
| `execution.shell`             | PowerShell host required                        |
| `parameters.discovery`        | How launch parameters are obtained              |
| `output.kind`                 | Console, JSON, report, manifest, artifact, etc. |
| `output.artifact_path`        | Expected generated output where applicable      |
| `state.enabled`               | Whether the operation is currently callable     |
| `state.last_run`              | Most recent invocation                          |
| `state.last_result`           | Last meaningful outcome                         |
| board fields                  | Control-surface placement                       |
| metadata                      | Search and operator notes                       |

### Scope Vocabulary

An initial controlled vocabulary could be:

```text
workspace
project
repository
directory
file
machine
custom
```

### Elevation Vocabulary

```text
none
optional
required
```

### Mutation Vocabulary

```text
read-only
generates-output
modifies
destructive
```

### Parameter Handling

Parameter definitions should normally **not be duplicated manually** in the database.

PowerShell itself should remain authoritative where practical.

For example:

```powershell
param(
    [Parameter(Mandatory)]
    [string]$Root,

    [ValidateSet("Fast", "Full")]
    [string]$Mode = "Fast",

    [switch]$Repair
)
```

can generate:

```text
Root     [________________]
Mode     [Fast ▼]
Repair   [ ]
```

The system may later allow UI-specific overrides, but introspection should be the default.

### Expected Inspector Capabilities

```text
Overview
Run
Source
Targets
Output
History
Relationships
```

Primary actions:

```text
Configure
Run
Open Script
Open Containing Folder
Open Terminal
View Last Result
```

---

# PowerShell Operator Rationale

## `POWERSHELL-OPERATOR-RATIONALE.md`

The central design choice is that the system models an **operation**, not merely a script.

A filename alone does not answer enough questions to execute something safely or conveniently.

### `scope` exists because applicability matters

An inventory script operating on the entire workspace is materially different from a script intended to operate on one repository.

Scope allows the UI to select appropriate targets and avoid presenting meaningless execution choices.

### `working_directory` is explicit

Many scripts technically run from anywhere but practically expect a particular execution context.

That requirement should be machine-readable rather than remembered.

### `elevation` is separate from `mutation`

Administrative privilege and operational risk are not the same thing.

A read-only inventory command may require elevation.

A completely unelevated command could still delete or rewrite large amounts of data.

They therefore need separate fields.

### `mutation` is intentionally coarse

The goal is not to create a full security-analysis model.

The operator only needs enough information to understand whether invoking the script:

1. observes,
2. creates output,
3. modifies existing state, or
4. is potentially destructive.

### PowerShell metadata should not be manually re-entered

Types, mandatory parameters, defaults, switches, and `ValidateSet` values already exist in PowerShell.

Duplicating them would create two sources of truth and additional maintenance.

The application should introspect the script and generate the launcher whenever possible.

### `last_result` belongs in the schema

This is operational context rather than historical trivia.

Seeing:

```text
Last run: Yesterday
Result: Passed
```

is immediately useful on a control surface.

Full run history should be stored separately.

### No generic task fields

An operator does not need:

```text
priority
percentage complete
release target
milestone
assignee
```

Those describe other object classes and would make the card less useful.
