# 1. Project Object Schema

## `PROJECT-OBJECT-SCHEMA.md`

### Purpose

A Project object represents a software application, service, tool, site, library, or other concrete body of work maintained within the operational ecosystem.

The Project schema is concerned with **what the project is, where it is, its operational condition, and how to reach the systems associated with it**.

It is not intended to duplicate a repository manifest, package manifest, issue tracker, release record, or complete project specification.

### Schema

```toml
schema = "aptlantis.project"
schema_version = "0.1"

[identity]
id = ""
name = ""
summary = ""

[classification]
kind = ""
lifecycle = ""
attention = ""
availability = ""

[location]
root = ""
repository = ""

[release]
released = false
version = ""
target_version = ""

[operation]
default_ide = ""
default_terminal = ""

[governance]
city_hall_status = ""

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

| Field                         | Purpose                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| `identity.id`                 | Stable internal identifier independent of project name             |
| `identity.name`               | Human-readable project name                                        |
| `identity.summary`            | Short description suitable for cards and search                    |
| `classification.kind`         | Broad project category such as desktop app, service, site, library |
| `classification.lifecycle`    | Actual project lifecycle condition                                 |
| `classification.attention`    | Explicit statement of how much attention it currently deserves     |
| `classification.availability` | Active, archived, unavailable, external, etc.                      |
| `location.root`               | Local project root                                                 |
| `location.repository`         | Repository location or remote                                      |
| `release.released`            | Whether a meaningful release currently exists                      |
| `release.version`             | Current released or working version                                |
| `release.target_version`      | Version presently being worked toward                              |
| `operation.default_ide`       | Preferred IDE/application launcher                                 |
| `operation.default_terminal`  | Preferred terminal context where relevant                          |
| `governance.city_hall_status` | Current governance/onboarding condition                            |
| `board.board`                 | Current board projection                                           |
| `board.lane`                  | Current lane within that board                                     |
| `board.pinned`                | Whether the object should remain surfaced                          |
| `metadata.tags`               | Search/filter vocabulary                                           |
| `metadata.notes`              | Small amount of operator-entered context                           |
| timestamps                    | Object provenance                                                  |

### Expected Inspector Capabilities

A Project object may expose:

```text
Overview
Tasks
Files
Documents
Repository
Evidence
Release
Relationships
Activity
```

Typical actions:

```text
Open Project
Open Folder
Open in IDE
Open Terminal Here
Open Repository
Edit Document
Run Operation
Package Artifacts
```

---

# Project Schema Rationale

## `PROJECT-OBJECT-RATIONALE.md`

The Project schema is intentionally smaller than a conventional project-management schema.

Its purpose is not to describe everything that could possibly be known about a project. It contains the information required for the Operations Control Surface to **identify, locate, classify, surface, and operate the project**.

### `lifecycle` and `attention` are separate

This is one of the most deliberate choices in the schema.

A project can be:

```text
Lifecycle: Released
Attention: Next
```

while another can be:

```text
Lifecycle: In Progress
Attention: None
```

Combining these concepts into one status field would lose useful information.

Lifecycle describes **what condition the project is in**.

Attention describes **how much it presently matters operationally**.

Attention is explicitly assigned rather than algorithmically inferred.

### `root` is a first-class field

The project root is not merely metadata.

Opening project directories is a frequent operational action, so the filesystem location belongs in the primary schema rather than being hidden in configuration.

It enables:

* Open Folder
* Open Terminal Here
* launch IDE
* invoke operators against the project
* locate project artifacts

### Repository and filesystem location are separate

A project can exist locally without a repository, remotely without a current checkout, or have both.

They therefore should not be represented by one generic `location`.

### Release information remains minimal

The object records whether a release exists and the relevant current/target versions.

Detailed release evidence, receipts, artifacts, changelogs, and validation belong to related records rather than being copied into the Project object.

### Governance is represented by state, not duplicated documentation

The Project object needs to know its City Hall standing because that affects operation.

It does not need copies of every applicable governing rule.

Those should be expressed through relationships to City Hall objects.

### No owner or assignee

The system is not designed around team assignment.

An `owner`, `assignee`, or `team` field would add little operational information in its intended environment.

If multi-user requirements appear later, they can be added deliberately.

### No due date

The system is intentionally not calendar-driven.

Calendar deadlines can later exist where genuinely required, but a universal project `due_date` would imply a scheduling model that does not match the application's purpose.

### No computed percent complete

A single project completion percentage frequently creates more apparent precision than useful information.

Specific requirements, evidence, tasks, relationships, and release conditions can describe actual readiness more accurately.

If a completion indicator is displayed, it should be derived from meaningful underlying objects rather than stored as authoritative project metadata.
