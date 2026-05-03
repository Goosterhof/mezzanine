// Chronicle types — mirror the serde structs in src-tauri/src/chronicle/.
//
// The wire shape is camelCase on the JS side (Tauri serializes the
// kebab-case enums verbatim — `direction: 'in' | 'out'` matches the Rust
// `serde(rename_all = "lowercase")` enum variants).

export type TurnDirection = 'in' | 'out';

export interface ChronicleTurn {
    ts: string;
    direction: TurnDirection;
    payload: string;
}
