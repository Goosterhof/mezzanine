// The Workbench — Tauri entry point.
//
// The main binary is intentionally trivial: every working part of the gadget
// lives in the library crate so it can be unit-tested without spinning up
// Tauri. The Workbench's bench is in lib.rs.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    workbench_lib::run();
}
