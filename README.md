# Aptlantis Ops

Aptlantis Ops is a local project board for tracking Aptlantis projects, release readiness, requirements, evidence, and project metadata in one desktop workspace.

It is intentionally not a Trello or ClickUp clone. The board is built around development-heavy work where a card may represent a project, release, requirement, evidence item, or task, and where "ready to ship" needs an explainable receipt instead of just a status label.

## What It Does

- Shows projects across two boards: Primary Board and Secondary Board.
- Keeps sample projects separate from live projects so mock data can stay useful without getting in the way.
- Lets cards move through backlog, planned, in progress, review/evidence, released, and blocked.
- Supports card setup by type, visible compact fields, custom fields, release data, requirements, tags, and evidence.
- Tracks whether a project belongs in the active, archive, or holding database group.
- Preserves unreachable or held projects instead of forcing deletion and recreation.
- Generates release receipts that explain why a project is ready, blocked, missing evidence, or indeterminate.
- Runs as a Tauri desktop app with a React interface and local SQLite persistence.

## Current Workflow

Use the Workspace menu to choose what kind of projects you want to see:

- **All Projects** shows sample, scanned, and manually created cards.
- **Live Only** hides sample data so the board can be used day to day.
- **Samples** shows only the seeded/mock projects for reference.

Use the board switcher in the top bar to move between:

- **Primary Board** for main or high-priority projects.
- **Secondary Board** for lower-priority, parked, or broader inventory work.

Use the inspector on the right to edit the selected card. It includes setup, tags, release data, requirements, evidence, tasks, files, activity, and release receipts.

## Release Receipts

Release receipts are in-app snapshots that answer:

> Why does this project look ready, not ready, blocked, or uncertain?

A receipt can include:

- release version and readiness score
- governing readiness profile
- passed checks
- warnings
- blocking failures
- unavailable checks
- linked evidence
- missing evidence
- generated time
- copyable Markdown

Profiles currently include:

- **DRS / desktop-app** for desktop app release standards
- **CTS / command-tool** for command-line tool expectations
- **WDS / website** for website/deployment expectations
- **generic** as a fallback profile

When available, the app can call the local DRS validator at:

```text
D:\.library\aptlantis_core\DRS\drs.ps1
```

That check is read-only. The app does not write release notes or mutate project files during receipt generation.

## Data Model

Cards support:

- card type: project, release, requirement, evidence, or task
- board placement: primary or secondary
- database placement: active, archive, or holding
- availability: available or unreachable
- source: sample, manual, or scan
- tags with workspace-level colors
- custom fields
- release records
- editable requirements
- linked documents and evidence
- latest release receipt snapshots

The desktop app stores editable data in SQLite. The database file is created in the app data directory as:

```text
aptlantis-board.sqlite3
```

Browser preview mode mirrors the same behavior with in-memory mock data.

## Project Logos

Project logo source files live in:

```text
src-tauri/icons/project_png
```

Converted frontend-ready assets live in:

```text
src/assets/project-icons
```

Scanned or generated cards can use these logos as project icons.

## Development

Install dependencies:

```bash
npm install
```

Run the browser preview:

```bash
npm run dev
```

Run the Tauri desktop app:

```bash
npm run tauri dev
```

Build the frontend:

```bash
npm run build
```

Run backend tests:

```bash
cd src-tauri
cargo test
```

## Stack

- React
- TypeScript
- Vite
- Tauri 2
- Rust
- SQLite
- dnd-kit
- TanStack Query
- Zustand
- lucide-react

## Notes

- Manifest write-back is intentionally deferred.
- Release receipts are explanatory evidence snapshots, not automatic release note generators.
- Existing project and release structures are kept compatible as the board becomes more editable.
- Holding projects remain visible and recoverable even when their project folder is unavailable.
