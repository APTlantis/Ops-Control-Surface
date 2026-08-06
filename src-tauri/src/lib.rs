use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    path::PathBuf,
    process::Command,
    sync::Mutex,
};
use tauri::{AppHandle, Manager, State};
use thiserror::Error;
use walkdir::WalkDir;

type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Error)]
enum AppError {
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),
    #[error("application data directory is unavailable")]
    MissingAppDataDir,
    #[error("project was not found")]
    MissingProject,
    #[error("release was not found")]
    MissingRelease,
    #[error("path is outside the indexed workspace")]
    UnsafePath,
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
struct ProjectDocument {
    id: String,
    project_id: String,
    kind: String,
    title: String,
    path: String,
    updated_at: String,
    exists: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectTask {
    id: String,
    project_id: String,
    title: String,
    completed: bool,
    source: String,
    position: i64,
    due_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectRelease {
    id: String,
    project_id: String,
    version: String,
    status: String,
    target_date: String,
    readiness: i64,
    notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseReceiptItem {
    id: String,
    key: String,
    title: String,
    category: String,
    status: String,
    severity: String,
    label: String,
    detail: String,
    message: String,
    rationale: Option<String>,
    source: String,
    source_type: String,
    source_ref: Option<String>,
    evidence_refs: Vec<String>,
    checked_at: String,
    evidence_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseReceiptCounts {
    pass: usize,
    warn: usize,
    fail: usize,
    unavailable: usize,
    not_applicable: usize,
    blocking: usize,
    missing_evidence: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseReceipt {
    id: String,
    project_id: String,
    release_id: String,
    project_name: String,
    release_version: String,
    profile: String,
    profile_version: String,
    status: String,
    freshness: String,
    readiness: i64,
    counts: ReleaseReceiptCounts,
    blockers: Vec<String>,
    evidence_refs: Vec<String>,
    missing_evidence: Vec<String>,
    filesystem_reachable: bool,
    validator_runs: Vec<String>,
    generated_at: String,
    generator_version: String,
    input_fingerprint: String,
    summary: String,
    markdown: String,
    items: Vec<ReleaseReceiptItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CustomField {
    id: String,
    project_id: String,
    label: String,
    value: String,
    field_type: String,
    show_on_card: bool,
    position: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CardDisplayConfig {
    card_type: String,
    visible_fields: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Requirement {
    id: String,
    project_id: String,
    title: String,
    status: String,
    severity: String,
    blocking: bool,
    source: String,
    evidence_path: Option<String>,
    notes: Option<String>,
    updated_at: String,
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
struct ActivityEvent {
    id: String,
    project_id: String,
    message: String,
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Project {
    id: String,
    board_id: String,
    db_id: String,
    availability: String,
    name: String,
    description: String,
    card_type: String,
    display_config: CardDisplayConfig,
    status: String,
    priority: String,
    category: String,
    stack: Vec<String>,
    tags: Vec<String>,
    root_path: String,
    created_at: String,
    updated_at: String,
    card_order: i64,
    owner: String,
    accent: String,
    blocked_reason: Option<String>,
    custom_fields: Vec<CustomField>,
    requirements: Vec<Requirement>,
    documents: Vec<ProjectDocument>,
    tasks: Vec<ProjectTask>,
    releases: Vec<ProjectRelease>,
    receipts: Vec<ReleaseReceipt>,
    activity: Vec<ActivityEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BoardData {
    workspace: Workspace,
    boards: Vec<BoardDefinition>,
    project_dbs: Vec<ProjectDbDefinition>,
    projects: Vec<Project>,
    tag_definitions: Vec<TagDefinition>,
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
struct ProjectDbDefinition {
    id: String,
    name: String,
    description: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSetup {
    card_type: String,
    display_config: CardDisplayConfig,
    custom_fields: Vec<CustomField>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectInput {
    id: Option<String>,
    board_id: String,
    db_id: String,
    availability: Option<String>,
    name: String,
    description: String,
    status: String,
    priority: String,
    category: String,
    tags: Vec<String>,
    stack: Vec<String>,
    root_path: Option<String>,
    owner: Option<String>,
    accent: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectBasicsUpdate {
    project_id: String,
    board_id: String,
    db_id: String,
    availability: String,
    status: String,
    priority: String,
    tags: Vec<String>,
    stack: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ManifestProject {
    id: Option<String>,
    name: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    description: Option<String>,
    category: Option<String>,
    tags: Option<Vec<String>>,
    stack: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct Manifest {
    project: Option<ManifestProject>,
}

#[tauri::command]
fn get_board_data(state: State<AppState>) -> AppResult<BoardData> {
    let conn = state.db.lock().expect("database mutex poisoned");
    load_board_data(&conn)
}

#[tauri::command]
fn move_project(project_id: String, status: String, card_order: i64, state: State<AppState>) -> AppResult<BoardData> {
    let conn = state.db.lock().expect("database mutex poisoned");
    conn.execute(
        "UPDATE projects SET status = ?1, card_order = ?2, updated_at = datetime('now') WHERE id = ?3",
        params![status, card_order, project_id],
    )?;
    conn.execute(
        "INSERT INTO activity_events (id, project_id, message, created_at) VALUES (?1, ?2, ?3, datetime('now'))",
        params![
            uuid::Uuid::new_v4().to_string(),
            project_id,
            "Moved project on the Kanban board."
        ],
    )?;
    load_board_data(&conn)
}

#[tauri::command]
fn create_project(input: ProjectInput, state: State<AppState>) -> AppResult<BoardData> {
    let conn = state.db.lock().expect("database mutex poisoned");
    let id = unique_project_id(&conn, input.id.unwrap_or_else(|| slugify(&input.name)))?;
    let root_path = input
        .root_path
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| format!("K:\\Aptlantis\\Workspace\\{}", input.name.replace(' ', "")));
    let card_order: i64 = conn.query_row(
        "SELECT COALESCE(MAX(card_order), 0) + 1 FROM projects WHERE board_id = ?1 AND status = ?2",
        params![input.board_id, input.status],
        |row| row.get(0),
    )?;

    conn.execute(
        "
        INSERT INTO projects
        (id, board_id, db_id, availability, name, description, status, priority, category, stack, tags, root_path, created_at, updated_at, card_order, owner, accent, blocked_reason)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, datetime('now'), datetime('now'), ?13, ?14, ?15, ?16)
        ",
        params![
            id,
            input.board_id,
            input.db_id,
            input.availability.unwrap_or_else(|| "available".into()),
            input.name,
            input.description,
            input.status,
            input.priority,
            input.category,
            serde_json::to_string(&input.stack).unwrap_or_else(|_| "[]".into()),
            serde_json::to_string(&input.tags).unwrap_or_else(|_| "[]".into()),
            root_path,
            card_order,
            input.owner.unwrap_or_else(|| "aptlantis".into()),
            input.accent.unwrap_or_else(|| "cyan".into()),
            if input.status == "blocked" {
                Some("Dependency or project requirement needs attention.")
            } else {
                None
            }
        ],
    )?;
    let tag_refs = input.tags.iter().map(String::as_str).collect::<Vec<_>>();
    seed_children_from_owned_tags(&conn, &id, &input.name, &input.status, &input.priority, &tag_refs, "manual intake")?;
    for tag in input.tags {
        conn.execute(
            "INSERT OR IGNORE INTO tag_definitions (tag, color, description) VALUES (?1, '#8b5cf6', NULL)",
            params![tag],
        )?;
    }
    conn.execute(
        "INSERT INTO activity_events (id, project_id, message, created_at) VALUES (?1, ?2, 'Created project card from intake.', datetime('now'))",
        params![uuid::Uuid::new_v4().to_string(), id],
    )?;
    load_board_data(&conn)
}

#[tauri::command]
fn update_project_basics(update: ProjectBasicsUpdate, state: State<AppState>) -> AppResult<BoardData> {
    let conn = state.db.lock().expect("database mutex poisoned");
    conn.execute(
        "
        UPDATE projects
        SET board_id = ?1, db_id = ?2, availability = ?3, status = ?4, priority = ?5, category = ?6, tags = ?7, stack = ?8, updated_at = datetime('now')
        WHERE id = ?9
        ",
        params![
            update.board_id,
            update.db_id,
            update.availability,
            update.status,
            update.priority,
            update.tags.first().cloned().unwrap_or_else(|| "Tooling".into()),
            serde_json::to_string(&update.tags).unwrap_or_else(|_| "[]".into()),
            serde_json::to_string(&update.stack).unwrap_or_else(|_| "[]".into()),
            update.project_id,
        ],
    )?;
    for tag in update.tags {
        conn.execute(
            "INSERT OR IGNORE INTO tag_definitions (tag, color, description) VALUES (?1, '#8b5cf6', NULL)",
            params![tag],
        )?;
    }
    load_board_data(&conn)
}

#[tauri::command]
fn update_project_setup(project_id: String, setup: ProjectSetup, state: State<AppState>) -> AppResult<BoardData> {
    let conn = state.db.lock().expect("database mutex poisoned");
    conn.execute(
        "
        INSERT INTO project_card_config (project_id, card_type, visible_fields)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(project_id) DO UPDATE SET card_type = excluded.card_type, visible_fields = excluded.visible_fields
        ",
        params![
            project_id,
            setup.card_type,
            serde_json::to_string(&setup.display_config.visible_fields).unwrap_or_else(|_| "[]".into())
        ],
    )?;
    conn.execute("DELETE FROM project_custom_fields WHERE project_id = ?1", params![project_id])?;
    for (index, field) in setup.custom_fields.iter().enumerate() {
        conn.execute(
            "
            INSERT INTO project_custom_fields (id, project_id, label, value, field_type, show_on_card, position)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ",
            params![
                field.id,
                project_id,
                field.label,
                field.value,
                field.field_type,
                field.show_on_card as i64,
                index as i64 + 1
            ],
        )?;
    }
    conn.execute("UPDATE projects SET updated_at = datetime('now') WHERE id = ?1", params![project_id])?;
    load_board_data(&conn)
}

#[tauri::command]
fn update_release(release: ProjectRelease, state: State<AppState>) -> AppResult<BoardData> {
    let conn = state.db.lock().expect("database mutex poisoned");
    conn.execute(
        "
        INSERT INTO project_releases (id, project_id, version, status, target_date, readiness, notes)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ON CONFLICT(id) DO UPDATE SET
          version = excluded.version,
          status = excluded.status,
          target_date = excluded.target_date,
          readiness = excluded.readiness,
          notes = excluded.notes
        ",
        params![
            release.id,
            release.project_id,
            release.version,
            release.status,
            release.target_date,
            release.readiness,
            release.notes
        ],
    )?;
    load_board_data(&conn)
}

#[tauri::command]
fn create_requirement(requirement: Requirement, state: State<AppState>) -> AppResult<BoardData> {
    let conn = state.db.lock().expect("database mutex poisoned");
    upsert_requirement(&conn, &requirement)?;
    load_board_data(&conn)
}

#[tauri::command]
fn update_requirement(requirement: Requirement, state: State<AppState>) -> AppResult<BoardData> {
    let conn = state.db.lock().expect("database mutex poisoned");
    upsert_requirement(&conn, &requirement)?;
    load_board_data(&conn)
}

#[tauri::command]
fn delete_requirement(project_id: String, requirement_id: String, state: State<AppState>) -> AppResult<BoardData> {
    let conn = state.db.lock().expect("database mutex poisoned");
    conn.execute(
        "DELETE FROM project_requirements WHERE project_id = ?1 AND id = ?2",
        params![project_id, requirement_id],
    )?;
    load_board_data(&conn)
}

#[tauri::command]
fn update_tag_definition(tag_definition: TagDefinition, state: State<AppState>) -> AppResult<BoardData> {
    let conn = state.db.lock().expect("database mutex poisoned");
    conn.execute(
        "
        INSERT INTO tag_definitions (tag, color, description)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(tag) DO UPDATE SET color = excluded.color, description = excluded.description
        ",
        params![tag_definition.tag, tag_definition.color, tag_definition.description],
    )?;
    load_board_data(&conn)
}

#[tauri::command]
fn generate_release_receipt(project_id: String, release_id: Option<String>, state: State<AppState>) -> AppResult<BoardData> {
    let conn = state.db.lock().expect("database mutex poisoned");
    let board = load_board_data(&conn)?;
    let project = board
        .projects
        .into_iter()
        .find(|candidate| candidate.id == project_id)
        .ok_or(AppError::MissingProject)?;
    let release = release_id
        .as_ref()
        .and_then(|id| project.releases.iter().find(|candidate| &candidate.id == id))
        .or_else(|| project.releases.first())
        .cloned()
        .ok_or(AppError::MissingRelease)?;
    let generated_at: String = conn.query_row("SELECT datetime('now')", [], |row| row.get(0))?;
    let receipt = build_release_receipt(&project, &release, generated_at)?;
    save_release_receipt(&conn, &receipt)?;
    conn.execute(
        "INSERT INTO activity_events (id, project_id, message, created_at) VALUES (?1, ?2, ?3, datetime('now'))",
        params![
            uuid::Uuid::new_v4().to_string(),
            project.id,
            format!("Generated {} release receipt.", receipt.profile.to_uppercase())
        ],
    )?;
    load_board_data(&conn)
}

#[tauri::command]
fn scan_workspace(root_path: Option<String>, state: State<AppState>) -> AppResult<BoardData> {
    let conn = state.db.lock().expect("database mutex poisoned");
    let workspace = get_workspace(&conn)?;
    let root = root_path.unwrap_or(workspace.root_path);
    scan_root_into_db(&conn, PathBuf::from(root))?;
    load_board_data(&conn)
}

#[tauri::command]
fn open_path(path: String, state: State<AppState>) -> AppResult<()> {
    let conn = state.db.lock().expect("database mutex poisoned");
    let workspace = get_workspace(&conn)?;
    let requested = PathBuf::from(path);
    let root = PathBuf::from(workspace.root_path);

    if requested.exists() {
        let canonical_requested = requested.canonicalize()?;
        let canonical_root = root.canonicalize().unwrap_or(root);
        if !canonical_requested.starts_with(canonical_root) {
            return Err(AppError::UnsafePath);
        }
        open::that(canonical_requested)?;
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
            seed_database(&conn)?;
            app.manage(AppState {
                db: Mutex::new(conn),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_board_data,
            move_project,
            create_project,
            update_project_basics,
            update_project_setup,
            update_release,
            create_requirement,
            update_requirement,
            delete_requirement,
            update_tag_definition,
            generate_release_receipt,
            scan_workspace,
            open_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running Aptlantis Ops");
}

fn app_data_db_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app.path().app_data_dir().map_err(|_| AppError::MissingAppDataDir)?;
    Ok(dir.join("aptlantis-board.sqlite3"))
}

fn ensure_column(conn: &Connection, table: &str, column: &str, definition: &str) -> AppResult<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let columns = stmt.query_map([], |row| row.get::<_, String>(1))?;
    for item in columns {
        if item? == column {
            return Ok(());
        }
    }
    conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"), [])?;
    Ok(())
}

fn board_definitions() -> Vec<BoardDefinition> {
    vec![
        BoardDefinition {
            id: "primary".into(),
            name: "Primary Board".into(),
            description: "Mainline projects and current release-critical work.".into(),
        },
        BoardDefinition {
            id: "secondary".into(),
            name: "Secondary Board".into(),
            description: "Satellite, exploratory, parked, or lower-pressure projects.".into(),
        },
    ]
}

fn project_db_definitions() -> Vec<ProjectDbDefinition> {
    vec![
        ProjectDbDefinition {
            id: "active".into(),
            name: "Active DB".into(),
            description: "Reachable projects currently participating in normal workspace operations.".into(),
        },
        ProjectDbDefinition {
            id: "archive".into(),
            name: "Archive DB".into(),
            description: "Historical or reference projects kept for lookup.".into(),
        },
        ProjectDbDefinition {
            id: "holding".into(),
            name: "Holding DB".into(),
            description: "Unreachable or parked projects retained until they come back.".into(),
        },
    ]
}

fn initialize_database(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            root_path TEXT NOT NULL,
            storage_used_gb REAL NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            board_id TEXT NOT NULL DEFAULT 'primary',
            db_id TEXT NOT NULL DEFAULT 'active',
            availability TEXT NOT NULL DEFAULT 'available',
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL,
            priority TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'Tooling',
            stack TEXT NOT NULL DEFAULT '[]',
            tags TEXT NOT NULL DEFAULT '[]',
            root_path TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            card_order INTEGER NOT NULL DEFAULT 0,
            owner TEXT NOT NULL DEFAULT 'aptlantis',
            accent TEXT NOT NULL DEFAULT 'cyan',
            blocked_reason TEXT
        );

        CREATE TABLE IF NOT EXISTS project_documents (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            title TEXT NOT NULL,
            path TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            exists_flag INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS project_tasks (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            title TEXT NOT NULL,
            completed INTEGER NOT NULL DEFAULT 0,
            source TEXT NOT NULL DEFAULT 'project/tasks.toml',
            position INTEGER NOT NULL DEFAULT 0,
            due_date TEXT
        );

        CREATE TABLE IF NOT EXISTS project_releases (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            version TEXT NOT NULL,
            status TEXT NOT NULL,
            target_date TEXT NOT NULL,
            readiness INTEGER NOT NULL DEFAULT 0,
            notes TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS project_card_config (
            project_id TEXT PRIMARY KEY,
            card_type TEXT NOT NULL DEFAULT 'project',
            visible_fields TEXT NOT NULL DEFAULT '[]'
        );

        CREATE TABLE IF NOT EXISTS project_custom_fields (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            label TEXT NOT NULL,
            value TEXT NOT NULL DEFAULT '',
            field_type TEXT NOT NULL DEFAULT 'text',
            show_on_card INTEGER NOT NULL DEFAULT 0,
            position INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS project_requirements (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            title TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            severity TEXT NOT NULL DEFAULT 'medium',
            blocking INTEGER NOT NULL DEFAULT 0,
            source TEXT NOT NULL DEFAULT 'manual',
            evidence_path TEXT,
            notes TEXT,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS release_receipts (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            release_id TEXT NOT NULL,
            profile TEXT NOT NULL,
            status TEXT NOT NULL,
            readiness INTEGER NOT NULL DEFAULT 0,
            generated_at TEXT NOT NULL,
            summary TEXT NOT NULL,
            markdown TEXT NOT NULL,
            items_json TEXT NOT NULL DEFAULT '[]',
            UNIQUE(project_id, release_id)
        );

        CREATE TABLE IF NOT EXISTS release_receipt_events (
            receipt_id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            release_id TEXT NOT NULL,
            profile_id TEXT NOT NULL,
            profile_version TEXT NOT NULL,
            status TEXT NOT NULL,
            freshness TEXT NOT NULL,
            readiness_score INTEGER NOT NULL DEFAULT 0,
            generated_at TEXT NOT NULL,
            generator_version TEXT NOT NULL,
            input_fingerprint TEXT NOT NULL,
            receipt_json TEXT NOT NULL,
            markdown_text TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tag_definitions (
            tag TEXT PRIMARY KEY,
            color TEXT NOT NULL,
            description TEXT
        );

        CREATE TABLE IF NOT EXISTS activity_events (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        ",
    )?;
    ensure_column(conn, "projects", "board_id", "TEXT NOT NULL DEFAULT 'primary'")?;
    ensure_column(conn, "projects", "db_id", "TEXT NOT NULL DEFAULT 'active'")?;
    ensure_column(conn, "projects", "availability", "TEXT NOT NULL DEFAULT 'available'")?;

    Ok(())
}

fn seed_database(conn: &Connection) -> AppResult<()> {
    seed_tag_definitions(conn)?;

    let project_count: i64 = conn.query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))?;
    if project_count > 0 {
        backfill_card_metadata(conn)?;
        return Ok(());
    }

    conn.execute(
        "INSERT OR REPLACE INTO workspaces (id, name, root_path, storage_used_gb) VALUES (?1, ?2, ?3, ?4)",
        params!["aptlantis", "Aptlantis Workspace", "K:\\Aptlantis\\Workspace", 121.3],
    )?;

    let seeds = [
        ("archivehasher", "ArchiveHasher", "backlog", "P3", "AAMHS v2.0 publication tooling", "Tooling", vec!["Tooling", "Hashing"], 1, "violet"),
        ("clonecrates", "CloneCrates", "backlog", "P3", "Rust crates mirror and analytics", "Tooling", vec!["Tooling", "Mirroring"], 2, "violet"),
        ("chat-archive", "Chat Archive", "backlog", "P3", "Import/export and viewer for AI chat archives", "Tooling", vec!["Tooling", "Ingestion"], 3, "violet"),
        ("squashfs", "SquashfsBasedWSL", "backlog", "P4", "Multiple squashfs distros converted to WSL", "Tooling", vec!["Tooling", "WSL"], 4, "green"),
        ("disk-planner", "Disk Planner", "planned", "P2", "Plan first, execute second, record everything.", "Tooling", vec!["Tooling", "UI"], 1, "amber"),
        ("wintrim", "Wintrim", "planned", "P2", "Evidence-backed Windows 11 ISO customization", "Tooling", vec!["Tooling", "Cleanup"], 2, "green"),
        ("aptconsole", "AptConsole", "planned", "P2", "Operations dashboard for local dev and infrastructure", "Tooling", vec!["Tooling", "CLI"], 3, "blue"),
        ("command-wizard", "Command Wizard", "planned", "P3", "Schema-driven command builder", "Tooling", vec!["Tooling", "UI"], 4, "amber"),
        ("filecabinet", "FileCabinet", "in-progress", "P1", "Personal vault and artifact manager for curated archives.", "Archival", vec!["WPF", "Archival", "Metadata"], 1, "cyan"),
        ("structa", "Structa", "in-progress", "P1", "Structured data builder for JSON, XML, TOML, YAML", "Metadata", vec!["WPF", "Metadata", "UI"], 2, "cyan"),
        ("aegis", "Aegis", "in-progress", "P1", "PGP and post-quantum key manager", "Security", vec!["Tauri", "Security"], 3, "amber"),
        ("city-hall", "City Hall Website", "review", "P2", "Workspace governance and agent standards", "Website", vec!["Website", "WPF"], 1, "green"),
        ("docs-hub", "Aptlantis Docs Hub", "review", "P2", "Project documentation hub and publishing flow", "Docs", vec!["Docs", "Website"], 2, "violet"),
        ("evidence-pipeline", "Evidence Pipeline", "review", "P1", "Tamper-evident release evidence capture", "Evidence", vec!["Archival", "Evidence"], 3, "cyan"),
        ("aptconsole-release", "AptConsole v1.1.0", "released", "P2", "Plugin system and profiles", "Tooling", vec!["Tooling", "Released"], 1, "green"),
        ("filecabinet-release", "FileCabinet v0.9.0", "released", "P2", "Ingestion and metadata foundation", "Archival", vec!["WPF", "Archival", "Released"], 2, "green"),
        ("chrome-plugin", "Chrome Archival Plugin", "blocked", "P2", "Browser capture extension integration", "Browser", vec!["Browser", "Plugin"], 1, "rose"),
        ("city-mobile", "City Hall Mobile View", "blocked", "P3", "Responsive layout and touch navigation", "Website", vec!["Website", "UI"], 2, "rose"),
    ];

    for (id, name, status, priority, description, category, tags, card_order, accent) in seeds {
        insert_project(
            conn,
            id,
            name,
            status,
            priority,
            description,
            category,
            tags.clone(),
            tags,
            &format!("K:\\Aptlantis\\Workspace\\{}", name.replace(' ', "")),
            card_order,
            accent,
        )?;
    }

    backfill_card_metadata(conn)?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn insert_project(
    conn: &Connection,
    id: &str,
    name: &str,
    status: &str,
    priority: &str,
    description: &str,
    category: &str,
    stack: Vec<&str>,
    tags: Vec<&str>,
    root_path: &str,
    card_order: i64,
    accent: &str,
) -> AppResult<()> {
    conn.execute(
        "
        INSERT OR REPLACE INTO projects
        (id, board_id, db_id, availability, name, description, status, priority, category, stack, tags, root_path, created_at, updated_at, card_order, owner, accent, blocked_reason)
        VALUES (?1, 'primary', 'active', 'available', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, '2026-03-01T09:12:00', '2026-08-06T09:54:00', ?10, 'aptlantis', ?11, ?12)
        ",
        params![
            id,
            name,
            description,
            status,
            priority,
            category,
            serde_json::to_string(&stack).unwrap_or_else(|_| "[]".into()),
            serde_json::to_string(&tags).unwrap_or_else(|_| "[]".into()),
            root_path,
            card_order,
            accent,
            if status == "blocked" {
                Some("Dependency or API change needs attention.")
            } else {
                None
            }
        ],
    )?;

    seed_children(conn, id, name, status, tags)?;
    Ok(())
}

fn seed_children(conn: &Connection, id: &str, name: &str, status: &str, tags: Vec<&str>) -> AppResult<()> {
    let docs = [
        ("manifest", format!("{}.manifest.toml", name), format!("project/{}.manifest.toml", id), 1),
        ("readme", "README.md".to_string(), "README.md".to_string(), 1),
        ("evidence", "Release Evidence".to_string(), "evidence/release".to_string(), if status == "backlog" { 0 } else { 1 }),
    ];

    for (kind, title, path, exists_flag) in docs {
        conn.execute(
            "INSERT OR REPLACE INTO project_documents (id, project_id, kind, title, path, updated_at, exists_flag) VALUES (?1, ?2, ?3, ?4, ?5, '2026-07-15', ?6)",
            params![format!("{id}-{kind}"), id, kind, title, path, exists_flag],
        )?;
    }

    let task_one = if tags.contains(&"Archival") {
        "Ingestion pipeline"
    } else {
        "Define project manifest"
    };
    let task_two = if tags.contains(&"Evidence") {
        "Evidence manifest"
    } else {
        "Document operator workflow"
    };
    let completed_one = status != "backlog";
    let completed_two = matches!(status, "review" | "released");
    let completed_three = status == "released";

    for (position, title, completed, source) in [
        (1, task_one, completed_one, "project/tasks.toml"),
        (2, task_two, completed_two, "project/tasks.toml"),
        (3, "Package release notes", completed_three, "project/releases.toml"),
    ] {
        conn.execute(
            "INSERT OR REPLACE INTO project_tasks (id, project_id, title, completed, source, position, due_date) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL)",
            params![format!("{id}-task-{position}"), id, title, completed as i64, source, position],
        )?;
    }

    let readiness = match status {
        "released" => 100,
        "review" => 72,
        "in-progress" => 58,
        _ => 24,
    };
    conn.execute(
        "INSERT OR REPLACE INTO project_releases (id, project_id, version, status, target_date, readiness, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            format!("{id}-release"),
            id,
            if status == "released" { "v1.0.0" } else { "v0.9.0" },
            if status == "released" { "Released" } else { "Target" },
            if status == "released" { "2026-06-30" } else { "2026-08-30" },
            readiness,
            "Focus this cycle on project metadata, evidence capture, and release readiness."
        ],
    )?;

    let card_type = card_type_for_tags(&tags);
    conn.execute(
        "INSERT OR REPLACE INTO project_card_config (project_id, card_type, visible_fields) VALUES (?1, ?2, ?3)",
        params![
            id,
            card_type,
            serde_json::to_string(&visible_fields_for_card_type(card_type)).unwrap_or_else(|_| "[]".into())
        ],
    )?;

    conn.execute(
        "INSERT OR REPLACE INTO project_custom_fields (id, project_id, label, value, field_type, show_on_card, position) VALUES (?1, ?2, ?3, ?4, 'text', 0, 1)",
        params![format!("{id}-field-source"), id, "Canonical Source", "project manifest"],
    )?;

    for (suffix, title, req_status, severity, blocking, source, evidence_path, notes) in [
        (
            "manifest",
            "Project manifest is current",
            if status == "backlog" { "open" } else { "satisfied" },
            severity_for_status(status),
            matches!(status, "blocked" | "in-progress"),
            "project manifest",
            format!("project/{id}.manifest.toml"),
            "Required for release readiness and card metadata provenance.",
        ),
        (
            "evidence",
            "Release evidence is captured",
            if matches!(status, "review" | "released") { "satisfied" } else { "open" },
            if status == "blocked" { "critical" } else { "medium" },
            status == "blocked",
            "evidence/release",
            "evidence/release".to_string(),
            if status == "blocked" {
                "Missing or stale evidence is blocking the next release."
            } else {
                "Evidence should be linked before release."
            },
        ),
    ] {
        conn.execute(
            "
            INSERT OR REPLACE INTO project_requirements
            (id, project_id, title, status, severity, blocking, source, evidence_path, notes, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, '2026-08-06T09:54:00')
            ",
            params![
                format!("{id}-req-{suffix}"),
                id,
                title,
                req_status,
                severity,
                blocking as i64,
                source,
                evidence_path,
                notes
            ],
        )?;
    }

    conn.execute(
        "INSERT OR REPLACE INTO activity_events (id, project_id, message, created_at) VALUES (?1, ?2, ?3, '2026-08-06T03:41:00')",
        params![format!("{id}-activity-1"), id, "Indexed project documents and task metadata."],
    )?;

    Ok(())
}

fn seed_children_from_owned_tags(
    conn: &Connection,
    id: &str,
    name: &str,
    status: &str,
    priority: &str,
    tags: &[&str],
    source_label: &str,
) -> AppResult<()> {
    let docs = [
        ("manifest", format!("{}.manifest.toml", name), format!("project/{}.manifest.toml", id), 0),
        ("readme", "README.md".to_string(), "README.md".to_string(), 0),
        (
            "evidence",
            "Release Evidence".to_string(),
            "evidence/release".to_string(),
            if matches!(status, "review" | "released") { 1 } else { 0 },
        ),
    ];

    for (kind, title, path, exists_flag) in docs {
        conn.execute(
            "INSERT OR REPLACE INTO project_documents (id, project_id, kind, title, path, updated_at, exists_flag) VALUES (?1, ?2, ?3, ?4, ?5, date('now'), ?6)",
            params![format!("{id}-{kind}"), id, kind, title, path, exists_flag],
        )?;
    }

    let task_one = if tags.contains(&"Archival") {
        "Ingestion pipeline"
    } else {
        "Define project manifest"
    };
    for (position, title, source) in [
        (1, task_one, "project/tasks.toml"),
        (2, "Document operator workflow", "project/tasks.toml"),
        (3, "Package release notes", "project/releases.toml"),
    ] {
        conn.execute(
            "INSERT OR REPLACE INTO project_tasks (id, project_id, title, completed, source, position, due_date) VALUES (?1, ?2, ?3, 0, ?4, ?5, NULL)",
            params![format!("{id}-task-{position}"), id, title, source, position],
        )?;
    }

    let readiness = match status {
        "released" => 100,
        "review" => 72,
        "in-progress" => 40,
        _ => 0,
    };
    conn.execute(
        "INSERT OR REPLACE INTO project_releases (id, project_id, version, status, target_date, readiness, notes) VALUES (?1, ?2, ?3, ?4, date('now'), ?5, 'New project intake; release target is not yet planned.')",
        params![
            format!("{id}-release"),
            id,
            if status == "released" { "v1.0.0" } else { "v0.1.0" },
            if status == "released" { "Released" } else { "Target" },
            readiness
        ],
    )?;

    let card_type = card_type_for_tags(tags);
    conn.execute(
        "INSERT OR REPLACE INTO project_card_config (project_id, card_type, visible_fields) VALUES (?1, ?2, ?3)",
        params![
            id,
            card_type,
            serde_json::to_string(&visible_fields_for_card_type(card_type)).unwrap_or_else(|_| "[]".into())
        ],
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO project_custom_fields (id, project_id, label, value, field_type, show_on_card, position) VALUES (?1, ?2, 'Canonical Source', ?3, 'text', 0, 1)",
        params![format!("{id}-field-source"), id, source_label],
    )?;
    conn.execute(
        "
        INSERT OR REPLACE INTO project_requirements
        (id, project_id, title, status, severity, blocking, source, evidence_path, notes, updated_at)
        VALUES (?1, ?2, 'Project manifest is current', 'open', ?3, ?4, 'project manifest', ?5, 'Created from project intake.', datetime('now'))
        ",
        params![
            format!("{id}-req-manifest"),
            id,
            severity_for_priority(priority),
            (priority == "P1") as i64,
            format!("project/{id}.manifest.toml")
        ],
    )?;
    Ok(())
}

fn unique_project_id(conn: &Connection, candidate: String) -> AppResult<String> {
    let base = if candidate.trim().is_empty() {
        "project".into()
    } else {
        slugify(&candidate)
    };
    let mut id = base.clone();
    let mut suffix = 2;
    loop {
        let exists: i64 = conn.query_row("SELECT COUNT(*) FROM projects WHERE id = ?1", params![id], |row| row.get(0))?;
        if exists == 0 {
            return Ok(id);
        }
        id = format!("{base}-{suffix}");
        suffix += 1;
    }
}

fn seed_tag_definitions(conn: &Connection) -> AppResult<()> {
    for (tag, color) in [
        ("Archival", "#20d4db"),
        ("Browser", "#f0657f"),
        ("Cleanup", "#82d158"),
        ("CLI", "#43a7ff"),
        ("Docs", "#9d7dff"),
        ("Evidence", "#25d5c9"),
        ("Hashing", "#d3a72d"),
        ("Ingestion", "#e765c7"),
        ("Metadata", "#31c9f4"),
        ("Mirroring", "#8b5cf6"),
        ("Plugin", "#ff8c32"),
        ("Released", "#82d158"),
        ("Security", "#e8ad2d"),
        ("Tauri", "#43a7ff"),
        ("Tooling", "#8b5cf6"),
        ("UI", "#21b7c6"),
        ("Website", "#d3a72d"),
        ("WPF", "#20d4db"),
        ("WSL", "#86c861"),
    ] {
        conn.execute(
            "INSERT OR IGNORE INTO tag_definitions (tag, color, description) VALUES (?1, ?2, NULL)",
            params![tag, color],
        )?;
    }
    Ok(())
}

fn backfill_card_metadata(conn: &Connection) -> AppResult<()> {
    let mut stmt = conn.prepare("SELECT id, status, priority, tags FROM projects")?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            parse_json_vec(row.get::<_, String>(3)?),
        ))
    })?;

    for row in rows {
        let (id, status, priority, tags) = row?;
        let tag_refs = tags.iter().map(String::as_str).collect::<Vec<_>>();
        let card_type = card_type_for_tags(&tag_refs);
        conn.execute(
            "INSERT OR IGNORE INTO project_card_config (project_id, card_type, visible_fields) VALUES (?1, ?2, ?3)",
            params![
                id,
                card_type,
                serde_json::to_string(&visible_fields_for_card_type(card_type)).unwrap_or_else(|_| "[]".into())
            ],
        )?;
        conn.execute(
            "INSERT OR IGNORE INTO project_custom_fields (id, project_id, label, value, field_type, show_on_card, position) VALUES (?1, ?2, 'Canonical Source', 'project manifest', 'text', 0, 1)",
            params![format!("{id}-field-source"), id],
        )?;
        conn.execute(
            "
            INSERT OR IGNORE INTO project_requirements
            (id, project_id, title, status, severity, blocking, source, evidence_path, notes, updated_at)
            VALUES (?1, ?2, 'Project manifest is current', ?3, ?4, ?5, 'project manifest', ?6, 'Required for release readiness and card metadata provenance.', datetime('now'))
            ",
            params![
                format!("{id}-req-manifest"),
                id,
                if status == "backlog" { "open" } else { "satisfied" },
                severity_for_priority(&priority),
                matches!(status.as_str(), "blocked" | "in-progress") as i64,
                format!("project/{id}.manifest.toml")
            ],
        )?;
    }
    Ok(())
}

fn card_type_for_tags(tags: &[&str]) -> &'static str {
    if tags.contains(&"Released") {
        "release"
    } else if tags.contains(&"Evidence") {
        "evidence"
    } else if tags.contains(&"Security") {
        "requirement"
    } else {
        "project"
    }
}

fn visible_fields_for_card_type(card_type: &str) -> Vec<&'static str> {
    match card_type {
        "release" => vec!["release", "requirements", "evidence", "tags"],
        "requirement" => vec!["requirements", "priority", "owner", "tags"],
        "evidence" => vec!["evidence", "requirements", "release", "tags"],
        "task" => vec!["tasks", "priority", "owner", "tags"],
        _ => vec!["description", "tags", "tasks", "release", "requirements"],
    }
}

fn severity_for_status(status: &str) -> &'static str {
    if status == "blocked" {
        "critical"
    } else {
        "medium"
    }
}

fn severity_for_priority(priority: &str) -> &'static str {
    match priority {
        "P1" => "critical",
        "P2" => "high",
        "P3" => "medium",
        _ => "low",
    }
}

fn upsert_requirement(conn: &Connection, requirement: &Requirement) -> AppResult<()> {
    conn.execute(
        "
        INSERT INTO project_requirements
        (id, project_id, title, status, severity, blocking, source, evidence_path, notes, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          status = excluded.status,
          severity = excluded.severity,
          blocking = excluded.blocking,
          source = excluded.source,
          evidence_path = excluded.evidence_path,
          notes = excluded.notes,
          updated_at = excluded.updated_at
        ",
        params![
            requirement.id,
            requirement.project_id,
            requirement.title,
            requirement.status,
            requirement.severity,
            requirement.blocking as i64,
            requirement.source,
            requirement.evidence_path,
            requirement.notes,
        ],
    )?;
    Ok(())
}

fn load_board_data(conn: &Connection) -> AppResult<BoardData> {
    let workspace = get_workspace(conn)?;
    let mut stmt = conn.prepare(
        "
        SELECT id, board_id, db_id, availability, name, description, status, priority, category, stack, tags, root_path, created_at, updated_at, card_order, owner, accent, blocked_reason
        FROM projects
        ORDER BY board_id, status, card_order, name
        ",
    )?;

    let project_rows = stmt.query_map([], |row| {
        Ok(Project {
            id: row.get(0)?,
            board_id: row.get(1)?,
            db_id: row.get(2)?,
            availability: row.get(3)?,
            name: row.get(4)?,
            description: row.get(5)?,
            card_type: "project".into(),
            display_config: CardDisplayConfig {
                card_type: "project".into(),
                visible_fields: visible_fields_for_card_type("project").into_iter().map(str::to_string).collect(),
            },
            status: row.get(6)?,
            priority: row.get(7)?,
            category: row.get(8)?,
            stack: parse_json_vec(row.get::<_, String>(9)?),
            tags: parse_json_vec(row.get::<_, String>(10)?),
            root_path: row.get(11)?,
            created_at: row.get(12)?,
            updated_at: row.get(13)?,
            card_order: row.get(14)?,
            owner: row.get(15)?,
            accent: row.get(16)?,
            blocked_reason: row.get(17)?,
            custom_fields: Vec::new(),
            requirements: Vec::new(),
            documents: Vec::new(),
            tasks: Vec::new(),
            releases: Vec::new(),
            receipts: Vec::new(),
            activity: Vec::new(),
        })
    })?;

    let mut projects = Vec::new();
    for row in project_rows {
        let mut project = row?;
        let display_config = load_display_config(conn, &project.id)?;
        project.card_type = display_config.card_type.clone();
        project.display_config = display_config;
        project.custom_fields = load_custom_fields(conn, &project.id)?;
        project.requirements = load_requirements(conn, &project.id)?;
        project.documents = load_documents(conn, &project.id)?;
        project.tasks = load_tasks(conn, &project.id)?;
        project.releases = load_releases(conn, &project.id)?;
        project.receipts = load_receipts(conn, &project.id)?;
        project.activity = load_activity(conn, &project.id)?;
        projects.push(project);
    }

    Ok(BoardData {
        workspace,
        boards: board_definitions(),
        project_dbs: project_db_definitions(),
        projects,
        tag_definitions: load_tag_definitions(conn)?,
    })
}

fn get_workspace(conn: &Connection) -> AppResult<Workspace> {
    let workspace = conn
        .query_row(
            "SELECT id, name, root_path, storage_used_gb FROM workspaces WHERE id = 'aptlantis'",
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
        .optional()?;

    Ok(workspace.unwrap_or(Workspace {
        id: "aptlantis".into(),
        name: "Aptlantis Workspace".into(),
        root_path: "K:\\Aptlantis\\Workspace".into(),
        storage_used_gb: 121.3,
    }))
}

fn load_display_config(conn: &Connection, project_id: &str) -> AppResult<CardDisplayConfig> {
    let row = conn
        .query_row(
            "SELECT card_type, visible_fields FROM project_card_config WHERE project_id = ?1",
            params![project_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()?;

    let (card_type, visible_fields_json) = row.unwrap_or_else(|| {
        (
            "project".into(),
            serde_json::to_string(&visible_fields_for_card_type("project")).unwrap_or_else(|_| "[]".into()),
        )
    });
    let visible_fields = serde_json::from_str::<Vec<String>>(&visible_fields_json).unwrap_or_else(|_| {
        visible_fields_for_card_type(&card_type)
            .into_iter()
            .map(str::to_string)
            .collect()
    });

    Ok(CardDisplayConfig {
        card_type,
        visible_fields,
    })
}

fn load_custom_fields(conn: &Connection, project_id: &str) -> AppResult<Vec<CustomField>> {
    let mut stmt = conn.prepare(
        "
        SELECT id, project_id, label, value, field_type, show_on_card, position
        FROM project_custom_fields
        WHERE project_id = ?1
        ORDER BY position, label
        ",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(CustomField {
            id: row.get(0)?,
            project_id: row.get(1)?,
            label: row.get(2)?,
            value: row.get(3)?,
            field_type: row.get(4)?,
            show_on_card: row.get::<_, i64>(5)? == 1,
            position: row.get(6)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn load_requirements(conn: &Connection, project_id: &str) -> AppResult<Vec<Requirement>> {
    let mut stmt = conn.prepare(
        "
        SELECT id, project_id, title, status, severity, blocking, source, evidence_path, notes, updated_at
        FROM project_requirements
        WHERE project_id = ?1
        ORDER BY blocking DESC, severity DESC, title
        ",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(Requirement {
            id: row.get(0)?,
            project_id: row.get(1)?,
            title: row.get(2)?,
            status: row.get(3)?,
            severity: row.get(4)?,
            blocking: row.get::<_, i64>(5)? == 1,
            source: row.get(6)?,
            evidence_path: row.get(7)?,
            notes: row.get(8)?,
            updated_at: row.get(9)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn load_tag_definitions(conn: &Connection) -> AppResult<Vec<TagDefinition>> {
    let mut stmt = conn.prepare("SELECT tag, color, description FROM tag_definitions ORDER BY tag")?;
    let rows = stmt.query_map([], |row| {
        Ok(TagDefinition {
            tag: row.get(0)?,
            color: row.get(1)?,
            description: row.get(2)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn load_documents(conn: &Connection, project_id: &str) -> AppResult<Vec<ProjectDocument>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, kind, title, path, updated_at, exists_flag FROM project_documents WHERE project_id = ?1 ORDER BY kind",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(ProjectDocument {
            id: row.get(0)?,
            project_id: row.get(1)?,
            kind: row.get(2)?,
            title: row.get(3)?,
            path: row.get(4)?,
            updated_at: row.get(5)?,
            exists: row.get::<_, i64>(6)? == 1,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn load_tasks(conn: &Connection, project_id: &str) -> AppResult<Vec<ProjectTask>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, completed, source, position, due_date FROM project_tasks WHERE project_id = ?1 ORDER BY position",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(ProjectTask {
            id: row.get(0)?,
            project_id: row.get(1)?,
            title: row.get(2)?,
            completed: row.get::<_, i64>(3)? == 1,
            source: row.get(4)?,
            position: row.get(5)?,
            due_date: row.get(6)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn load_releases(conn: &Connection, project_id: &str) -> AppResult<Vec<ProjectRelease>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, version, status, target_date, readiness, notes FROM project_releases WHERE project_id = ?1 ORDER BY target_date DESC",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(ProjectRelease {
            id: row.get(0)?,
            project_id: row.get(1)?,
            version: row.get(2)?,
            status: row.get(3)?,
            target_date: row.get(4)?,
            readiness: row.get(5)?,
            notes: row.get(6)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn load_receipts(conn: &Connection, project_id: &str) -> AppResult<Vec<ReleaseReceipt>> {
    let mut stmt = conn.prepare(
        "
        SELECT receipt_json
        FROM release_receipt_events
        WHERE project_id = ?1
        ORDER BY generated_at DESC
        LIMIT 12
        ",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        let receipt_json: String = row.get(0)?;
        let receipt = serde_json::from_str::<ReleaseReceipt>(&receipt_json).unwrap_or_else(|_| empty_receipt(project_id));
        Ok(receipt)
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn save_release_receipt(conn: &Connection, receipt: &ReleaseReceipt) -> AppResult<()> {
    conn.execute(
        "
        INSERT INTO release_receipt_events
        (receipt_id, project_id, release_id, profile_id, profile_version, status, freshness, readiness_score, generated_at, generator_version, input_fingerprint, receipt_json, markdown_text)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
        ",
        params![
            &receipt.id,
            &receipt.project_id,
            &receipt.release_id,
            &receipt.profile,
            &receipt.profile_version,
            &receipt.status,
            &receipt.freshness,
            receipt.readiness,
            &receipt.generated_at,
            &receipt.generator_version,
            &receipt.input_fingerprint,
            serde_json::to_string(receipt).unwrap_or_else(|_| "{}".into()),
            &receipt.markdown
        ],
    )?;
    Ok(())
}

fn empty_receipt(project_id: &str) -> ReleaseReceipt {
    ReleaseReceipt {
        id: format!("{project_id}-invalid-receipt"),
        project_id: project_id.into(),
        release_id: String::new(),
        project_name: String::new(),
        release_version: String::new(),
        profile: "generic".into(),
        profile_version: "unknown".into(),
        status: "indeterminate".into(),
        freshness: "stale".into(),
        readiness: 0,
        counts: ReleaseReceiptCounts {
            pass: 0,
            warn: 0,
            fail: 0,
            unavailable: 1,
            not_applicable: 0,
            blocking: 0,
            missing_evidence: 0,
        },
        blockers: Vec::new(),
        evidence_refs: Vec::new(),
        missing_evidence: Vec::new(),
        filesystem_reachable: false,
        validator_runs: Vec::new(),
        generated_at: String::new(),
        generator_version: "unknown".into(),
        input_fingerprint: String::new(),
        summary: "Stored receipt could not be read.".into(),
        markdown: String::new(),
        items: Vec::new(),
    }
}

fn build_release_receipt(project: &Project, release: &ProjectRelease, generated_at: String) -> AppResult<ReleaseReceipt> {
    let profile = readiness_profile(project);
    let mut items = base_receipt_items(project, release);
    items.extend(profile_receipt_items(project, &profile));
    if profile == "drs" {
        items.extend(run_drs_receipt_items(project));
    }
    for item in &mut items {
        item.checked_at = generated_at.clone();
    }

    let status = receipt_status(&items);
    let counts = receipt_counts(&items);
    let blockers = items
        .iter()
        .filter(|item| item.severity == "blocking" && item.status == "fail")
        .map(|item| item.label.clone())
        .collect::<Vec<_>>();
    let evidence_refs = items
        .iter()
        .flat_map(|item| item.evidence_refs.clone())
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    let missing_evidence = items
        .iter()
        .filter(|item| matches!(item.status.as_str(), "fail" | "warn") && item.evidence_refs.is_empty())
        .map(|item| item.label.clone())
        .collect::<Vec<_>>();
    let filesystem_reachable = !items
        .iter()
        .any(|item| item.category == "filesystem" && item.status == "unavailable");
    let validator_runs = items
        .iter()
        .filter(|item| item.category == "standard-validator")
        .map(|item| format!("{}: {}", item.source, item.status))
        .collect::<Vec<_>>();
    let summary = match status.as_str() {
        "ready" => "Ready evidence is complete for the selected profile.",
        "ready_with_warnings" => "Release has supporting evidence, but some receipt items still need attention.",
        "indeterminate" => "Release evidence is partially unavailable, so the release posture cannot be finalized.",
        _ => "Release is blocked by missing or failed evidence.",
    }
    .to_string();
    let input_fingerprint = receipt_fingerprint(project, release, &items);
    let freshness = if filesystem_reachable {
        "fresh"
    } else {
        "partially_unavailable"
    }
    .to_string();

    let mut receipt = ReleaseReceipt {
        id: format!("{}-{}-{}-receipt", project.id, release.id, uuid::Uuid::new_v4()),
        project_id: project.id.clone(),
        release_id: release.id.clone(),
        project_name: project.name.clone(),
        release_version: release.version.clone(),
        profile,
        profile_version: "2026.08.06".into(),
        status,
        freshness,
        readiness: release.readiness,
        counts,
        blockers,
        evidence_refs,
        missing_evidence,
        filesystem_reachable,
        validator_runs,
        generated_at,
        generator_version: "aptlantis-ops-receipts-v0.2".into(),
        input_fingerprint,
        summary,
        markdown: String::new(),
        items,
    };
    receipt.markdown = receipt_markdown(project, release, &receipt);
    Ok(receipt)
}

fn base_receipt_items(project: &Project, release: &ProjectRelease) -> Vec<ReleaseReceiptItem> {
    let mut items = Vec::new();
    items.push(receipt_item(
        project,
        "release",
        "pass",
        "Release record",
        &format!("{} is tracked as {}.", release.version, release.status),
        "board",
        None,
    ));

    let root = PathBuf::from(&project.root_path);
    if project.db_id == "holding" || project.availability == "unreachable" {
        items.push(receipt_item(
            project,
            "folder",
            "unavailable",
            "Project folder",
            "Project is retained but filesystem checks are unavailable.",
            "workspace",
            Some(project.root_path.clone()),
        ));
    } else if root.exists() {
        items.push(receipt_item(
            project,
            "folder",
            "pass",
            "Project folder",
            "Project folder is reachable for evidence checks.",
            "workspace",
            Some(project.root_path.clone()),
        ));
    } else {
        items.push(receipt_item(
            project,
            "folder",
            "unavailable",
            "Project folder",
            "Project folder is not reachable; card metadata was preserved.",
            "workspace",
            Some(project.root_path.clone()),
        ));
    }

    let blocking = project
        .requirements
        .iter()
        .filter(|requirement| requirement.blocking && !matches!(requirement.status.as_str(), "satisfied" | "waived"))
        .count();
    items.push(if blocking > 0 {
        receipt_item(
            project,
            "blockers",
            "fail",
            "Blocking requirements",
            &format!("{blocking} blocking requirement(s) remain open."),
            "requirements",
            None,
        )
    } else {
        receipt_item(
            project,
            "blockers",
            "pass",
            "Blocking requirements",
            "No open blocking requirements.",
            "requirements",
            None,
        )
    });

    let satisfied = project
        .requirements
        .iter()
        .filter(|requirement| matches!(requirement.status.as_str(), "satisfied" | "waived"))
        .count();
    items.push(if satisfied > 0 {
        receipt_item(
            project,
            "requirements",
            "pass",
            "Requirement evidence",
            &format!("{satisfied} requirement(s) are satisfied or waived."),
            "requirements",
            None,
        )
    } else {
        receipt_item(
            project,
            "requirements",
            "warn",
            "Requirement evidence",
            "No satisfied requirements are recorded yet.",
            "requirements",
            None,
        )
    });

    let evidence = project
        .documents
        .iter()
        .filter(|document| document.kind == "evidence" && document.exists)
        .collect::<Vec<_>>();
    items.push(if let Some(document) = evidence.first() {
        receipt_item(
            project,
            "evidence",
            "pass",
            "Evidence documents",
            &format!("{} evidence record(s) are linked.", evidence.len()),
            "evidence",
            Some(document.path.clone()),
        )
    } else {
        receipt_item(
            project,
            "evidence",
            "warn",
            "Evidence documents",
            "No linked release evidence document is marked present.",
            "evidence",
            None,
        )
    });

    let completed_tasks = project.tasks.iter().filter(|task| task.completed).count();
    items.push(if !project.tasks.is_empty() && completed_tasks == project.tasks.len() {
        receipt_item(project, "tasks", "pass", "Checklist", "All card checklist items are complete.", "tasks", None)
    } else {
        receipt_item(
            project,
            "tasks",
            "warn",
            "Checklist",
            &format!("{completed_tasks}/{} checklist items complete.", project.tasks.len()),
            "tasks",
            None,
        )
    });

    items
}

fn profile_receipt_items(project: &Project, profile: &str) -> Vec<ReleaseReceiptItem> {
    match profile {
        "drs" => vec![
            receipt_item(
                project,
                "drs-manifest",
                if has_document(project, "manifest") { "pass" } else { "fail" },
                "DRS manifest",
                if has_document(project, "manifest") {
                    "Manifest document is linked."
                } else {
                    "Project manifest is missing."
                },
                "DRS",
                None,
            ),
            receipt_item(
                project,
                "drs-note",
                if has_document(project, "release") || has_document(project, "changelog") {
                    "pass"
                } else {
                    "warn"
                },
                "DRS release note",
                if has_document(project, "release") || has_document(project, "changelog") {
                    "Release documentation is linked."
                } else {
                    "Release note or checklist is not linked yet."
                },
                "DRS",
                None,
            ),
        ],
        "cts" => vec![
            receipt_item(
                project,
                "cts-contract",
                if has_document(project, "contract") || has_document(project, "readme") {
                    "pass"
                } else {
                    "warn"
                },
                "CTS command contract",
                "Command contract, help/version output, and automation evidence should be linked before release.",
                "CTS",
                None,
            ),
            receipt_item(project, "cts-output", "not_applicable", "CTS automation surface", "No CTS executable adapter is registered yet.", "CTS", None),
        ],
        "wds" => vec![
            receipt_item(
                project,
                "wds-deploy",
                if has_document(project, "deploy") || has_document(project, "evidence") {
                    "pass"
                } else {
                    "warn"
                },
                "WDS deployment record",
                "Deployment, route, accessibility, metadata, and rollback evidence should be linked for publication.",
                "WDS",
                None,
            ),
            receipt_item(project, "wds-routes", "warn", "WDS route checks", "Key route and accessibility checks need explicit evidence.", "WDS", None),
        ],
        _ => vec![receipt_item(
            project,
            "generic",
            if project.documents.iter().any(|document| document.kind == "evidence" && document.exists) {
                "pass"
            } else {
                "warn"
            },
            "Generic release evidence",
            "Generic readiness uses release record, requirements, checklist state, and linked evidence.",
            "board",
            None,
        )],
    }
}

fn run_drs_receipt_items(project: &Project) -> Vec<ReleaseReceiptItem> {
    let drs_path = PathBuf::from(r"D:\.library\aptlantis_core\DRS\drs.ps1");
    let root = PathBuf::from(&project.root_path);
    if !drs_path.exists() {
        return vec![receipt_item(project, "drs-tool", "unavailable", "DRS validator", "DRS helper was not found.", "DRS", None)];
    }
    if project.db_id == "holding" || project.availability == "unreachable" || !root.exists() {
        return vec![receipt_item(
            project,
            "drs-tool",
            "unavailable",
            "DRS validator",
            "DRS helper was skipped because the project folder is unavailable.",
            "DRS",
            Some(project.root_path.clone()),
        )];
    }

    let output = Command::new("pwsh")
        .arg("-NoProfile")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-File")
        .arg(&drs_path)
        .arg("check-release")
        .current_dir(&root)
        .output();

    let output = match output {
        Ok(output) => output,
        Err(error) => {
            return vec![receipt_item(
                project,
                "drs-tool",
                "unavailable",
                "DRS validator",
                &format!("DRS helper could not run: {error}"),
                "DRS",
                Some(drs_path.to_string_lossy().to_string()),
            )]
        }
    };
    let text = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let mut items = text
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            let (status, marker) = if trimmed.contains("[PASS]") {
                ("pass", "[PASS]")
            } else if trimmed.contains("[FAIL]") {
                ("fail", "[FAIL]")
            } else if trimmed.contains("[WARN]") {
                ("warn", "[WARN]")
            } else {
                return None;
            };
            let label = trimmed.split(marker).nth(1).unwrap_or(trimmed).trim();
            Some(receipt_item(project, &format!("drs-{}", slugify(label)), status, label, "Reported by DRS check-release.", "DRS", None))
        })
        .collect::<Vec<_>>();

    if items.is_empty() {
        items.push(receipt_item(
            project,
            "drs-tool",
            if output.status.success() { "info" } else { "warn" },
            "DRS validator",
            "DRS helper ran but did not emit pass/warn/fail rows.",
            "DRS",
            Some(drs_path.to_string_lossy().to_string()),
        ));
    }
    items
}

fn readiness_profile(project: &Project) -> String {
    let terms = format!(
        "{} {} {} {}",
        project.card_type,
        project.category,
        project.tags.join(" "),
        project.stack.join(" ")
    )
    .to_lowercase();
    if terms.contains("website") || terms.contains("docs") {
        "wds".into()
    } else if terms.contains("cli") || terms.contains("command") {
        "cts".into()
    } else if terms.contains("wpf") || terms.contains("tauri") || terms.contains("desktop") {
        "drs".into()
    } else {
        "generic".into()
    }
}

fn has_document(project: &Project, needle: &str) -> bool {
    project.documents.iter().any(|document| {
        document.exists
            && format!("{} {} {}", document.kind, document.title, document.path)
                .to_lowercase()
                .contains(needle)
    })
}

fn receipt_item(
    project: &Project,
    suffix: &str,
    status: &str,
    label: &str,
    detail: &str,
    source: &str,
    evidence_path: Option<String>,
) -> ReleaseReceiptItem {
    let category = receipt_category(suffix);
    let severity = receipt_severity(suffix, status);
    let evidence_refs = evidence_path.clone().into_iter().collect::<Vec<_>>();
    ReleaseReceiptItem {
        id: format!("{}-receipt-{suffix}", project.id),
        key: suffix.into(),
        title: label.into(),
        category: category.into(),
        status: status.into(),
        severity: severity.into(),
        label: label.into(),
        detail: detail.into(),
        message: detail.into(),
        rationale: None,
        source: source.into(),
        source_type: receipt_source_type(source).into(),
        source_ref: evidence_path.clone().or_else(|| Some(source.into())),
        evidence_refs,
        checked_at: chrono_like_now(),
        evidence_path,
    }
}

fn receipt_status(items: &[ReleaseReceiptItem]) -> String {
    if items
        .iter()
        .any(|item| item.severity == "blocking" && item.status == "fail")
    {
        "not_ready".into()
    } else if items
        .iter()
        .any(|item| item.severity == "required" && item.status == "unavailable")
    {
        "indeterminate".into()
    } else if items.iter().any(|item| item.status == "fail") {
        "not_ready".into()
    } else if items.iter().any(|item| item.status == "unavailable") {
        "indeterminate".into()
    } else if items.iter().any(|item| item.status == "warn") {
        "ready_with_warnings".into()
    } else {
        "ready".into()
    }
}

fn receipt_counts(items: &[ReleaseReceiptItem]) -> ReleaseReceiptCounts {
    ReleaseReceiptCounts {
        pass: items.iter().filter(|item| item.status == "pass").count(),
        warn: items.iter().filter(|item| item.status == "warn").count(),
        fail: items.iter().filter(|item| item.status == "fail").count(),
        unavailable: items.iter().filter(|item| item.status == "unavailable").count(),
        not_applicable: items.iter().filter(|item| item.status == "not_applicable").count(),
        blocking: items
            .iter()
            .filter(|item| item.severity == "blocking" && item.status == "fail")
            .count(),
        missing_evidence: items
            .iter()
            .filter(|item| matches!(item.status.as_str(), "fail" | "warn") && item.evidence_refs.is_empty())
            .count(),
    }
}

fn receipt_fingerprint(project: &Project, release: &ProjectRelease, items: &[ReleaseReceiptItem]) -> String {
    let mut hasher = DefaultHasher::new();
    project.id.hash(&mut hasher);
    project.updated_at.hash(&mut hasher);
    release.id.hash(&mut hasher);
    release.version.hash(&mut hasher);
    release.readiness.hash(&mut hasher);
    for requirement in &project.requirements {
        requirement.id.hash(&mut hasher);
        requirement.status.hash(&mut hasher);
        requirement.blocking.hash(&mut hasher);
        requirement.updated_at.hash(&mut hasher);
    }
    for task in &project.tasks {
        task.id.hash(&mut hasher);
        task.completed.hash(&mut hasher);
    }
    for document in &project.documents {
        document.id.hash(&mut hasher);
        document.exists.hash(&mut hasher);
        document.updated_at.hash(&mut hasher);
    }
    for item in items {
        item.key.hash(&mut hasher);
        item.status.hash(&mut hasher);
        item.severity.hash(&mut hasher);
    }
    format!("{:016x}", hasher.finish())
}

fn receipt_category(suffix: &str) -> &'static str {
    if suffix.contains("manifest") {
        "manifest"
    } else if suffix.contains("release") {
        "version"
    } else if suffix.contains("blocker") || suffix.contains("requirement") {
        "requirements"
    } else if suffix.contains("task") {
        "tasks"
    } else if suffix.contains("evidence") || suffix.contains("routes") {
        "evidence"
    } else if suffix.contains("folder") {
        "filesystem"
    } else if suffix.contains("drs") || suffix.contains("cts") || suffix.contains("wds") {
        "standard-validator"
    } else {
        "documentation"
    }
}

fn receipt_severity(suffix: &str, status: &str) -> &'static str {
    if suffix.contains("blocker") || suffix == "drs-manifest" || status == "fail" {
        "blocking"
    } else if suffix.contains("release") || suffix.contains("folder") || suffix.contains("requirement") || suffix.contains("evidence") {
        "required"
    } else if status == "info" || status == "not_applicable" {
        "info"
    } else {
        "recommended"
    }
}

fn receipt_source_type(source: &str) -> &'static str {
    match source {
        "workspace" => "filesystem",
        "requirements" => "requirement",
        "DRS" | "CTS" | "WDS" => "validator",
        "board" | "tasks" | "evidence" => "sqlite",
        _ => "derived",
    }
}

fn chrono_like_now() -> String {
    "generated".into()
}

fn receipt_markdown(project: &Project, release: &ProjectRelease, receipt: &ReleaseReceipt) -> String {
    let mut lines = vec![
        format!("# Release Receipt - {} {}", project.name, release.version),
        String::new(),
        format!("- Project: {}", project.name),
        format!("- Release: {} - {}", release.version, release.status),
        format!("- Profile: {}", receipt.profile.to_uppercase()),
        format!("- Profile version: {}", receipt.profile_version),
        format!("- Receipt status: {}", receipt.status.replace('_', " ")),
        format!("- Readiness score: {}%", receipt.readiness),
        format!("- Freshness: {}", receipt.freshness.replace('_', " ")),
        format!("- Generated: {}", receipt.generated_at),
        format!("- Generator: {}", receipt.generator_version),
        format!("- Fingerprint: {}", receipt.input_fingerprint),
        String::new(),
        "## Decision Summary".into(),
        String::new(),
        receipt.summary.clone(),
        String::new(),
    ];
    for (title, group) in [
        (
            "Blocking",
            receipt
                .items
                .iter()
                .filter(|item| item.severity == "blocking" && matches!(item.status.as_str(), "fail" | "unavailable"))
                .collect::<Vec<_>>(),
        ),
        (
            "Required Checks",
            receipt
                .items
                .iter()
                .filter(|item| item.severity == "required" && !matches!(item.status.as_str(), "fail" | "unavailable"))
                .collect::<Vec<_>>(),
        ),
        (
            "Warnings",
            receipt.items.iter().filter(|item| item.status == "warn").collect::<Vec<_>>(),
        ),
        (
            "Unavailable",
            receipt
                .items
                .iter()
                .filter(|item| item.status == "unavailable")
                .collect::<Vec<_>>(),
        ),
        (
            "Evidence",
            receipt
                .items
                .iter()
                .filter(|item| !item.evidence_refs.is_empty())
                .collect::<Vec<_>>(),
        ),
        (
            "Informational",
            receipt
                .items
                .iter()
                .filter(|item| matches!(item.status.as_str(), "info" | "not_applicable"))
                .collect::<Vec<_>>(),
        ),
    ] {
        if group.is_empty() {
            continue;
        }
        lines.push(format!("## {title}"));
        lines.push(String::new());
        for item in group {
            let marker = match item.status.as_str() {
                "pass" => "PASS",
                "fail" => "FAIL",
                "warn" => "WARN",
                "unavailable" => "UNAVAILABLE",
                "not_applicable" => "N/A",
                _ => "INFO",
            };
            let suffix = item
                .evidence_path
                .as_ref()
                .map(|path| format!(" ({path})"))
                .unwrap_or_default();
            lines.push(format!("- [{marker}] {}: {}{}", item.label, item.detail, suffix));
        }
        lines.push(String::new());
    }
    lines.join("\n")
}

fn load_activity(conn: &Connection, project_id: &str) -> AppResult<Vec<ActivityEvent>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, message, created_at FROM activity_events WHERE project_id = ?1 ORDER BY created_at DESC LIMIT 10",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(ActivityEvent {
            id: row.get(0)?,
            project_id: row.get(1)?,
            message: row.get(2)?,
            created_at: row.get(3)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
}

fn scan_root_into_db(conn: &Connection, root: PathBuf) -> AppResult<()> {
    if !root.exists() {
        return Ok(());
    }

    conn.execute(
        "INSERT OR REPLACE INTO workspaces (id, name, root_path, storage_used_gb) VALUES (?1, ?2, ?3, ?4)",
        params!["aptlantis", "Aptlantis Workspace", root.to_string_lossy(), 0.0],
    )?;

    for entry in WalkDir::new(&root).max_depth(3).into_iter().filter_map(Result::ok) {
        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        let file_name = path.file_name().and_then(|name| name.to_str()).unwrap_or_default();
        if !(file_name.ends_with(".manifest.toml") || file_name == "project.toml") {
            continue;
        }

        let content = fs::read_to_string(path).unwrap_or_default();
        let manifest = toml::from_str::<Manifest>(&content).ok();
        let project_section = manifest.and_then(|item| item.project);
        let name = project_section
            .as_ref()
            .and_then(|project| project.name.clone())
            .or_else(|| path.parent().and_then(|parent| parent.file_name()).map(|name| name.to_string_lossy().to_string()))
            .unwrap_or_else(|| "Imported Project".into());
        let id = project_section
            .as_ref()
            .and_then(|project| project.id.clone())
            .unwrap_or_else(|| slugify(&name));
        let tags = project_section
            .as_ref()
            .and_then(|project| project.tags.clone())
            .unwrap_or_else(|| vec!["Imported".into()]);
        let stack = project_section
            .as_ref()
            .and_then(|project| project.stack.clone())
            .unwrap_or_else(|| tags.clone());

        conn.execute(
            "
            INSERT OR REPLACE INTO projects
            (id, board_id, db_id, availability, name, description, status, priority, category, stack, tags, root_path, created_at, updated_at, card_order, owner, accent, blocked_reason)
            VALUES (?1, 'secondary', 'holding', 'available', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'), datetime('now'), ?10, 'aptlantis', 'cyan', NULL)
            ",
            params![
                id,
                name,
                project_section
                    .as_ref()
                    .and_then(|project| project.description.clone())
                    .unwrap_or_else(|| "Imported from local project manifest.".into()),
                project_section
                    .as_ref()
                    .and_then(|project| project.status.clone())
                    .unwrap_or_else(|| "backlog".into()),
                project_section
                    .as_ref()
                    .and_then(|project| project.priority.clone())
                    .unwrap_or_else(|| "P3".into()),
                project_section
                    .as_ref()
                    .and_then(|project| project.category.clone())
                    .unwrap_or_else(|| "Imported".into()),
                serde_json::to_string(&stack).unwrap_or_else(|_| "[]".into()),
                serde_json::to_string(&tags).unwrap_or_else(|_| "[]".into()),
                path.parent().unwrap_or(&root).to_string_lossy(),
                99
            ],
        )?;

        let tag_refs = tags.iter().map(String::as_str).collect::<Vec<_>>();
        let card_type = card_type_for_tags(&tag_refs);
        conn.execute(
            "INSERT OR IGNORE INTO project_card_config (project_id, card_type, visible_fields) VALUES (?1, ?2, ?3)",
            params![
                id,
                card_type,
                serde_json::to_string(&visible_fields_for_card_type(card_type)).unwrap_or_else(|_| "[]".into())
            ],
        )?;
        for tag in tags {
            conn.execute(
                "INSERT OR IGNORE INTO tag_definitions (tag, color, description) VALUES (?1, '#8b5cf6', NULL)",
                params![tag],
            )?;
        }
    }

    Ok(())
}

fn parse_json_vec(value: String) -> Vec<String> {
    serde_json::from_str(&value).unwrap_or_default()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_manifest_project_section() {
        let manifest = toml::from_str::<Manifest>(
            r#"
            [project]
            id = "disk-planner"
            name = "Disk Planner"
            status = "planned"
            priority = "P2"
            tags = ["Tooling", "UI"]
            "#,
        )
        .expect("manifest should parse");

        let project = manifest.project.expect("project section");
        assert_eq!(project.id.as_deref(), Some("disk-planner"));
        assert_eq!(project.tags.unwrap(), vec!["Tooling", "UI"]);
    }

    #[test]
    fn slugifies_project_names() {
        assert_eq!(slugify("Disk Planner"), "disk-planner");
        assert_eq!(slugify("AptConsole v1.1.0"), "aptconsole-v1-1-0");
    }

    fn test_project(tags: Vec<String>, db_id: &str, availability: &str) -> Project {
        Project {
            id: "test-project".into(),
            board_id: "primary".into(),
            db_id: db_id.into(),
            availability: availability.into(),
            name: "Test Project".into(),
            description: "Test project".into(),
            card_type: "project".into(),
            display_config: CardDisplayConfig {
                card_type: "project".into(),
                visible_fields: vec![],
            },
            status: "review".into(),
            priority: "P2".into(),
            category: tags.first().cloned().unwrap_or_else(|| "Tooling".into()),
            stack: tags.clone(),
            tags,
            root_path: "Z:\\missing\\test-project".into(),
            created_at: "2026-08-06T00:00:00".into(),
            updated_at: "2026-08-06T00:00:00".into(),
            card_order: 1,
            owner: "aptlantis".into(),
            accent: "cyan".into(),
            blocked_reason: None,
            custom_fields: vec![],
            requirements: vec![Requirement {
                id: "req".into(),
                project_id: "test-project".into(),
                title: "Project manifest is current".into(),
                status: "satisfied".into(),
                severity: "medium".into(),
                blocking: false,
                source: "project manifest".into(),
                evidence_path: Some("project/test.manifest.toml".into()),
                notes: None,
                updated_at: "2026-08-06T00:00:00".into(),
            }],
            documents: vec![
                ProjectDocument {
                    id: "manifest".into(),
                    project_id: "test-project".into(),
                    kind: "manifest".into(),
                    title: "TestProject.manifest.toml".into(),
                    path: "project/test-project.manifest.toml".into(),
                    updated_at: "2026-08-06".into(),
                    exists: true,
                },
                ProjectDocument {
                    id: "doc".into(),
                    project_id: "test-project".into(),
                    kind: "evidence".into(),
                    title: "Release Evidence".into(),
                    path: "evidence/release".into(),
                    updated_at: "2026-08-06".into(),
                    exists: true,
                },
            ],
            tasks: vec![ProjectTask {
                id: "task".into(),
                project_id: "test-project".into(),
                title: "Package release notes".into(),
                completed: true,
                source: "project/tasks.toml".into(),
                position: 1,
                due_date: None,
            }],
            releases: vec![],
            receipts: vec![],
            activity: vec![],
        }
    }

    fn test_release() -> ProjectRelease {
        ProjectRelease {
            id: "test-release".into(),
            project_id: "test-project".into(),
            version: "v0.9.0".into(),
            status: "Target".into(),
            target_date: "2026-08-30".into(),
            readiness: 72,
            notes: "Test release".into(),
        }
    }

    #[test]
    fn selects_release_readiness_profiles_from_tags() {
        assert_eq!(readiness_profile(&test_project(vec!["WPF".into()], "active", "available")), "drs");
        assert_eq!(readiness_profile(&test_project(vec!["CLI".into()], "active", "available")), "cts");
        assert_eq!(readiness_profile(&test_project(vec!["Website".into()], "active", "available")), "wds");
        assert_eq!(readiness_profile(&test_project(vec!["Tooling".into()], "active", "available")), "generic");
    }

    #[test]
    fn held_project_receipt_warns_about_unavailable_folder() {
        let project = test_project(vec!["WPF".into()], "holding", "unreachable");
        let receipt = build_release_receipt(&project, &test_release(), "2026-08-06 12:00:00".into()).expect("receipt should build");
        assert!(receipt
            .items
            .iter()
            .any(|item| item.label == "Project folder" && item.status == "unavailable"));
        assert_eq!(receipt.status, "indeterminate");
    }
}
