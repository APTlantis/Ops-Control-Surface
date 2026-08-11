use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Manager, State};
use thiserror::Error;

type AppResult<T> = Result<T, AppError>;

const DATA_SCHEMA_VERSION: &str = "typed-operations-control-surface-v1";

#[derive(Debug, Error)]
enum AppError {
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),
    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("application data directory is unavailable")]
    MissingAppDataDir,
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

struct AppState {
    db: Mutex<Connection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Workspace {
    id: String,
    name: String,
    root_path: String,
    storage_used_gb: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BoardDefinition {
    id: String,
    name: String,
    description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BoardLane {
    id: String,
    board_id: String,
    title: String,
    tone: String,
    allowed_types: Option<Vec<String>>,
    placeholder: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ObjectIdentity {
    id: String,
    name: String,
    acronym: Option<String>,
    summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ObjectBoardPlacement {
    board: String,
    lane: String,
    pinned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ObjectMetadata {
    tags: Vec<String>,
    notes: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OperationalObject {
    id: String,
    object_type: String,
    schema: String,
    schema_version: String,
    identity: ObjectIdentity,
    board: ObjectBoardPlacement,
    metadata: ObjectMetadata,
    payload: Value,
    created_at: String,
    updated_at: String,
    card_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TagDefinition {
    tag: String,
    color: String,
    description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BoardData {
    workspace: Workspace,
    boards: Vec<BoardDefinition>,
    lanes: Vec<BoardLane>,
    objects: Vec<OperationalObject>,
    tag_definitions: Vec<TagDefinition>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateObjectInput {
    object_type: String,
    identity: ObjectIdentity,
    board: ObjectBoardPlacement,
    metadata: CreateMetadataInput,
    payload: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateObjectInput {
    id: String,
    identity: ObjectIdentity,
    board: ObjectBoardPlacement,
    metadata: CreateMetadataInput,
    payload: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateMetadataInput {
    tags: Vec<String>,
    notes: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MoveObjectInput {
    object_id: String,
    board_id: String,
    lane_id: String,
    card_order: i64,
}

#[tauri::command]
fn get_board_data(state: State<AppState>) -> AppResult<BoardData> {
    let conn = state.db.lock().expect("database mutex poisoned");
    load_board_data(&conn)
}

#[tauri::command]
fn create_object(input: CreateObjectInput, state: State<AppState>) -> AppResult<BoardData> {
    let conn = state.db.lock().expect("database mutex poisoned");
    let definition = object_definition(&input.object_type);
    let id = unique_object_id(&conn, &input.identity.id, &input.identity.name)?;
    let now = db_now(&conn)?;
    let card_order: i64 = conn.query_row(
        "SELECT COALESCE(MAX(card_order), 0) + 1 FROM operational_objects WHERE board_id = ?1 AND lane_id = ?2",
        params![input.board.board, input.board.lane],
        |row| row.get(0),
    )?;
    let identity = ObjectIdentity {
        id: if input.identity.id.trim().is_empty() {
            id.clone()
        } else {
            input.identity.id
        },
        name: input.identity.name.trim().to_string(),
        acronym: input
            .identity
            .acronym
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
        summary: input.identity.summary.trim().to_string(),
    };
    let metadata = ObjectMetadata {
        tags: clean_tags(input.metadata.tags),
        notes: input.metadata.notes.trim().to_string(),
        created_at: now.clone(),
        updated_at: now.clone(),
    };
    let object = OperationalObject {
        id,
        object_type: input.object_type,
        schema: definition.0.into(),
        schema_version: definition.1.into(),
        identity,
        board: input.board,
        metadata,
        payload: input.payload,
        created_at: now.clone(),
        updated_at: now,
        card_order,
    };
    insert_object(&conn, &object)?;
    upsert_tags(&conn, &object.metadata.tags)?;
    load_board_data(&conn)
}

#[tauri::command]
fn update_object(update: UpdateObjectInput, state: State<AppState>) -> AppResult<BoardData> {
    let conn = state.db.lock().expect("database mutex poisoned");
    let now = db_now(&conn)?;
    let created_at: String = conn
        .query_row(
            "SELECT created_at FROM operational_objects WHERE id = ?1",
            params![update.id],
            |row| row.get(0),
        )
        .optional()?
        .unwrap_or_else(|| now.clone());
    let metadata_created_at: String = conn
        .query_row(
            "SELECT metadata_json FROM operational_objects WHERE id = ?1",
            params![update.id],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .and_then(|value| serde_json::from_str::<ObjectMetadata>(&value).ok())
        .map(|metadata| metadata.created_at)
        .unwrap_or_else(|| created_at.clone());
    let identity = ObjectIdentity {
        id: update.identity.id.trim().to_string(),
        name: update.identity.name.trim().to_string(),
        acronym: update
            .identity
            .acronym
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
        summary: update.identity.summary.trim().to_string(),
    };
    let metadata = ObjectMetadata {
        tags: clean_tags(update.metadata.tags),
        notes: update.metadata.notes.trim().to_string(),
        created_at: metadata_created_at,
        updated_at: now.clone(),
    };
    conn.execute(
        "
        UPDATE operational_objects
        SET identity_json = ?1, board_id = ?2, lane_id = ?3, pinned = ?4,
            metadata_json = ?5, payload_json = ?6, updated_at = ?7
        WHERE id = ?8
        ",
        params![
            serde_json::to_string(&identity)?,
            update.board.board,
            update.board.lane,
            update.board.pinned as i64,
            serde_json::to_string(&metadata)?,
            serde_json::to_string(&update.payload)?,
            now,
            update.id
        ],
    )?;
    upsert_tags(&conn, &metadata.tags)?;
    load_board_data(&conn)
}

#[tauri::command]
fn move_object(input: MoveObjectInput, state: State<AppState>) -> AppResult<BoardData> {
    let conn = state.db.lock().expect("database mutex poisoned");
    let now = db_now(&conn)?;
    let metadata_json: Option<String> = conn
        .query_row(
            "SELECT metadata_json FROM operational_objects WHERE id = ?1",
            params![input.object_id],
            |row| row.get(0),
        )
        .optional()?;
    let metadata_json = if let Some(value) = metadata_json {
        let mut metadata = serde_json::from_str::<ObjectMetadata>(&value)?;
        metadata.updated_at = now.clone();
        serde_json::to_string(&metadata)?
    } else {
        "{}".into()
    };
    conn.execute(
        "
        UPDATE operational_objects
        SET board_id = ?1, lane_id = ?2, card_order = ?3, metadata_json = ?4, updated_at = ?5
        WHERE id = ?6
        ",
        params![
            input.board_id,
            input.lane_id,
            input.card_order,
            metadata_json,
            now,
            input.object_id
        ],
    )?;
    load_board_data(&conn)
}

#[tauri::command]
fn update_tag_definition(
    tag_definition: TagDefinition,
    state: State<AppState>,
) -> AppResult<BoardData> {
    let conn = state.db.lock().expect("database mutex poisoned");
    conn.execute(
        "
        INSERT INTO tag_definitions (tag, color, description)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(tag) DO UPDATE SET color = excluded.color, description = excluded.description
        ",
        params![
            tag_definition.tag,
            tag_definition.color,
            tag_definition.description
        ],
    )?;
    load_board_data(&conn)
}

#[tauri::command]
fn open_path(path: String) -> AppResult<()> {
    let requested = PathBuf::from(path);
    if requested.exists() {
        open::that(requested)?;
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let db_path = app_data_db_path(app.handle())?;
            if let Some(parent) = db_path.parent() {
                fs::create_dir_all(parent)?;
            }
            let conn = Connection::open(db_path)?;
            initialize_database(&conn)?;
            app.manage(AppState {
                db: Mutex::new(conn),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_board_data,
            create_object,
            update_object,
            move_object,
            update_tag_definition,
            open_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running Aptlantis Ops");
}

fn app_data_db_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| AppError::MissingAppDataDir)?;
    Ok(dir.join("aptlantis-board.sqlite3"))
}

fn initialize_database(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS app_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        ",
    )?;
    let current: Option<String> = conn
        .query_row(
            "SELECT value FROM app_metadata WHERE key = 'data_schema_version'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    if current.as_deref() != Some(DATA_SCHEMA_VERSION) {
        reset_database(conn)?;
    }
    create_schema(conn)?;
    seed_database(conn)?;
    Ok(())
}

fn reset_database(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "
        DROP TABLE IF EXISTS projects;
        DROP TABLE IF EXISTS project_documents;
        DROP TABLE IF EXISTS project_tasks;
        DROP TABLE IF EXISTS project_releases;
        DROP TABLE IF EXISTS project_card_config;
        DROP TABLE IF EXISTS project_custom_fields;
        DROP TABLE IF EXISTS project_requirements;
        DROP TABLE IF EXISTS release_receipts;
        DROP TABLE IF EXISTS release_receipt_events;
        DROP TABLE IF EXISTS activity_events;
        DROP TABLE IF EXISTS operational_objects;
        DROP TABLE IF EXISTS board_lanes;
        DROP TABLE IF EXISTS boards;
        DROP TABLE IF EXISTS tag_definitions;
        DROP TABLE IF EXISTS workspaces;
        DELETE FROM app_metadata;
        INSERT INTO app_metadata (key, value) VALUES ('data_schema_version', 'typed-operations-control-surface-v1');
        ",
    )?;
    Ok(())
}

fn create_schema(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            root_path TEXT NOT NULL,
            storage_used_gb REAL NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS boards (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS board_lanes (
            id TEXT PRIMARY KEY,
            board_id TEXT NOT NULL,
            title TEXT NOT NULL,
            tone TEXT NOT NULL,
            allowed_types TEXT,
            placeholder INTEGER NOT NULL DEFAULT 0,
            position INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS operational_objects (
            id TEXT PRIMARY KEY,
            object_type TEXT NOT NULL,
            schema TEXT NOT NULL,
            schema_version TEXT NOT NULL,
            identity_json TEXT NOT NULL,
            metadata_json TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            board_id TEXT NOT NULL,
            lane_id TEXT NOT NULL,
            pinned INTEGER NOT NULL DEFAULT 0,
            card_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tag_definitions (
            tag TEXT PRIMARY KEY,
            color TEXT NOT NULL,
            description TEXT
        );
        ",
    )?;
    Ok(())
}

fn seed_database(conn: &Connection) -> AppResult<()> {
    conn.execute(
        "INSERT OR REPLACE INTO workspaces (id, name, root_path, storage_used_gb) VALUES (?1, ?2, ?3, ?4)",
        params!["aptlantis", "Aptlantis Workspace", "K:\\Aptlantis\\Workspace", 121.3],
    )?;
    for (id, name, description) in [
        (
            "primary",
            "Operations Control",
            "Typed operational objects surfaced for current control work.",
        ),
        (
            "secondary",
            "Broader Work Board",
            "Unfinished, internal, experimental, paused, or otherwise non-primary work.",
        ),
    ] {
        conn.execute(
            "INSERT OR REPLACE INTO boards (id, name, description) VALUES (?1, ?2, ?3)",
            params![id, name, description],
        )?;
    }
    seed_lanes(conn)?;
    seed_tag_definitions(conn)?;
    let object_count: i64 =
        conn.query_row("SELECT COUNT(*) FROM operational_objects", [], |row| {
            row.get(0)
        })?;
    if object_count == 0 {
        seed_objects(conn)?;
    }
    Ok(())
}

fn seed_lanes(conn: &Connection) -> AppResult<()> {
    for (index, lane) in default_lanes().iter().enumerate() {
        conn.execute(
            "
            INSERT OR REPLACE INTO board_lanes (id, board_id, title, tone, allowed_types, placeholder, position)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ",
            params![
                lane.id,
                lane.board_id,
                lane.title,
                lane.tone,
                lane.allowed_types.as_ref().map(|types| serde_json::to_string(types)).transpose()?,
                lane.placeholder.unwrap_or(false) as i64,
                index as i64
            ],
        )?;
    }
    Ok(())
}

fn seed_tag_definitions(conn: &Connection) -> AppResult<()> {
    for (tag, color) in [
        ("CityHall", "#9d7dff"),
        ("Governance", "#43a7ff"),
        ("Operator", "#20d4db"),
        ("Project", "#82d158"),
        ("Reference", "#d3a72d"),
        ("Standard", "#25d5c9"),
        ("Workspace", "#8b5cf6"),
    ] {
        conn.execute(
            "INSERT OR IGNORE INTO tag_definitions (tag, color, description) VALUES (?1, ?2, NULL)",
            params![tag, color],
        )?;
    }
    Ok(())
}

fn seed_objects(conn: &Connection) -> AppResult<()> {
    for object in default_objects() {
        insert_object(conn, &object)?;
    }
    Ok(())
}

fn insert_object(conn: &Connection, object: &OperationalObject) -> AppResult<()> {
    conn.execute(
        "
        INSERT OR REPLACE INTO operational_objects
        (id, object_type, schema, schema_version, identity_json, metadata_json, payload_json, board_id, lane_id, pinned, card_order, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
        ",
        params![
            object.id,
            object.object_type,
            object.schema,
            object.schema_version,
            serde_json::to_string(&object.identity)?,
            serde_json::to_string(&object.metadata)?,
            serde_json::to_string(&object.payload)?,
            object.board.board,
            object.board.lane,
            object.board.pinned as i64,
            object.card_order,
            object.created_at,
            object.updated_at
        ],
    )?;
    Ok(())
}

fn load_board_data(conn: &Connection) -> AppResult<BoardData> {
    Ok(BoardData {
        workspace: load_workspace(conn)?,
        boards: load_boards(conn)?,
        lanes: load_lanes(conn)?,
        objects: load_objects(conn)?,
        tag_definitions: load_tag_definitions(conn)?,
    })
}

fn load_workspace(conn: &Connection) -> AppResult<Workspace> {
    conn.query_row(
        "SELECT id, name, root_path, storage_used_gb FROM workspaces LIMIT 1",
        [],
        |row| {
            Ok(Workspace {
                id: row.get(0)?,
                name: row.get(1)?,
                root_path: row.get(2)?,
                storage_used_gb: row.get(3)?,
            })
        },
    )
    .map_err(AppError::from)
}

fn load_boards(conn: &Connection) -> AppResult<Vec<BoardDefinition>> {
    let mut stmt = conn.prepare("SELECT id, name, description FROM boards ORDER BY CASE id WHEN 'primary' THEN 0 ELSE 1 END, id")?;
    let rows = stmt.query_map([], |row| {
        Ok(BoardDefinition {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn load_lanes(conn: &Connection) -> AppResult<Vec<BoardLane>> {
    let mut stmt = conn.prepare("SELECT id, board_id, title, tone, allowed_types, placeholder FROM board_lanes ORDER BY position, id")?;
    let rows = stmt.query_map([], |row| {
        let allowed_types_json: Option<String> = row.get(4)?;
        Ok(BoardLane {
            id: row.get(0)?,
            board_id: row.get(1)?,
            title: row.get(2)?,
            tone: row.get(3)?,
            allowed_types: allowed_types_json.and_then(|value| serde_json::from_str(&value).ok()),
            placeholder: Some(row.get::<_, i64>(5)? == 1),
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn load_objects(conn: &Connection) -> AppResult<Vec<OperationalObject>> {
    let mut stmt = conn.prepare(
        "
        SELECT id, object_type, schema, schema_version, identity_json, metadata_json, payload_json,
               board_id, lane_id, pinned, card_order, created_at, updated_at
        FROM operational_objects
        ORDER BY board_id, lane_id, card_order, id
        ",
    )?;
    let rows = stmt.query_map([], |row| {
        let board = ObjectBoardPlacement {
            board: row.get(7)?,
            lane: row.get(8)?,
            pinned: row.get::<_, i64>(9)? == 1,
        };
        Ok(OperationalObject {
            id: row.get(0)?,
            object_type: row.get(1)?,
            schema: row.get(2)?,
            schema_version: row.get(3)?,
            identity: serde_json::from_str(&row.get::<_, String>(4)?).unwrap_or_else(|_| {
                ObjectIdentity {
                    id: String::new(),
                    name: "Unnamed Object".into(),
                    acronym: None,
                    summary: String::new(),
                }
            }),
            metadata: serde_json::from_str(&row.get::<_, String>(5)?).unwrap_or_else(|_| {
                ObjectMetadata {
                    tags: Vec::new(),
                    notes: String::new(),
                    created_at: String::new(),
                    updated_at: String::new(),
                }
            }),
            payload: serde_json::from_str(&row.get::<_, String>(6)?).unwrap_or_else(|_| json!({})),
            board,
            card_order: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn load_tag_definitions(conn: &Connection) -> AppResult<Vec<TagDefinition>> {
    let mut stmt =
        conn.prepare("SELECT tag, color, description FROM tag_definitions ORDER BY tag")?;
    let rows = stmt.query_map([], |row| {
        Ok(TagDefinition {
            tag: row.get(0)?,
            color: row.get(1)?,
            description: row.get(2)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn default_lanes() -> Vec<BoardLane> {
    vec![
        lane(
            "city-hall",
            "primary",
            "City Hall Objects",
            "violet",
            Some(vec!["city-hall"]),
            false,
        ),
        lane("stock", "primary", "Stock / Reference", "blue", None, true),
        lane(
            "powershell",
            "primary",
            "PowerShell Operators",
            "cyan",
            Some(vec!["powershell-operator"]),
            false,
        ),
        lane(
            "project-1",
            "primary",
            "Projects",
            "amber",
            Some(vec!["project"]),
            false,
        ),
        lane(
            "project-2",
            "primary",
            "Projects",
            "green",
            Some(vec!["project"]),
            false,
        ),
        lane(
            "project-3",
            "primary",
            "Projects",
            "rose",
            Some(vec!["project"]),
            false,
        ),
        lane("work-1", "secondary", "Work Lane 1", "violet", None, false),
        lane("work-2", "secondary", "Work Lane 2", "blue", None, false),
        lane("work-3", "secondary", "Work Lane 3", "cyan", None, false),
        lane("work-4", "secondary", "Work Lane 4", "amber", None, false),
        lane("work-5", "secondary", "Work Lane 5", "green", None, false),
        lane("work-6", "secondary", "Work Lane 6", "rose", None, false),
    ]
}

fn lane(
    id: &str,
    board_id: &str,
    title: &str,
    tone: &str,
    allowed_types: Option<Vec<&str>>,
    placeholder: bool,
) -> BoardLane {
    BoardLane {
        id: id.into(),
        board_id: board_id.into(),
        title: title.into(),
        tone: tone.into(),
        allowed_types: allowed_types.map(|items| items.into_iter().map(str::to_string).collect()),
        placeholder: Some(placeholder),
    }
}

fn default_objects() -> Vec<OperationalObject> {
    vec![
        city_hall(
            "workspace-governance-standard",
            "Workspace Governance Standard",
            "WGS",
            1,
            "Governs workspace structure, provenance, and operating rules.",
            "D:\\.library\\aptlantis_core\\WGS\\Workspace Governance Standard.md",
        ),
        city_hall(
            "project-proposal-standard",
            "Project Proposal Standard",
            "PPS",
            2,
            "Defines how project proposals become governable work.",
            "D:\\.library\\aptlantis_core\\PPS\\Project Proposal Standard.md",
        ),
        operator(
            "workspace-inventory",
            "Workspace Inventory",
            1,
            "Read-only inventory of local workspace roots and manifests.",
            "K:\\Aptlantis\\Operators\\workspace-inventory.ps1",
            "read-only",
        ),
        operator(
            "artifact-packager",
            "Artifact Packager",
            2,
            "Packages generated workspace artifacts into an output directory.",
            "K:\\Aptlantis\\Operators\\artifact-packager.ps1",
            "generates-output",
        ),
        project(
            "filecabinet",
            "FileCabinet",
            "project-1",
            1,
            "Personal vault and artifact manager for curated archives.",
            "in progress",
            "next",
        ),
        project(
            "structa",
            "Structa",
            "project-2",
            1,
            "Structured data builder for JSON, XML, TOML, and YAML.",
            "in progress",
            "current",
        ),
        project(
            "aegis",
            "Aegis",
            "project-3",
            1,
            "Key manager and security operations surface.",
            "draft",
            "watch",
        ),
        secondary_project(
            "asset-forge",
            "Asset Forge",
            "work-1",
            1,
            "Logo, icon, and app asset normalization utilities.",
        ),
        secondary_project(
            "schema-garden",
            "Schema Garden",
            "work-2",
            1,
            "Reusable schema catalog and validation playground.",
        ),
        secondary_project(
            "release-radar",
            "Release Radar",
            "work-3",
            1,
            "Low-friction release candidate watchlist.",
        ),
    ]
}

fn base_object(
    id: &str,
    object_type: &str,
    name: &str,
    summary: &str,
    board: &str,
    lane: &str,
    card_order: i64,
) -> OperationalObject {
    let (schema, schema_version) = object_definition(object_type);
    OperationalObject {
        id: id.into(),
        object_type: object_type.into(),
        schema: schema.into(),
        schema_version: schema_version.into(),
        identity: ObjectIdentity {
            id: id.into(),
            name: name.into(),
            acronym: None,
            summary: summary.into(),
        },
        board: ObjectBoardPlacement {
            board: board.into(),
            lane: lane.into(),
            pinned: false,
        },
        metadata: ObjectMetadata {
            tags: Vec::new(),
            notes: String::new(),
            created_at: "2026-08-10T09:54:00".into(),
            updated_at: "2026-08-10T09:54:00".into(),
        },
        payload: json!({}),
        created_at: "2026-08-10T09:54:00".into(),
        updated_at: "2026-08-10T09:54:00".into(),
        card_order,
    }
}

fn project(
    id: &str,
    name: &str,
    lane: &str,
    order: i64,
    summary: &str,
    lifecycle: &str,
    attention: &str,
) -> OperationalObject {
    let mut object = base_object(id, "project", name, summary, "primary", lane, order);
    object.metadata.tags = vec!["Project".into(), "Workspace".into()];
    object.payload = json!({
        "classification": {
            "kind": "desktop app",
            "lifecycle": lifecycle,
            "attention": attention,
            "availability": "active"
        },
        "location": {
            "root": format!("K:\\Aptlantis\\Workspace\\{}", name.replace(' ', "")),
            "repository": ""
        },
        "release": {
            "released": false,
            "version": "",
            "targetVersion": ""
        },
        "operation": {
            "defaultIde": "",
            "defaultTerminal": ""
        },
        "governance": {
            "cityHallStatus": "unreviewed"
        }
    });
    object
}

fn secondary_project(
    id: &str,
    name: &str,
    lane: &str,
    order: i64,
    summary: &str,
) -> OperationalObject {
    let mut object = base_object(id, "project", name, summary, "secondary", lane, order);
    object.metadata.tags = vec!["Project".into(), "Reference".into()];
    object.payload = json!({
        "classification": {
            "kind": "tool",
            "lifecycle": "parked",
            "attention": "",
            "availability": ""
        },
        "location": {
            "root": "",
            "repository": ""
        },
        "release": {
            "released": false,
            "version": "",
            "targetVersion": ""
        },
        "operation": {
            "defaultIde": "",
            "defaultTerminal": ""
        },
        "governance": {
            "cityHallStatus": ""
        }
    });
    object
}

fn operator(
    id: &str,
    name: &str,
    order: i64,
    summary: &str,
    script: &str,
    mutation: &str,
) -> OperationalObject {
    let mut object = base_object(
        id,
        "powershell-operator",
        name,
        summary,
        "primary",
        "powershell",
        order,
    );
    object.metadata.tags = vec!["Operator".into(), "Workspace".into()];
    object.payload = json!({
        "source": {
            "script": script
        },
        "execution": {
            "scope": "workspace",
            "workingDirectory": "K:\\Aptlantis\\Workspace",
            "elevation": "none",
            "mutation": mutation,
            "shell": "pwsh"
        },
        "parameters": {
            "discovery": "powershell"
        },
        "output": {
            "kind": "console",
            "artifactPath": ""
        },
        "state": {
            "enabled": true,
            "lastRun": "",
            "lastResult": ""
        }
    });
    object
}

fn city_hall(
    id: &str,
    name: &str,
    acronym: &str,
    order: i64,
    summary: &str,
    path: &str,
) -> OperationalObject {
    let mut object = base_object(
        id,
        "city-hall",
        name,
        summary,
        "primary",
        "city-hall",
        order,
    );
    object.identity.acronym = Some(acronym.into());
    object.metadata.tags = vec!["CityHall".into(), "Governance".into(), "Standard".into()];
    object.payload = json!({
        "document": {
            "path": path,
            "version": "0.1",
            "status": "draft"
        },
        "governance": {
            "domain": "workspace governance",
            "maturity": "usable",
            "adoption": "partial",
            "standardized": false
        },
        "operation": {
            "attention": "current"
        }
    });
    object
}

fn object_definition(object_type: &str) -> (&'static str, &'static str) {
    match object_type {
        "powershell-operator" => ("aptlantis.powershell-operator", "0.1"),
        "city-hall" => ("aptlantis.city-hall", "0.1"),
        _ => ("aptlantis.project", "0.1"),
    }
}

fn unique_object_id(conn: &Connection, identity_id: &str, name: &str) -> AppResult<String> {
    let base = slugify(if identity_id.trim().is_empty() {
        name
    } else {
        identity_id
    });
    let base = if base.is_empty() {
        "object".into()
    } else {
        base
    };
    let mut id = base.clone();
    let mut suffix = 2;
    loop {
        let exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM operational_objects WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;
        if exists == 0 {
            return Ok(id);
        }
        id = format!("{base}-{suffix}");
        suffix += 1;
    }
}

fn upsert_tags(conn: &Connection, tags: &[String]) -> AppResult<()> {
    for tag in tags {
        conn.execute(
            "INSERT OR IGNORE INTO tag_definitions (tag, color, description) VALUES (?1, '#8b5cf6', NULL)",
            params![tag],
        )?;
    }
    Ok(())
}

fn clean_tags(tags: Vec<String>) -> Vec<String> {
    tags.into_iter()
        .map(|tag| tag.trim().to_string())
        .filter(|tag| !tag.is_empty())
        .collect()
}

fn slugify(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn db_now(conn: &Connection) -> AppResult<String> {
    conn.query_row("SELECT datetime('now')", [], |row| row.get(0))
        .map_err(AppError::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initializes_typed_database_with_requested_primary_lanes() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        initialize_database(&conn).expect("database initializes");
        let data = load_board_data(&conn).expect("board data");
        let primary_lanes = data
            .lanes
            .iter()
            .filter(|lane| lane.board_id == "primary")
            .map(|lane| lane.id.as_str())
            .collect::<Vec<_>>();
        assert_eq!(
            primary_lanes,
            vec![
                "city-hall",
                "stock",
                "powershell",
                "project-1",
                "project-2",
                "project-3"
            ]
        );
    }

    #[test]
    fn moving_object_changes_only_board_projection() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        initialize_database(&conn).expect("database initializes");
        let before = load_objects(&conn)
            .expect("objects")
            .into_iter()
            .find(|object| object.id == "filecabinet")
            .expect("seeded object");
        conn.execute(
            "UPDATE operational_objects SET board_id = 'primary', lane_id = 'project-2', card_order = 5 WHERE id = 'filecabinet'",
            [],
        )
        .expect("move projection");
        let after = load_objects(&conn)
            .expect("objects")
            .into_iter()
            .find(|object| object.id == "filecabinet")
            .expect("seeded object");
        assert_eq!(before.identity.name, "FileCabinet");
        assert_eq!(before.object_type, "project");
        assert_eq!(after.identity.name, "FileCabinet");
        assert_eq!(after.object_type, "project");
        assert_eq!(after.board.lane, "project-2");
    }

    #[test]
    fn slugifies_names_for_stable_ids() {
        assert_eq!(slugify("PowerShell Operator"), "powershell-operator");
        assert_eq!(slugify("AptConsole v1.1.0"), "aptconsole-v1-1-0");
    }
}
