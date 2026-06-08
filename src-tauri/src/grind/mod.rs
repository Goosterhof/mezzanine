// The Grind — Arc 3 of the absorption trilogy (#00053).
//
// The lab earns, not the investor. The Grind's economy module is a second
// consumer of `chronicle::reader`'s event stream — the Observer animates
// sprites from the same turns the Grind translates into RP grants.
//
// G-0 economy spec (recorded inline, seed values from the experiment log
// confirmed by Chaos Monkey pass on 2026-05-26):
//
//   * Chronicle line:     0.5 RP per ChronicleTurn, per-scientist cap of
//                         4.0 RP/sec (token bucket; bursts cap at 4 RP)
//   * Dispatch:           25 RP per dispatch event, per-id dedup
//   * Recall (clean):     100 RP per non-crashed recall, per-id dedup
//   * Mission duration:   0.5 RP/sec working, 0.1 RP/sec awaiting,
//                         accrued by RosterManager::transition_to and
//                         polled by the EconomyManager on a 60s tokio tick
//
// Dispatch theorem branch (added as a fourth branch alongside
// Automation / Quantum / Chaos):
//
//   * Tireless Bench  (1 TP): +10% RP per concurrent dispatched scientist
//   * Recall Discipline (2 TP): +25% RP on clean recall grants
//   * Briefing Library (3 TP): 2x RP for missions tagged with a library template
//   * Many Hands (5 TP): >=4 concurrent scientists -> +15% global multiplier
//
// All G-0 constants live in `economy::config` so future rebalancing
// touches one file. The investor approved the seed values via the
// experiment-log Chaos Monkey pass (12 findings resolved, commit d675c87).

pub mod economy;
pub mod persistence;

pub use economy::EconomyManager;
