use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use ts_rs::TS;

pub const LATEST_RELEASE_URL: &str = "https://api.github.com/repos/Mahan-Imanian/netcheck/releases/latest";
pub const RELEASES_PAGE: &str = "https://github.com/Mahan-Imanian/netcheck/releases";
const DOWNLOAD_PREFIX: &str = "https://github.com/Mahan-Imanian/netcheck/releases/download/";

#[derive(Debug, thiserror::Error)]
pub enum UpdateError {
    #[error("GitHub could not be reached: {0}")]
    Http(#[from] reqwest::Error),
    #[error("GitHub answered with HTTP {0}")]
    Status(u16),
    #[error("the release information was not in the expected format: {0}")]
    Format(#[from] serde_json::Error),
    #[error("the download could not be saved: {0}")]
    Io(#[from] std::io::Error),
    #[error("the download doesn't match the release checksum")]
    Checksum,
    #[error("this release has no installer for this copy of Netcheck")]
    NoInstaller,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub enum InstallKind {
    Nsis,
    Msi,
    Portable,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Installer {
    pub name: String,
    pub url: String,
    #[ts(type = "number")]
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct UpdateInfo {
    pub version: String,
    pub current: String,
    pub notes: String,
    pub page_url: String,
    pub published_at: Option<String>,
    pub installer: Option<Installer>,
}

#[derive(Debug, Deserialize)]
struct RawAsset {
    name: String,
    browser_download_url: String,
    #[serde(default)]
    size: u64,
    digest: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawRelease {
    tag_name: String,
    #[serde(default)]
    body: Option<String>,
    html_url: String,
    published_at: Option<String>,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
    #[serde(default)]
    assets: Vec<RawAsset>,
}

pub fn parse_version(v: &str) -> Option<(u64, u64, u64)> {
    let core = v.trim().trim_start_matches('v').split(['-', '+']).next()?;
    let mut parts = core.split('.').map(|p| p.parse::<u64>().ok());
    let version = (parts.next()??, parts.next()??, parts.next()??);
    parts.next().is_none().then_some(version)
}

pub fn install_kind(exe: &Path, program_files: &[PathBuf]) -> InstallKind {
    let Some(dir) = exe.parent() else { return InstallKind::Portable };
    if dir.join("uninstall.exe").is_file() {
        InstallKind::Nsis
    } else if program_files.iter().any(|root| !root.as_os_str().is_empty() && dir.starts_with(root)) {
        InstallKind::Msi
    } else {
        InstallKind::Portable
    }
}

fn release_notes(body: &str) -> String {
    let mut out = Vec::new();
    for line in body.lines() {
        let text = line.trim_start();
        if text.starts_with('#') && text.trim_start_matches('#').trim_start().to_ascii_lowercase().starts_with("install") {
            break;
        }
        out.push(line.trim_end());
    }
    out.join("\n").trim().to_string()
}

pub fn parse_release(json: &str, current: &str, kind: InstallKind) -> Result<Option<UpdateInfo>, UpdateError> {
    let raw: RawRelease = serde_json::from_str(json)?;
    if raw.draft || raw.prerelease {
        return Ok(None);
    }
    let (Some(latest), Some(mine)) = (parse_version(&raw.tag_name), parse_version(current)) else {
        return Ok(None);
    };
    if latest <= mine {
        return Ok(None);
    }
    let suffix = match kind {
        InstallKind::Nsis => Some("_x64-setup.exe"),
        InstallKind::Msi => Some(".msi"),
        InstallKind::Portable => None,
    };
    let installer = suffix.and_then(|suffix| {
        raw.assets.iter().find(|a| a.name.ends_with(suffix) && a.browser_download_url.starts_with(DOWNLOAD_PREFIX)).and_then(|a| {
            let sha256 = a.digest.as_deref()?.strip_prefix("sha256:")?.to_ascii_lowercase();
            (sha256.len() == 64 && sha256.bytes().all(|b| b.is_ascii_hexdigit())).then(|| Installer {
                name: a.name.clone(),
                url: a.browser_download_url.clone(),
                size: a.size,
                sha256,
            })
        })
    });
    let version = format!("{}.{}.{}", latest.0, latest.1, latest.2);
    Ok(Some(UpdateInfo {
        version,
        current: current.to_string(),
        notes: release_notes(raw.body.as_deref().unwrap_or_default()),
        page_url: if raw.html_url.starts_with(RELEASES_PAGE) { raw.html_url } else { RELEASES_PAGE.to_string() },
        published_at: raw.published_at,
        installer,
    }))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub struct UpdateClient {
    url: String,
    downloads: String,
    http: reqwest::Client,
}

impl UpdateClient {
    pub fn new() -> Result<Self, UpdateError> {
        Self::with_urls(LATEST_RELEASE_URL, DOWNLOAD_PREFIX)
    }

    pub fn with_urls(url: &str, downloads: &str) -> Result<Self, UpdateError> {
        let http = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .user_agent(concat!("Netcheck/", env!("CARGO_PKG_VERSION")))
            .build()?;
        Ok(Self { url: url.to_string(), downloads: downloads.to_string(), http })
    }

    pub async fn check(&self, current: &str, kind: InstallKind) -> Result<Option<UpdateInfo>, UpdateError> {
        let resp = self.http.get(&self.url).header("Accept", "application/vnd.github+json").timeout(Duration::from_secs(8)).send().await?;
        if !resp.status().is_success() {
            return Err(UpdateError::Status(resp.status().as_u16()));
        }
        parse_release(&resp.text().await?, current, kind)
    }

    pub async fn download(&self, installer: &Installer, dir: &Path, mut progress: impl FnMut(u64, u64)) -> Result<PathBuf, UpdateError> {
        if !installer.url.starts_with(&self.downloads) || installer.name.contains(['/', '\\']) {
            return Err(UpdateError::NoInstaller);
        }
        std::fs::create_dir_all(dir)?;
        let path = dir.join(&installer.name);
        let partial = path.with_extension("part");
        let mut resp = self.http.get(&installer.url).timeout(Duration::from_secs(300)).send().await?;
        if !resp.status().is_success() {
            return Err(UpdateError::Status(resp.status().as_u16()));
        }
        let total = resp.content_length().unwrap_or(installer.size);
        let mut file = std::fs::File::create(&partial)?;
        let mut hasher = Sha256::new();
        let mut done = 0u64;
        while let Some(chunk) = resp.chunk().await? {
            std::io::Write::write_all(&mut file, &chunk)?;
            hasher.update(&chunk);
            done += chunk.len() as u64;
            progress(done, total);
        }
        file.sync_all()?;
        drop(file);
        if hex(&hasher.finalize()) != installer.sha256 {
            let _ = std::fs::remove_file(&partial);
            return Err(UpdateError::Checksum);
        }
        std::fs::rename(&partial, &path)?;
        Ok(path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DIGEST: &str = "a6a6b157451ad329935a6663ed0eb419a3115a1659830a2b59e9e922e9d32575";

    fn release(tag: &str) -> String {
        serde_json::json!({
            "tag_name": tag,
            "html_url": format!("https://github.com/Mahan-Imanian/netcheck/releases/tag/{tag}"),
            "published_at": "2026-11-04T19:02:13Z",
            "draft": false,
            "prerelease": false,
            "body": "## Added\n\n- Update check.\n\n## Install\n\nDownload the installer.",
            "assets": [
                {
                    "name": format!("Netcheck_{}_x64-setup.exe", tag.trim_start_matches('v')),
                    "browser_download_url": format!("https://github.com/Mahan-Imanian/netcheck/releases/download/{tag}/Netcheck_x64-setup.exe"),
                    "size": 4269297,
                    "digest": format!("sha256:{DIGEST}")
                },
                {
                    "name": format!("Netcheck_{}_x64_en-US.msi", tag.trim_start_matches('v')),
                    "browser_download_url": format!("https://github.com/Mahan-Imanian/netcheck/releases/download/{tag}/Netcheck_x64_en-US.msi"),
                    "size": 5054464,
                    "digest": null
                }
            ]
        })
        .to_string()
    }

    #[test]
    fn versions_parse() {
        assert_eq!(parse_version("v0.10.2"), Some((0, 10, 2)));
        assert_eq!(parse_version("1.2.3-beta.1"), Some((1, 2, 3)));
        assert_eq!(parse_version("1.2"), None);
        assert_eq!(parse_version("1.2.3.4"), None);
        assert_eq!(parse_version("latest"), None);
    }

    #[test]
    fn newer_release_is_offered_with_its_installer() {
        let info = parse_release(&release("v0.3.0"), "0.2.1", InstallKind::Nsis).expect("ok").expect("ok");
        assert_eq!(info.version, "0.3.0");
        assert_eq!(info.notes, "## Added\n\n- Update check.");
        assert_eq!(info.page_url, "https://github.com/Mahan-Imanian/netcheck/releases/tag/v0.3.0");
        let installer = info.installer.expect("ok");
        assert_eq!(installer.name, "Netcheck_0.3.0_x64-setup.exe");
        assert_eq!(installer.sha256, DIGEST);
        assert_eq!(installer.size, 4269297);
    }

    #[test]
    fn notes_stop_at_any_install_heading() {
        assert_eq!(release_notes("### Fixed\n\n- Map pins.\n\n### Install\n\nRun it."), "### Fixed\n\n- Map pins.");
        assert_eq!(release_notes("## Fixed\n\n- Installer icon."), "## Fixed\n\n- Installer icon.");
    }

    #[test]
    fn same_or_older_release_is_ignored() {
        assert_eq!(parse_release(&release("v0.2.1"), "0.2.1", InstallKind::Nsis).expect("ok"), None);
        assert_eq!(parse_release(&release("v0.2.0"), "0.2.1", InstallKind::Nsis).expect("ok"), None);
        assert!(parse_release(&release("v0.10.0"), "0.9.9", InstallKind::Nsis).expect("ok").is_some());
    }

    #[test]
    fn missing_digest_or_portable_gets_no_installer() {
        assert_eq!(parse_release(&release("v0.3.0"), "0.2.1", InstallKind::Msi).expect("ok").expect("ok").installer, None);
        assert_eq!(parse_release(&release("v0.3.0"), "0.2.1", InstallKind::Portable).expect("ok").expect("ok").installer, None);
    }

    #[test]
    fn drafts_and_prereleases_are_ignored() {
        let draft = release("v0.3.0").replace("\"draft\":false", "\"draft\":true");
        assert_eq!(parse_release(&draft, "0.2.1", InstallKind::Nsis).expect("ok"), None);
        let pre = release("v0.3.0").replace("\"prerelease\":false", "\"prerelease\":true");
        assert_eq!(parse_release(&pre, "0.2.1", InstallKind::Nsis).expect("ok"), None);
    }

    #[test]
    fn foreign_download_urls_are_rejected() {
        let moved = release("v0.3.0").replace("https://github.com/Mahan-Imanian/netcheck/releases/download/", "https://example.com/");
        assert_eq!(parse_release(&moved, "0.2.1", InstallKind::Nsis).expect("ok").expect("ok").installer, None);
    }

    #[test]
    fn install_kind_follows_the_install_folder() {
        let root = std::env::temp_dir().join(format!("netcheck-kind-{}", std::process::id()));
        let nsis = root.join("nsis");
        let msi = root.join("pf").join("Netcheck");
        let loose = root.join("downloads");
        for d in [&nsis, &msi, &loose] {
            std::fs::create_dir_all(d).expect("ok");
        }
        std::fs::write(nsis.join("uninstall.exe"), b"").expect("ok");
        let pf = vec![root.join("pf")];
        assert_eq!(install_kind(&nsis.join("netcheck.exe"), &pf), InstallKind::Nsis);
        assert_eq!(install_kind(&msi.join("netcheck.exe"), &pf), InstallKind::Msi);
        assert_eq!(install_kind(&loose.join("netcheck.exe"), &pf), InstallKind::Portable);
        assert_eq!(install_kind(&loose.join("netcheck.exe"), &[PathBuf::new()]), InstallKind::Portable);
        let _ = std::fs::remove_dir_all(root);
    }

    fn serve_once(body: &'static [u8]) -> String {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
        let addr = listener.local_addr().expect("addr");
        std::thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buf = [0u8; 1024];
                let _ = std::io::Read::read(&mut stream, &mut buf);
                let head = format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len());
                let _ = std::io::Write::write_all(&mut stream, head.as_bytes());
                let _ = std::io::Write::write_all(&mut stream, body);
            }
        });
        format!("http://{addr}/")
    }

    fn installer_at(base: &str, sha256: String) -> Installer {
        Installer { name: "Netcheck_0.3.0_x64-setup.exe".into(), url: format!("{base}Netcheck_0.3.0_x64-setup.exe"), size: 8, sha256 }
    }

    #[tokio::test]
    async fn download_keeps_a_matching_file() {
        let base = serve_once(b"netcheck");
        let dir = std::env::temp_dir().join(format!("netcheck-dl-ok-{}", std::process::id()));
        let client = UpdateClient::with_urls("http://127.0.0.1:9/", &base).expect("client");
        let mut seen = 0;
        let path = client
            .download(&installer_at(&base, hex(&Sha256::digest(b"netcheck"))), &dir, |done, total| {
                seen = done;
                assert_eq!(total, 8);
            })
            .await
            .expect("download");
        assert_eq!(seen, 8);
        assert_eq!(std::fs::read(&path).expect("read"), b"netcheck");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn download_rejects_a_checksum_mismatch() {
        let base = serve_once(b"tampered");
        let dir = std::env::temp_dir().join(format!("netcheck-dl-bad-{}", std::process::id()));
        let client = UpdateClient::with_urls("http://127.0.0.1:9/", &base).expect("client");
        let result = client.download(&installer_at(&base, hex(&Sha256::digest(b"netcheck"))), &dir, |_, _| {}).await;
        assert!(matches!(result, Err(UpdateError::Checksum)));
        assert!(!dir.join("Netcheck_0.3.0_x64-setup.exe").exists());
        assert!(!dir.join("Netcheck_0.3.0_x64-setup.part").exists());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn download_refuses_other_hosts() {
        let client = UpdateClient::new().expect("client");
        let result = client.download(&installer_at("https://example.com/", "0".repeat(64)), &std::env::temp_dir(), |_, _| {}).await;
        assert!(matches!(result, Err(UpdateError::NoInstaller)));
    }

    #[test]
    fn hex_is_lowercase() {
        assert_eq!(hex(&[0x00, 0xab, 0x0f]), "00ab0f");
    }
}
