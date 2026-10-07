// The Specimens' stature, baked (#00067 §3 #4). The ruled prototype measured
// each figure at runtime: `r2Fit` rasterised it to find the factor that makes
// it stand 70 px, and `castMetrics` rasterised it again for the heights the
// stage needed. Both probes ran on a type's first frame and were the likely
// cause of the 48-59 ms first-posture spike, so the graft removes them and
// keeps their outputs here as constants.
//
// Source: `castMetrics(8, type, cls, FIGURE_SCALE * 0.6875)` read off the
// ruled prototype (prototypes/mezzanine-minion-errand, lab `b7209d0`) on
// 2026-10-07. Each fit and post footprint matches
// verdict/casting-r2/measurements.json (lot 8 rows).

export interface SpecimenFit {
    /** stature factor on top of Lot 8's base scale */
    fit: number;
    /** highest ink of any standing pose, stage units above the ground */
    standTop: number;
    /** highest ink of the sill poses (hang + idle / point / waiting), stage units */
    sillTop: number;
    /** the post pose's ink height, px at bench scale */
    postPx: number;
    /** the widest post pose, px at bench scale */
    postFootPx: number;
}

const SURGEON: SpecimenFit = {
    fit: 1.0294117647058822,
    standTop: 125.06420779220775,
    sillTop: 126.86628571428568,
    postPx: 48.4,
    postFootPx: 36,
};
const LIBRARIAN: SpecimenFit = {
    fit: 1.4285714285714286,
    standTop: 123.26212987012984,
    sillTop: 123.26212987012984,
    postPx: 50.4,
    postFootPx: 40,
};
const SCRIBE: SpecimenFit = {
    fit: 1.3725490196078431,
    standTop: 125.06420779220775,
    sillTop: 125.06420779220775,
    postPx: 49.4,
    postFootPx: 43,
};
const SYNCHRONIZER: SpecimenFit = {
    fit: 1.09375,
    standTop: 123.26212987012984,
    sillTop: 126.86628571428568,
    postPx: 51.4,
    postFootPx: 36,
};
/** the Fairground Goldfish: general-purpose and Explore */
const HIRED: SpecimenFit = {
    fit: 1.5217391304347827,
    standTop: 121.46005194805191,
    sillTop: 121.46005194805191,
    postPx: 45.4,
    postFootPx: 43,
};
/** Plan carries a pencilled plan in the bag; one px narrower at the post */
const PLAN: SpecimenFit = {...HIRED, postFootPx: 42};

const BY_TYPE: Readonly<Record<string, SpecimenFit>> = {
    surgeon: SURGEON,
    librarian: LIBRARIAN,
    scribe: SCRIBE,
    synchronizer: SYNCHRONIZER,
    'general-purpose': HIRED,
    Explore: HIRED,
    Plan: PLAN,
};

/** A type's baked stature. Lab types beyond wave 1 have no Lot 8 drawing yet:
 *  they draw as Hired-shaped specimens with the MINT seal band, at the Hired
 *  factor (#00067 OQ-2), and every unknown type is Hired. */
export function specimenFit(type: string): SpecimenFit {
    return BY_TYPE[type] ?? HIRED;
}

/** Lot 8's base scale against the stage's one minion scale (prototype `lotK(8)`). */
export const LOT8_K = 1.3;
