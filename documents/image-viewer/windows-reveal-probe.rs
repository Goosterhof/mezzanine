use std::{ffi::c_void, os::windows::ffi::OsStrExt, path::Path};
#[link(name="ole32")] extern "system" {fn CoInitialize(reserved:*mut c_void)->i32;fn CoUninitialize();}
#[link(name="shell32")] extern "system" {
 fn ILCreateFromPathW(path:*const u16)->*mut c_void;
 fn ILFree(pidl:*mut c_void);
 fn SHOpenFolderAndSelectItems(folder:*const c_void,count:u32,items:*const *const c_void,flags:u32)->i32;
}
fn wide(p:&Path)->Vec<u16>{p.as_os_str().encode_wide().chain(Some(0)).collect()}
fn main(){
 let canonical=Path::new(r"\\wsl$\Ubuntu\home\goosterhof\Code\zmuuzn\output\imagegen\tavern-party-avatar-2026-10-22\tavern-party-avatar-512.png").canonicalize().unwrap();
 // The pinned opener2.7.2 applies dunce::simplified before ILCreateFromPathW.
 let value=canonical.to_str().unwrap();let shell=if let Some(tail)=value.strip_prefix(r"\\?\UNC\"){format!(r"\\{}",tail)}else{value.to_string()};
 let path=Path::new(&shell);let parent=wide(path.parent().unwrap());let item=wide(path);
 unsafe{
  let init=CoInitialize(std::ptr::null_mut());assert!(init>=0);
  let parent_id=ILCreateFromPathW(parent.as_ptr());let item_id=ILCreateFromPathW(item.as_ptr());
  assert!(!parent_id.is_null()&&!item_id.is_null(),"shell item conversion failed");
  let items=[item_id as *const c_void];let result=SHOpenFolderAndSelectItems(parent_id,1,items.as_ptr(),0);
  ILFree(item_id);ILFree(parent_id);CoUninitialize();assert!(result>=0,"reveal HRESULT {:x}", result);
  println!("PASS: native Windows shell converted the normalized WSL path and accepted reveal (HRESULT {result})");
 }
}
