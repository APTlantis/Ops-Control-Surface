# 3. City Hall Document Schema

## `CITY-HALL-OBJECT-SCHEMA.md`

### Purpose

A City Hall object represents a governing standard, specification, policy, procedure, or related document that controls some portion of the Aptlantis ecosystem.

Unlike an ordinary document record, it needs to describe both the document itself and its **governance state**.

The primary operational questions are:

* What does this govern?
* Is it actually in use?
* Is it standardized?
* What maturity has it reached?
* What depends on it?
* Is the current implementation aligned with the written standard?

### Schema

```toml
schema = "aptlantis.city-hall"
schema_version = "0.1"

[identity]
id = ""
name = ""
acronym = ""
summary = ""

[document]
path = ""
version = ""
status = ""

[governance]
domain = ""
maturity = ""
adoption = ""
standardized = false

[operation]
attention = ""

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

| Field                     | Purpose                                                  |
| ------------------------- | -------------------------------------------------------- |
| `identity.id`             | Stable system identity                                   |
| `identity.name`           | Full governing-document name                             |
| `identity.acronym`        | Short ecosystem identifier                               |
| `identity.summary`        | Concise statement of purpose                             |
| `document.path`           | Authoritative local document                             |
| `document.version`        | Current specification revision                           |
| `document.status`         | Draft/current/superseded/etc.                            |
| `governance.domain`       | Area governed by the object                              |
| `governance.maturity`     | Development condition of the standard itself             |
| `governance.adoption`     | Actual ecosystem use                                     |
| `governance.standardized` | Whether the intended standardization process is complete |
| `operation.attention`     | Present operational importance                           |
| board fields              | Working-set placement                                    |
| metadata                  | Search and supplemental operator context                 |

### Initial `maturity` Vocabulary

```text
concept
draft
usable
established
stable
```

### Initial `adoption` Vocabulary

```text
none
experimental
partial
active
widespread
```

These values intentionally describe different dimensions.

For example:

```text
maturity = "draft"
adoption = "widespread"
standardized = false
```

is a completely legitimate state.

It means the ecosystem is substantially using something whose formal standard has not yet caught up with reality.

### Expected Inspector Capabilities

```text
Overview
Document
Adoption
Dependents
Relationships
Evidence
History
```

Typical actions:

```text
Open Document
Edit
Open Folder
View Dependents
View Implementations
Compare Revision
Mark Standardized
```

---

# City Hall Object Rationale

## `CITY-HALL-OBJECT-RATIONALE.md`

The most important design requirement for a City Hall object is that **document state and real-world adoption cannot be treated as the same thing**.

A standard can be beautifully written and unused.

Another can be widely used while its governing document remains incomplete.

The application needs to make that mismatch visible.

### `maturity`, `adoption`, and `standardized` are deliberately separate

Consider:

```text
Maturity: Established
Adoption: Widespread
Standardized: Yes
```

This represents a healthy, mature standard.

But:

```text
Maturity: Draft
Adoption: Widespread
Standardized: No
```

is arguably even more operationally interesting.

It tells the operator that actual practice has advanced ahead of formal governance.

Likewise:

```text
Maturity: Stable
Adoption: None
Standardized: Yes
```

shows a completed standard that has failed to materialize operationally.

Collapsing these states into a generic `status = active` would destroy exactly the information the control surface is intended to expose.

### `domain` describes responsibility, not taxonomy for taxonomy's sake

City Hall contains multiple forms of governance.

`domain` answers the operational question:

> What portion of the ecosystem is this responsible for?

It allows useful filtering without requiring a complicated hierarchy in the first schema version.

### The authoritative document path is primary data

City Hall objects are document-backed.

Opening and editing the governing source is a normal action, so the authoritative file location belongs directly on the object.

### Dependents are relationships, not an array in the schema

The City Hall object should not contain manually maintained lists such as:

```toml
projects = ["A", "B", "C"]
```

Those would quickly become stale.

Instead:

```text
Project → governed_by → City Hall Object
```

allows the database to derive affected projects, adoption counts, and impact views.

### No completion percentage

Governance maturity is not meaningfully described by `72% complete`.

A document can be structurally complete yet insufficiently adopted, or heavily adopted despite incomplete formalization.

Explicit state dimensions communicate more useful information.

### No project lifecycle

A standard is not “released” or “in development” in quite the same way as software.

Using project lifecycle terminology here would produce misleading cards.

The schema therefore uses governance-specific state.

---

# Shared Design Rules for v0.1

I would put one small document beside all three as well, even if it's only half a page:

## `OBJECT-SCHEMA-RULES.md`

### 1. No field exists merely because another system usually has it

Every field must answer an operational question.

### 2. Do not store derived information when authoritative information already exists

Examples:

* PowerShell parameters come from the script.
* dependent projects come from relationships.
* adoption counts come from underlying objects.
* progress indicators should come from actual requirements where possible.

### 3. Different concepts receive different fields

Do not collapse:

```text
lifecycle ≠ attention
maturity ≠ adoption
elevation ≠ mutation
```

merely to reduce field count.

### 4. Different object types do not need symmetrical schemas

Consistency belongs in the **schema mechanism and inspector**, not in forcing every object to contain the same properties.

### 5. User-entered metadata is authoritative

The application should not silently fabricate values to make objects appear complete.

Missing information should remain visibly missing until entered or intentionally derived from an authoritative source.

### 6. Schemas may grow

These schemas define the first useful contract, not an exhaustive future ontology.

A field should be added when a genuine operational requirement appears rather than because it might conceivably become useful.
