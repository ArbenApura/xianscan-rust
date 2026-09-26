// -- CRATE / EXTERNAL IMPORTS -- //
use std::io::Write;
use std::path::{Path, PathBuf};

// -- TYPES & STRUCTS -- //

/// WHERE THE WEB SERVER LISTENS: LOOPBACK ONLY, OR EVERY INTERFACE (LAN).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BindMode {
    Local,
    Lan,
}

/// WHY THE BIND MODE WAS CHOSEN. PASSED TO NODE AS XIANSCAN_BIND_SOURCE.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BindSource {
    Setting,
    Env,
    Docker,
    LegacyDefault,
    Default,
}

/// WHAT THE LAUNCHER KNOWS ABOUT THE DATABASE BEFORE NODE STARTS.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct DbProbe {
    /// THE DATABASE FILE EXISTED BEFORE THIS PROCESS STARTED.
    pub existed_before_start: bool,
    /// ANY BOOK OR SETTING ROW EXISTS (A REAL, USED INSTALL).
    pub has_user_data: bool,
    /// THE STORED "lanAccessEnabled" CHOICE, IF ANY.
    pub lan_setting: Option<bool>,
}

// -- TRAITS & IMPLEMENTATIONS -- //

impl BindMode {
    pub fn host(self) -> &'static str {
        match self {
            BindMode::Local => "127.0.0.1",
            BindMode::Lan => "0.0.0.0",
        }
    }
}

impl BindSource {
    pub fn as_str(self) -> &'static str {
        match self {
            BindSource::Setting => "setting",
            BindSource::Env => "env",
            BindSource::Docker => "docker",
            BindSource::LegacyDefault => "legacy-default",
            BindSource::Default => "default",
        }
    }
}

// -- FUNCTIONS & ALGORITHMS -- //

/// PURE BIND DECISION. ORDER: --lan FLAG, XIANSCAN_BIND ENV, DOCKER, STORED SETTING, LEGACY INSTALL, DEFAULT.
pub fn resolve_bind_mode(
    args: &[String],
    env_bind: Option<String>,
    in_docker: bool,
    db: DbProbe,
) -> (BindMode, BindSource) {
    if args.iter().any(|a| a == "--lan") {
        return (BindMode::Lan, BindSource::Env);
    }

    if let Some(raw) = env_bind {
        let source = if in_docker { BindSource::Docker } else { BindSource::Env };
        match raw.trim().to_ascii_lowercase().as_str() {
            "lan" => return (BindMode::Lan, source),
            "local" => return (BindMode::Local, source),
            "" => {}
            other => tracing::warn!(value = %other, "IGNORING INVALID XIANSCAN_BIND (EXPECTED 'lan' OR 'local')"),
        }
    }

    if in_docker {
        // A CONTAINER IS ONLY REACHABLE THROUGH ITS PUBLISHED PORT; LOOPBACK WOULD MAKE IT UNUSABLE
        return (BindMode::Lan, BindSource::Docker);
    }

    match db.lan_setting {
        Some(true) => (BindMode::Lan, BindSource::Setting),
        Some(false) => (BindMode::Local, BindSource::Setting),
        None if db.existed_before_start && db.has_user_data => (BindMode::Lan, BindSource::LegacyDefault),
        None => (BindMode::Local, BindSource::Default),
    }
}

pub fn running_in_docker() -> bool {
    Path::new("/.dockerenv").exists()
}

/// READ-ONLY LOOK AT THE DATABASE. EVERY ERROR MEANS "NO DATA"; NEVER PANICS.
pub fn probe_db(db_path: &Path, existed_before_start: bool) -> DbProbe {
    let mut probe = DbProbe { existed_before_start, ..DbProbe::default() };
    if !db_path.exists() {
        return probe;
    }
    let Ok(conn) = rusqlite::Connection::open_with_flags(
        db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ) else {
        return probe;
    };

    probe.lan_setting = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'lanAccessEnabled'",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .and_then(|v| match v.trim().trim_matches('"') {
            "true" => Some(true),
            "false" => Some(false),
            _ => None,
        });

    let has_books: bool = conn
        .query_row("SELECT EXISTS(SELECT 1 FROM books LIMIT 1)", [], |row| row.get(0))
        .unwrap_or(false);
    let has_settings: bool = conn
        .query_row("SELECT EXISTS(SELECT 1 FROM app_settings LIMIT 1)", [], |row| row.get(0))
        .unwrap_or(false);
    probe.has_user_data = has_books || has_settings;
    probe
}

pub fn random_bytes<const N: usize>() -> Option<[u8; N]> {
    let mut buf = [0u8; N];
    getrandom::getrandom(&mut buf).ok()?;
    Some(buf)
}

/// BASE64URL WITHOUT PADDING (RFC 4648 SECTION 5).
pub fn base64url(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::with_capacity((bytes.len() * 4).div_ceil(3));
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | (b[2] as u32);
        let chars = chunk.len() + 1;
        for i in 0..chars {
            out.push(ALPHABET[((n >> (18 - 6 * i)) & 63) as usize] as char);
        }
    }
    out
}

fn is_valid_token(s: &str) -> bool {
    s.len() == 43 && s.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}

pub fn token_path(data_dir: &Path) -> PathBuf {
    data_dir.join("access-token")
}

/// WRITE A SECRET FILE VIA TEMP FILE + RENAME, 0600 ON UNIX.
pub fn write_secret_file(path: &Path, contents: &str) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension(format!("{}.tmp", std::process::id()));
    {
        let mut opts = std::fs::OpenOptions::new();
        opts.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            opts.mode(0o600);
        }
        let mut f = opts.open(&tmp)?;
        f.write_all(contents.as_bytes())?;
        f.sync_all()?;
    }
    std::fs::rename(&tmp, path)
}

/// CREATE <data_dir>/access-token IF IT IS MISSING OR MALFORMED. SAME FORMAT AS THE NODE SIDE
/// (32 RANDOM BYTES, BASE64URL, 43 CHARS). RETURNS NONE AND LOGS ON ANY ERROR.
pub fn ensure_access_token(data_dir: &Path) -> Option<String> {
    let path = token_path(data_dir);
    if let Ok(existing) = std::fs::read_to_string(&path) {
        let trimmed = existing.trim();
        if is_valid_token(trimmed) {
            return Some(trimmed.to_string());
        }
    }
    let token = base64url(&random_bytes::<32>()?);
    match write_secret_file(&path, &token) {
        Ok(()) => Some(token),
        Err(e) => {
            tracing::warn!(error = %e, path = %path.display(), "COULD NOT WRITE THE ACCESS TOKEN FILE");
            None
        }
    }
}

/// 32 RANDOM BYTES AS HEX, FOR THE ML SERVER SHARED SECRET.
pub fn generate_secret() -> Option<String> {
    random_bytes::<32>().map(hex::encode)
}

/// CONSTANT-TIME COMPARISON (LENGTH CHECK, THEN XOR-FOLD OVER EVERY BYTE).
pub fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b.iter()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

// -- TESTS -- //

#[cfg(test)]
mod tests {
    use super::*;

    fn no_args() -> Vec<String> {
        vec!["xianscan".to_string()]
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("xianscan-access-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn bind_defaults_to_local_on_fresh_install() {
        let r = resolve_bind_mode(&no_args(), None, false, DbProbe::default());
        assert_eq!(r, (BindMode::Local, BindSource::Default));
    }

    #[test]
    fn bind_legacy_install_without_setting_is_lan() {
        let db = DbProbe { existed_before_start: true, has_user_data: true, lan_setting: None };
        assert_eq!(resolve_bind_mode(&no_args(), None, false, db), (BindMode::Lan, BindSource::LegacyDefault));
        // A DATABASE CREATED BY THIS RUN IS NOT A LEGACY INSTALL
        let fresh = DbProbe { existed_before_start: false, has_user_data: true, lan_setting: None };
        assert_eq!(resolve_bind_mode(&no_args(), None, false, fresh), (BindMode::Local, BindSource::Default));
    }

    #[test]
    fn bind_setting_false_wins_over_legacy() {
        let db = DbProbe { existed_before_start: true, has_user_data: true, lan_setting: Some(false) };
        assert_eq!(resolve_bind_mode(&no_args(), None, false, db), (BindMode::Local, BindSource::Setting));
    }

    #[test]
    fn bind_env_overrides_setting() {
        let db = DbProbe { existed_before_start: true, has_user_data: true, lan_setting: Some(false) };
        assert_eq!(resolve_bind_mode(&no_args(), Some("lan".into()), false, db), (BindMode::Lan, BindSource::Env));
        assert_eq!(
            resolve_bind_mode(&no_args(), Some("LOCAL".into()), true, DbProbe::default()),
            (BindMode::Local, BindSource::Docker)
        );
    }

    #[test]
    fn bind_flag_overrides_env() {
        let args = vec!["xianscan".to_string(), "--lan".to_string()];
        assert_eq!(resolve_bind_mode(&args, Some("local".into()), false, DbProbe::default()).0, BindMode::Lan);
    }

    #[test]
    fn bind_invalid_env_is_ignored() {
        assert_eq!(
            resolve_bind_mode(&no_args(), Some("everywhere".into()), false, DbProbe::default()),
            (BindMode::Local, BindSource::Default)
        );
        assert_eq!(resolve_bind_mode(&no_args(), None, true, DbProbe::default()), (BindMode::Lan, BindSource::Docker));
    }

    #[test]
    fn token_file_created_with_43_chars_and_reused() {
        let dir = temp_dir("create");
        let first = ensure_access_token(&dir).expect("token");
        assert_eq!(first.len(), 43);
        assert!(is_valid_token(&first));
        let second = ensure_access_token(&dir).expect("token");
        assert_eq!(first, second);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn token_file_malformed_is_replaced() {
        let dir = temp_dir("malformed");
        std::fs::write(token_path(&dir), "short").unwrap();
        let token = ensure_access_token(&dir).expect("token");
        assert!(is_valid_token(&token));
        assert_eq!(std::fs::read_to_string(token_path(&dir)).unwrap(), token);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn ct_eq_rejects_different_lengths() {
        assert!(ct_eq(b"abc", b"abc"));
        assert!(!ct_eq(b"abc", b"abd"));
        assert!(!ct_eq(b"abc", b"abcd"));
        assert!(!ct_eq(b"", b"a"));
    }

    #[test]
    fn base64url_matches_known_vectors() {
        assert_eq!(base64url(b""), "");
        assert_eq!(base64url(b"f"), "Zg");
        assert_eq!(base64url(b"fo"), "Zm8");
        assert_eq!(base64url(b"foo"), "Zm9v");
        assert_eq!(base64url(&[0xfb, 0xff]), "-_8");
    }
}
