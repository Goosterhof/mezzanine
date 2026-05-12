// The balcony module — what the investor sees from the railing.
//
// Phase 2B fills the rail's three sign slots and the Dispatch sheet's
// briefing library. The signs are read-only digests of files the
// laboratory already curates; the library is a Rust compile-time list of
// mission templates. Both stay deliberately small — anything richer is
// "dispatch a scientist to do it," not "build another panel."
//
// Modules:
//   * `signs`             — parsers for Last Chaos + Idea Ledger sign payloads
//   * `briefing_library`  — static seed templates rendered as dispatch cards

pub mod briefing_library;
pub mod signs;
