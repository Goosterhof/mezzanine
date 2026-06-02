// The Ascent's wire-type surface (#00056) — the balcony learns to rebuild
// itself. The runtime flow wraps `@tauri-apps/plugin-updater` (`check()` →
// `Update.downloadAndInstall()`) and `@tauri-apps/plugin-process`
// (`relaunch()`); these types describe the slice's own view of that flow, not
// the plugin's payloads.

/**
 * The Ascent's lifecycle, locked to the §4 spec of #00056.
 *
 *   idle        — checked, nothing waiting below (or not yet checked)
 *   checking    — looking at the floor below for a newer balcony
 *   available   — a newer balcony stands ready; the prompt offers the descent
 *   downloading — the investor chose to descend; the bundle streams + installs
 *   rejected    — the bundle's signature did not verify against the baked-in
 *                 pubkey. A security event, not a transient one — no retry.
 *   error       — the check or download failed for a non-security reason
 *                 (network, disk). The balcony stands as it is.
 */
export type AscentStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'rejected' | 'error';

/**
 * The newer balcony's identity, distilled from the plugin's `Update` resource
 * for the prompt copy. We keep only what the voice needs — the version string
 * and the running version it would replace.
 */
export interface UpdateMeta {
    /** The version waiting on the floor below (the manifest's version). */
    version: string;
    /** The version the installed balcony is running right now. */
    currentVersion: string;
    /** Release date, if the manifest carried one. */
    date?: string;
    /** Release notes body, if the manifest carried one. */
    body?: string;
}
