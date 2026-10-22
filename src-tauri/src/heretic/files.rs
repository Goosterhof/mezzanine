//! Click-driven local previews. No asset-protocol scope, remote fetch, or shell execution.
use crate::error::{MezzanineError, MezzanineResult};
use crate::{host_paths, state::AppState};
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::State;

const IMAGE_LIMIT: u64 = 12 * 1024 * 1024;

fn refused(message: &str) -> MezzanineError {
    MezzanineError::Chronicle(message.into())
}

/// Input is a POSIX path from the configured laboratory, not an arbitrary host path.
/// Reject Windows namespaces, ADS, device names and traversal before any filesystem I/O.
fn relative_path<'a>(root: &Path, path: &'a str) -> MezzanineResult<&'a str> {
    if !path.starts_with('/')
        || path.contains("//")
        || path.len() > 4096
        || path
            .chars()
            .any(|c| c.is_control() || "\\:?#<>\"|*".contains(c))
    {
        return Err(refused(
            "Only absolute laboratory file paths can be opened here.",
        ));
    }
    for part in path.split('/').filter(|s| !s.is_empty()) {
        let stem = part
            .split('.')
            .next()
            .unwrap_or_default()
            .trim_end()
            .to_ascii_uppercase();
        if matches!(part, "." | "..")
            || part.ends_with(['.', ' '])
            || matches!(
                stem.as_str(),
                "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
            )
            || ["COM", "LPT"].iter().any(|prefix| {
                stem.strip_prefix(prefix).is_some_and(|s| {
                    matches!(
                        s,
                        "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
                    )
                })
            })
        {
            return Err(refused("This file path is not supported."));
        }
    }
    let root = root
        .to_str()
        .ok_or_else(|| refused("Invalid laboratory root."))?
        .trim_end_matches('/');
    if path == root {
        return Ok("");
    }
    path.strip_prefix(root).and_then(|rest| rest.strip_prefix('/'))
        .ok_or_else(|| refused("This file is outside the configured laboratory. Save it in the laboratory to view it here."))
}

fn resolve(root: &Path, distro: Option<&str>, path: &str) -> MezzanineResult<(PathBuf, PathBuf)> {
    let relative = relative_path(root, path)?;
    let root = host_paths::resolve_for_std_fs(root, distro, "").canonicalize()?;
    let resolved = root.join(relative).canonicalize()?;
    if !resolved.starts_with(&root) {
        return Err(refused("This link leaves the laboratory."));
    }
    Ok((root, resolved))
}

/// Check the object we actually opened, not just a path checked before open().
#[cfg(target_os = "linux")]
fn opened_path(file: &File) -> std::io::Result<PathBuf> {
    use std::os::fd::AsRawFd;
    std::fs::canonicalize(format!("/proc/self/fd/{}", file.as_raw_fd()))
}

#[cfg(windows)]
fn opened_path(file: &File) -> std::io::Result<PathBuf> {
    use std::os::windows::{ffi::OsStringExt, io::AsRawHandle};
    #[link(name = "kernel32")]
    extern "system" {
        fn GetFinalPathNameByHandleW(
            handle: *mut std::ffi::c_void,
            path: *mut u16,
            size: u32,
            flags: u32,
        ) -> u32;
    }
    let mut buffer = vec![0_u16; 32768];
    // SAFETY: the live File owns this handle; buffer is writable for its stated length.
    let length = unsafe {
        GetFinalPathNameByHandleW(
            file.as_raw_handle(),
            buffer.as_mut_ptr(),
            buffer.len() as u32,
            0,
        )
    };
    if length == 0 {
        return Err(std::io::Error::last_os_error());
    }
    if length as usize >= buffer.len() {
        return Err(std::io::Error::other("Image path is too long"));
    }
    Ok(PathBuf::from(std::ffi::OsString::from_wide(
        &buffer[..length as usize],
    )))
}

#[cfg(not(any(windows, target_os = "linux")))]
fn opened_path(_file: &File) -> std::io::Result<PathBuf> {
    Err(std::io::Error::other(
        "Local previews require Windows or Linux",
    ))
}

fn image_signature(extension: &str, bytes: &[u8]) -> bool {
    match extension {
        "png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "jpg" | "jpeg" => bytes.starts_with(b"\xff\xd8\xff"),
        "gif" => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        "webp" => bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP"),
        _ => false,
    }
}

fn read_image(root: &Path, distro: Option<&str>, path: &str) -> MezzanineResult<Vec<u8>> {
    let extension = path
        .rsplit('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp") {
        return Err(refused("Preview supports PNG, JPEG, GIF and WebP images."));
    }
    let (root, resolved) = resolve(root, distro, path)?;
    if !resolved.is_file() {
        return Err(refused("This path is not an image file."));
    }
    let file = File::open(resolved)?;
    if !opened_path(&file)?.starts_with(&root) {
        return Err(refused("This image leaves the laboratory."));
    }
    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.len() > IMAGE_LIMIT {
        return Err(refused(
            "Preview supports image files up to 12 MiB. Use Show in folder for larger artwork.",
        ));
    }
    let mut bytes = Vec::new();
    file.take(IMAGE_LIMIT + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > IMAGE_LIMIT {
        return Err(refused("The image exceeds the 12 MiB preview limit."));
    }
    if !image_signature(&extension, &bytes) {
        return Err(refused(
            "The file contents do not match its image extension.",
        ));
    }
    Ok(bytes)
}

fn config(state: &AppState) -> MezzanineResult<(PathBuf, Option<String>)> {
    Ok((
        state
            .lab_root
            .read()
            .clone()
            .ok_or(MezzanineError::ConfigCorrupt)?,
        state.distro.read().clone(),
    ))
}

#[tauri::command]
pub async fn read_chat_image(
    state: State<'_, AppState>,
    path: String,
) -> MezzanineResult<tauri::ipc::Response> {
    let (root, distro) = config(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        read_image(&root, distro.as_deref(), &path).map(tauri::ipc::Response::new)
    })
    .await
    .map_err(|e| refused(&e.to_string()))?
}

#[tauri::command]
pub async fn reveal_chat_file<R: tauri::Runtime>(
    state: State<'_, AppState>,
    app: tauri::AppHandle<R>,
    path: String,
) -> MezzanineResult<()> {
    use tauri_plugin_opener::OpenerExt;
    let (root, distro) = config(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (_, resolved) = resolve(&root, distro.as_deref(), &path)?;
        // Reveal selects in Explorer; it never executes a model-linked script or shortcut.
        app.opener()
            .reveal_item_in_dir(resolved)
            .map_err(|e| refused(&e.to_string()))
    })
    .await
    .map_err(|e| refused(&e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(target_os = "linux")]
    struct Fixture(PathBuf);
    #[cfg(target_os = "linux")]
    impl Fixture {
        fn new() -> Self {
            let p = std::env::temp_dir().join(format!("mezzanine-images-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir_all(&p).unwrap();
            Self(p)
        }
        fn image(&self, name: &str, data: &[u8]) -> String {
            let p = self.0.join(name);
            std::fs::write(&p, data).unwrap();
            p.to_string_lossy().into_owned()
        }
    }
    #[cfg(target_os = "linux")]
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn hostile_paths_are_rejected_before_io() {
        let root = Path::new("/home/lab");
        for path in [
            "/home/lab/../secret.png",
            "/home/lab/./x.png",
            "/home/lab-other/x.png",
            "/home/private.png",
            "//server/share/x.png",
            "/home/lab///server/share/x.png",
            "/home/lab/CON .png",
            r"\\server\share\x.png",
            r"\\?\C:\x.png",
            r"\\wsl$\Ubuntu\x.png",
            "/home/lab/x.png:stream",
            "/home/lab/CON.png",
            "/home/lab/CONIN$.png",
            "/home/lab/CONOUT$.png",
            "/home/lab/LPT1.png",
            "/home/lab/NUL/x.png",
            "/home/lab/file. /x.png",
            "/home/lab/x\n.png",
        ] {
            assert!(relative_path(root, path).is_err(), "{path}");
        }
        assert_eq!(
            relative_path(root, "/home/lab/art/my icon.png").unwrap(),
            "art/my icon.png"
        );
        assert_eq!(relative_path(root, "/home/lab").unwrap(), "");
    }
    #[test]
    fn all_supported_raster_signatures_are_checked() {
        for (ext, data) in [
            ("png", b"\x89PNG\r\n\x1a\n".as_slice()),
            ("jpg", b"\xff\xd8\xff"),
            ("jpeg", b"\xff\xd8\xff"),
            ("gif", b"GIF89a"),
            ("gif", b"GIF87a"),
            ("webp", b"RIFF0000WEBP"),
        ] {
            assert!(image_signature(ext, data));
            assert!(!image_signature(ext, b"<html>"));
        }
        assert!(!image_signature("svg", b"<svg/>"));
    }
    #[cfg(target_os = "linux")]
    #[test]
    fn reads_raster_bytes_but_rejects_disguised_large_and_non_image_files() {
        let f = Fixture::new();
        let png = b"\x89PNG\r\n\x1a\nfixture";
        let path = f.image("image.PNG", png);
        assert_eq!(read_image(&f.0, None, &path).unwrap(), png);
        let bad = f.image("fake.png", b"secret text");
        assert!(read_image(&f.0, None, &bad).is_err());
        let svg = f.image("bad.svg", b"<svg/>");
        assert!(read_image(&f.0, None, &svg).is_err());
        let big = f.image("big.png", png);
        File::options()
            .write(true)
            .open(&big)
            .unwrap()
            .set_len(IMAGE_LIMIT + 1)
            .unwrap();
        assert!(read_image(&f.0, None, &big).is_err());
        let dir = f.0.join("folder.png");
        std::fs::create_dir(&dir).unwrap();
        assert!(read_image(&f.0, None, dir.to_str().unwrap()).is_err());
    }
    #[cfg(target_os = "linux")]
    #[test]
    fn refuses_escaping_symlinks_and_checks_the_open_handle_after_a_swap() {
        use std::os::unix::fs::symlink;
        let inside = Fixture::new();
        let outside = Fixture::new();
        let secret = outside.image("secret.png", b"\x89PNG\r\n\x1a\nsecret");
        let link = inside.0.join("link.png");
        symlink(&secret, &link).unwrap();
        assert!(read_image(&inside.0, None, link.to_str().unwrap()).is_err());
        let original = inside.image("original.png", b"\x89PNG\r\n\x1a\noriginal");
        let (_, checked) = resolve(&inside.0, None, &original).unwrap();
        std::fs::remove_file(&checked).unwrap();
        symlink(&secret, &checked).unwrap();
        let file = File::open(&checked).unwrap();
        assert!(!opened_path(&file).unwrap().starts_with(&inside.0));
    }
}
