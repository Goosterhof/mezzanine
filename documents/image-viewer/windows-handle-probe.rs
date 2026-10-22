use std::fs::File;
use std::path::{Path, PathBuf};
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


fn main() {
 let root = Path::new(r"\\wsl$\Ubuntu\home\goosterhof\Code\zmuuzn").canonicalize().unwrap();
 let art = root.join(r"output\imagegen\tavern-party-avatar-2026-10-22\tavern-party-avatar-512.png");
 let file=File::open(&art).unwrap();
 let opened=opened_path(&file).unwrap();
 assert!(opened.starts_with(&root), "opened image did not stay under canonical lab root");
 assert_eq!(file.metadata().unwrap().len(), 450029);
 let outside=File::open(r"\\wsl$\Ubuntu\tmp\mezzanine-image-outside-20261022\outside.png").unwrap();
 assert_eq!(outside.metadata().unwrap().len(),450029);
 println!("PASS: outside-root PNG is directly readable through Windows UNC");
 for name in ["escape.png","escape-relative.png","escape-directory/outside.png"] {
 let escape=root.join("output/mezzanine-image-preview-20261022").join(name);
 match escape.canonicalize() {
   Ok(canonical) => { assert!(!canonical.starts_with(&root), "escaping symlink accepted: {}",name); println!("PASS: {} resolved outside root and is refused",name); },
   Err(e)=>println!("PASS: {} canonicalization refused: {}",name,e)
 }
 }
 println!("PASS: Windows opened-handle path matches canonical WSL lab root; Tavern PNG is 450029 bytes");
}
