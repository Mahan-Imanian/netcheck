use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use netcheck_core::check::{self, CheckEvent, CheckInputs, Emit, INTERNET_BASELINE};
use netcheck_core::firewall::{self, FirewallError};
use netcheck_core::icmp::{self, Echo, SharedProber, SystemProber, DEFAULT_TTL};
use netcheck_core::netinfo;
use netcheck_core::sdr::{SdrClient, SdrError};
use netcheck_core::settings::Settings;
use netcheck_core::store::{HistoryCell, Store, StoreError};
use netcheck_core::update::{self, InstallKind, UpdateClient, UpdateError, UpdateInfo};
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, RunEvent, State, WindowEvent};
use tauri_plugin_opener::OpenerExt;
use tokio_util::sync::CancellationToken;

const CS2_URL: &str = "steam://rungameid/730";
const FRESH_CACHE_MS: i64 = 12 * 60 * 60 * 1000;

#[derive(Debug, thiserror::Error)]
enum AppError {
    #[error(transparent)]
    Store(#[from] StoreError),
    #[error(transparent)]
    Sdr(#[from] SdrError),
    #[error("could not open Steam: {0}")]
    Launch(String),
    #[error("could not prepare app data folder: {0}")]
    Setup(String),
    #[error(transparent)]
    Update(#[from] UpdateError),
    #[error("could not start the installer: {0}")]
    Install(String),
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

struct AppState {
    store: Arc<Store>,
    sdr: Arc<SdrClient>,
    prober: SharedProber,
    root: CancellationToken,
    current: Mutex<Option<CancellationToken>>,
    updates: Arc<UpdateClient>,
    pending: Mutex<Option<UpdateInfo>>,
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as i64)
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> Result<Settings, AppError> {
    Ok(state.store.load_settings()?)
}

#[tauri::command]
fn save_settings(state: State<'_, AppState>, settings: Settings) -> Result<Settings, AppError> {
    let clean = settings.sanitized();
    state.store.save_settings(&clean)?;
    Ok(clean)
}

#[tauri::command]
fn history(state: State<'_, AppState>, code: String, days: i64) -> Result<Vec<HistoryCell>, AppError> {
    Ok(state.store.history(&code, days.clamp(1, 30), now_ms())?)
}

#[tauri::command]
fn cancel_check(state: State<'_, AppState>) {
    if let Ok(mut current) = state.current.lock() {
        if let Some(token) = current.take() {
            token.cancel();
        }
    }
}

async fn looks_offline(prober: &SharedProber) -> bool {
    let gateway = tokio::task::spawn_blocking(netinfo::default_gateway).await.ok().flatten();
    let target = gateway.unwrap_or(INTERNET_BASELINE);
    !matches!(icmp::echo(prober, target, DEFAULT_TTL, Duration::from_millis(800)).await, Ok(Echo::Reply { .. }))
}

#[tauri::command]
async fn run_check(state: State<'_, AppState>, on_event: Channel<CheckEvent>) -> Result<(), AppError> {
    let token = state.root.child_token();
    if let Ok(mut current) = state.current.lock() {
        if let Some(previous) = current.replace(token.clone()) {
            previous.cancel();
        }
    }

    let channel = on_event.clone();
    let emit: Emit = Arc::new(move |event| {
        let _ = channel.send(event);
    });

    let now = now_ms();
    let relays = match state.sdr.cached() {
        Some(list) if now - list.fetched_at_ms < FRESH_CACHE_MS => {
            let sdr = Arc::clone(&state.sdr);
            let emit = Arc::clone(&emit);
            let token = token.clone();
            tauri::async_runtime::spawn(async move {
                tokio::select! {
                    _ = token.cancelled() => {}
                    result = sdr.refresh(now_ms()) => emit(match result {
                        Ok(list) => CheckEvent::RelayRefresh { ok: true, error: None, fetched_at_ms: list.fetched_at_ms },
                        Err(e) => CheckEvent::RelayRefresh { ok: false, error: Some(e.to_string()), fetched_at_ms: 0 },
                    }),
                }
            });
            list
        }
        _ => match state.sdr.load(now).await {
            Ok(list) => list,
            Err(e) => {
                let offline = looks_offline(&state.prober).await;
                emit(CheckEvent::Failed { message: e.to_string(), offline, has_cache: false });
                return Ok(());
            }
        },
    };

    let firewall = tokio::task::spawn_blocking(firewall::read).await.unwrap_or_else(|_| Err(FirewallError::Com("reader stopped".into())));
    let gateway = tokio::task::spawn_blocking(netinfo::default_gateway).await.ok().flatten();

    let inputs = CheckInputs {
        settings: state.store.load_settings()?,
        relays,
        firewall,
        gateway,
        hop_normals: state.store.hop_normals().unwrap_or_default(),
        region_normals: state.store.region_normals().unwrap_or_default(),
        now_ms,
    };

    match check::run(SharedProber::clone(&state.prober), inputs, Arc::clone(&emit), token.clone()).await {
        Ok(report) => {
            let check_id = if report.offline { None } else { state.store.save_check(&report).ok() };
            let _ = state.store.prune(now_ms());
            emit(CheckEvent::Finished { check_id, finished_at_ms: report.finished_at_ms, offline: report.offline });
        }
        Err(e) if token.is_cancelled() => drop(e),
        Err(e) => emit(CheckEvent::Failed { message: e.to_string(), offline: false, has_cache: true }),
    }
    Ok(())
}

#[tauri::command]
fn launch_cs2(app: AppHandle) -> Result<(), AppError> {
    app.opener().open_url(CS2_URL, None::<&str>).map_err(|e| AppError::Launch(e.to_string()))
}

fn this_install() -> InstallKind {
    let roots: Vec<PathBuf> =
        ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"].iter().filter_map(std::env::var_os).map(PathBuf::from).collect();
    std::env::current_exe().map_or(InstallKind::Portable, |exe| update::install_kind(&exe, &roots))
}

#[tauri::command]
async fn check_update(app: AppHandle, state: State<'_, AppState>) -> Result<Option<UpdateInfo>, AppError> {
    if !state.store.load_settings()?.check_updates {
        return Ok(None);
    }
    let current = app.package_info().version.to_string();
    let found = state.updates.check(&current, this_install()).await?;
    if let Ok(mut pending) = state.pending.lock() {
        pending.clone_from(&found);
    }
    Ok(found)
}

#[tauri::command]
async fn install_update(app: AppHandle, state: State<'_, AppState>, on_progress: Channel<(u64, u64)>) -> Result<(), AppError> {
    let installer = state.pending.lock().ok().and_then(|p| p.as_ref().and_then(|u| u.installer.clone())).ok_or(UpdateError::NoInstaller)?;
    let dir = std::env::temp_dir().join("netcheck-update");
    let path = state
        .updates
        .download(&installer, &dir, |done, total| {
            let _ = on_progress.send((done, total));
        })
        .await?;
    let child = if installer.name.ends_with(".msi") {
        Command::new("msiexec").arg("/i").arg(&path).arg("/passive").spawn()
    } else {
        Command::new(&path).args(["/P", "/R", "/UPDATE"]).spawn()
    };
    child.map_err(|e| AppError::Install(e.to_string()))?;
    shutdown(&app);
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn open_release_page(app: AppHandle, state: State<'_, AppState>) -> Result<(), AppError> {
    let url =
        state.pending.lock().ok().and_then(|p| p.as_ref().map(|u| u.page_url.clone())).unwrap_or_else(|| update::RELEASES_PAGE.to_string());
    app.opener().open_url(url, None::<&str>).map_err(|e| AppError::Launch(e.to_string()))
}

#[tauri::command]
fn quit(app: AppHandle) {
    shutdown(&app);
    app.exit(0);
}

/// Cancels every probe and flushes the history database. Idempotent; runs on
/// window close, on `quit`, and on process exit.
fn shutdown(app: &AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        state.root.cancel();
        let _ = state.store.close();
    }
}

fn setup_state(app: &AppHandle) -> Result<AppState, AppError> {
    let dir = app.path().app_data_dir().map_err(|e| AppError::Setup(e.to_string()))?;
    std::fs::create_dir_all(&dir).map_err(|e| AppError::Setup(e.to_string()))?;
    let store = Store::open(&dir.join("history.sqlite3"))?;
    let _ = store.prune(now_ms());
    Ok(AppState {
        store: Arc::new(store),
        sdr: Arc::new(SdrClient::new(&dir)?),
        prober: Arc::new(SystemProber),
        root: CancellationToken::new(),
        current: Mutex::new(None),
        updates: Arc::new(UpdateClient::new()?),
        pending: Mutex::new(None),
    })
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let state = setup_state(app.handle()).map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;
            app.manage(state);
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(4));
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.show();
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed) {
                shutdown(window.app_handle());
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            history,
            run_check,
            cancel_check,
            launch_cs2,
            check_update,
            install_update,
            open_release_page,
            quit
        ])
        .build(tauri::generate_context!());

    match app {
        Ok(app) => app.run(|handle, event| {
            if matches!(event, RunEvent::Exit) {
                shutdown(handle);
            }
        }),
        Err(e) => {
            eprintln!("Netcheck failed to start: {e}");
            std::process::exit(1);
        }
    }
}
