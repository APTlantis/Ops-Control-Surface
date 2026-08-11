# Aptlantis Operations Control Surface

## High-Level System Overview

### Purpose

The Aptlantis Operations Control Surface is a desktop workspace for managing the systems, documents, tools, workflows, and projects that currently require operational attention.

It is **not primarily a Kanban board, project manager, task tracker, or team collaboration platform**. The board interface is simply the primary control surface through which operational objects are surfaced and acted upon.

The system exists to reduce friction around repeated work, preserve useful operational knowledge, expose important relationships, and provide fast access to the things currently occupying development and maintenance attention.

The database is the underlying system of record. Boards and other views are projections of that data for particular operational purposes.

---

## Core Model

The system manages **typed operational objects** rather than treating every item as a generic project or card.

Examples include:

* software projects
* City Hall governance documents
* PowerShell scripts and utilities
* reusable reference or stock documents
* operational procedures
* artifacts such as screenshots and release evidence
* narrowly scoped AI-assisted workflows

Each object type has its own schema.

Its schema determines the information that is relevant to that object, the fields exposed in the inspector, and the actions that can reasonably be performed against it.

A project therefore does not need to resemble a PowerShell script, and a governance document does not need to expose meaningless project-management fields merely to fit a common card structure.

The common interface provides consistency while the schemas provide specificity.

---

# System of Record and Views

The **database is authoritative**.

An object's presence on a board does not determine whether that object exists. Boards represent working sets and operational attention.

The initial system contains three major organizational surfaces.

### Primary Operations Board

The primary board contains the objects most useful to day-to-day operation of the Aptlantis ecosystem.

Its initial structure is expected to surface:

1. **City Hall / Governance**
   Governing standards and related organizational documents whose state, adoption, and completeness need to remain visible.

2. **Frequently Used Stock / Reference Material**
   A deliberately small collection of commonly reused templates, reference documents, and operational starting points.

3. **Operators**
   Frequently used PowerShell scripts and similar utilities that can be configured and launched directly from the control surface.

4–6. **Released Projects**
Released projects divided into operationally useful categories so that active maintenance, minor blockers, release work, and stable systems remain visible without occupying the development board.

The primary board should remain selective. It is not intended to display every object stored by the system.

### Secondary Board

The secondary board contains the larger body of active, experimental, internal, unreleased, paused, or otherwise unfinished project work.

All six columns may be dedicated to lifecycle or working-state classifications because this board is specifically concerned with development activity.

### Database

The database stores the full object set, including items that do not currently warrant board space.

It provides persistence, search, filtering, relationships, historical information, and access to objects that are archived, inactive, uncommon, or otherwise outside the current operational working set.

---

# Cards and Inspector

A card is a **representation of an operational object**, not the object itself.

Cards should display only the information necessary to identify the object, understand why it is surfaced, assess its immediate condition, and choose an appropriate action.

Detailed interaction belongs in the inspector.

The existing right-side inspector remains a common interface across object types, but its contents are schema-driven.

For example:

**Project objects** may expose:

* overview
* status
* release information
* tasks
* files
* repository state
* evidence
* relationships
* activity

**PowerShell operators** may expose:

* purpose
* scope
* parameters
* working-directory requirements
* mutation/elevation information
* command preview
* execution
* output
* run history

**City Hall objects** may expose:

* governing purpose
* maturity or standardization state
* current document
* adoption
* related standards
* dependent projects
* revision history

The inspector should therefore remain visually consistent while presenting different information and capabilities according to the selected object's schema.

---

# Manual Data Ownership

Operational data should be entered deliberately.

The system should **not automatically invent project descriptions, status values, priorities, classifications, or other authoritative metadata merely to populate the interface**.

When a new card is created, the user first selects an object type. The system then presents the corresponding schema and allows the object to be populated explicitly.

Automation may assist with mechanical work where appropriate, but it should not replace intentional entry of information whose correctness matters.

This is particularly important because incorrect generated metadata creates additional verification work and undermines confidence in the control surface.

---

# Operations

A major function of the system is to preserve repeatable procedures that would otherwise depend on memory.

An operation may be implemented through:

* PowerShell
* another executable or utility
* an internal application action
* a template/scaffold
* a packaging workflow
* Git operations
* a narrowly scoped AI process
* a compound workflow involving several of these

Operations should represent procedures with recognizable inputs and repeatable outputs.

Examples include:

* opening a project root
* running a workspace inventory
* checking required documents
* instantiating a stock document
* preparing an external project for workspace onboarding
* packaging project material for NotebookLM
* generating a specific project document
* performing a release or evidence check

The goal is not maximum automation.

The goal is to **capture useful operations once so they do not need to be reconstructed from memory later**.

---

# AI Usage

AI integration is optional and intentionally scoped.

The control surface should remain fully useful without local or remote AI capabilities.

AI should only be introduced where a clearly defined operation benefits from it, such as:

* generating a specific onboarding request
* scaffolding a document from known inputs
* preparing a standardized prompt
* producing an orientation document for an artifact package
* transforming existing structured information into a known output form

The application should avoid generic AI features, autonomous decision-making, or adding AI merely because it is technically available.

Each AI operation should have a defined purpose, bounded input, and expected output.

---

# Relationships

Relationships are stored when they provide operational value.

They are not collected merely to produce charts or visualize connections.

Useful relationships may include concepts such as:

```text
governed_by
depends_on
implements
uses
produces
blocks
supersedes
derived_from
applies_to
used_by
```

Relationships should enable the system to answer useful questions, such as:

* What is preventing this project from being released?
* Which projects are affected by a change to this standard?
* Which projects use an outdated stock document?
* What governance requirements apply to this project?
* What depends on this utility?
* Which standards have only partial adoption?

Visualization may be provided, but the primary purpose of relationships is to surface information and support decisions.

---

# Artifacts

Artifacts such as screenshots, documentation, evidence, diagrams, release materials, and generated packages may be associated with operational objects.

The system should reduce the manual work required to make those artifacts useful.

For example, batches of screenshots may be associated with:

* project
* version
* date
* development context
* tags

without requiring each image to be manually renamed.

Artifact metadata should make later retrieval, comparison, packaging, and external analysis substantially easier.

---

# Attention Rather Than Scheduling

The system is concerned with **operational attention**, not traditional calendar-based planning.

An object's lifecycle state and its current importance are separate concepts.

A mature released project may require immediate attention, while an unfinished project may currently be unimportant.

Where planning information is used, priority or attention should primarily be set explicitly rather than inferred through opaque scheduling or ranking logic.

The control surface should help answer:

> **What currently deserves my attention, and what can I do about it from here?**

It should not attempt to become a calendar-driven productivity system.

---

# Application Boundary

The Operations Control Surface is not intended to replace specialized development tools.

Large coding tasks still belong in IDEs. Complex filesystem operations may belong in Explorer or a terminal. Specialized tools should continue to be used when they are better suited to the work.

The control surface should instead make common transitions nearly frictionless.

Typical actions may include:

```text
Open Project
Open Folder
Open Repository
Open in IDE
Open Terminal Here
Edit Document
Run Operator
Instantiate Stock
View Evidence
Package Artifacts
Commit / Push
```

Small changes may reasonably be completed directly within the application through an integrated editor.

Larger work should be launched into the appropriate external tool.

---

# Design Principle

The system should favor **usefulness over feature breadth**.

Features are justified when they remove real friction from an existing workflow, preserve information that would otherwise be lost, or expose information that materially assists operation of the ecosystem.

Features should not be added merely because they are expected in conventional project-management software.

The intended result is not a smaller version of ClickUp, Jira, or another project-management platform.

It is a purpose-built operational environment whose structure reflects the way the Aptlantis ecosystem is actually maintained.

> **The database remembers what exists.
> The schemas describe what those things are.
> Relationships explain how they matter to one another.
> Operations preserve how work gets done.
> The boards surface what matters now.**
