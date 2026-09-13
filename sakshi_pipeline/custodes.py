"""
custodes.py -- A6: Custodes meta-monitor. Decides COMMIT / REFINE_GRID /
ABSTAIN from a trained CAW's alpha output for one spill's hypothesis grid.

DESIGN (margin-ratio rule, not a coherence-formula -- per spec, simple and
auditable over a training-quality-dependent complex formula):

  1. VESSEL-LEVEL aggregation first. engine.py's hypothesis grid has one
     alpha per (mmsi, t0) ROW -- multiple rows per vessel (one per t0
     candidate), all sharing that vessel's embedding (only physics_bias
     differs row-to-row). Summing alpha across a vessel's rows before
     computing any margin was tested against a specific hypothesis (that
     row-level top-2 were usually the same vessel at two different t0
     guesses) via evaluate_margin_threshold_v2.py -- that hypothesis was
     only WEAKLY confirmed (present in 1/6 vessel-level-wrong episodes,
     4/34 correct ones; not the dominant effect). Vessel-aggregation is
     kept anyway because it measurably helped on its own merits: raw
     accuracy 82.5% (row-level) -> 85.0% (vessel-level) on the same 40
     held-out episodes, and COMMIT precision 88.6% -> 93.9% (see the
     MARGIN_THRESHOLD_COMMIT validation numbers below). It also matches
     A8's own vessel_alpha_all output contract (vessel-level, not
     row-level), so it's the right granularity regardless.

  2. margin = top_vessel_score / second_vessel_score (null-key counted as
     its own "vessel" bucket in this ranking, so it can win the margin
     outright on a genuine no-vessel-fits case).

  3. margin > MARGIN_THRESHOLD_COMMIT -> COMMIT.

  4. Else: check the ORIGINAL row-level top-2 (not vessel-aggregated).
     If they belong to the SAME mmsi -> REFINE_GRID (asking for a finer
     t0 grid around that vessel's candidates). Otherwise -> ABSTAIN.
     NOTE (honest caveat, see point 1): this specific REFINE_GRID trigger
     was NOT the dominant real-world failure mode in validation -- ALL 6
     of the 40 held-out vessel-level errors were NEG (no-anomaly)
     episodes where a real vessel outscored the null-key (a false
     positive), not a same-vessel/wrong-t0 mixup. CAW correctly
     identified the true vessel in 20/20 POS episodes. So REFINE_GRID
     will rarely fire in practice on this checkpoint; ABSTAIN is where
     most of the genuine uncertainty actually shows up. Kept as designed
     because it's still architecturally sound for the case it DOES cover,
     but don't oversell "REFINE_GRID" as this checkpoint's main safety net
     in a demo -- ABSTAIN is.

MARGIN_THRESHOLD_COMMIT = 1.3929 -- from evaluate_margin_threshold_v2.py
against caw_weights.pt (200 train / 40 held-out validation seeds, default
episode config: 9-point t0 grid, n_particles=40, lstm_epochs=20).
Validation numbers at this threshold (40 held-out episodes, NOT
hand-picked -- this is the value that maximized separation on that set):
  - 87.50% separation (COMMIT-and-correct or NOT-COMMIT-and-wrong),
    vs. 85.00% for a trivial "always COMMIT" baseline
  - COMMIT: 33/40 episodes, 93.94% of those are actually correct
  - NOT-COMMIT (REFINE_GRID/ABSTAIN): 7/40 episodes, 57.14% of those
    were correctly caught as wrong predictions (the other 3/7 were
    correct predictions that got needlessly flagged -- false alarms)
Only 40 validation episodes went into this number; treat it as a
demo-level estimate, not a statistically tight bound.
"""

MARGIN_THRESHOLD_COMMIT = 1.3929


def aggregate_by_vessel(alpha_df, null_alpha):
    """alpha_df: DataFrame with columns [mmsi, t0_hours, alpha] (one row
    per (vessel, t0) hypothesis, e.g. engine.py's scores_df with an
    'alpha' column merged in). null_alpha: float, the null-key's alpha
    mass for this episode (not a row in alpha_df).

    Returns: sorted list of (key, score) tuples, highest first. key is an
    int mmsi for real vessels, or the string "__NULL__" for the null-key
    bucket.
    """
    vessel_scores = alpha_df.groupby("mmsi")["alpha"].sum().to_dict()
    vessel_scores["__NULL__"] = float(null_alpha)
    return sorted(vessel_scores.items(), key=lambda kv: -kv[1])


def evaluate(alpha_df, null_alpha):
    """Returns a dict: {decision, top_vessel, margin, spatial_top_alpha,
    temporal_..., stability, ...} -- see below for the exact keys used by
    the rest of the pipeline (A7/A8).

    decision: "COMMIT" | "REFINE_GRID" | "ABSTAIN"
    """
    if MARGIN_THRESHOLD_COMMIT is None:
        raise RuntimeError(
            "custodes.MARGIN_THRESHOLD_COMMIT is still None -- run "
            "evaluate_margin_threshold_v2.py against your trained "
            "caw_weights.pt and paste its printed threshold here. "
            "This is intentional: a hand-picked threshold isn't allowed "
            "(see module docstring)."
        )

    ranked_vessels = aggregate_by_vessel(alpha_df, null_alpha)
    top_key, top_score = ranked_vessels[0]
    second_key, second_score = ranked_vessels[1] if len(ranked_vessels) > 1 else (None, 1e-12)
    vessel_margin = top_score / max(second_score, 1e-12)

    # Row-level top-2 (for the REFINE_GRID same-vessel check) -- includes
    # the null-key as its own pseudo-row so it can be part of "top-2" too.
    row_alpha = list(zip(alpha_df["mmsi"], alpha_df["t0_hours"], alpha_df["alpha"]))
    row_alpha.append(("__NULL__", None, null_alpha))
    row_alpha_sorted = sorted(row_alpha, key=lambda r: -r[2])
    top_row_mmsi = row_alpha_sorted[0][0]
    second_row_mmsi = row_alpha_sorted[1][0]
    same_vessel_top2 = (top_row_mmsi == second_row_mmsi) and (top_row_mmsi != "__NULL__")

    if vessel_margin > MARGIN_THRESHOLD_COMMIT:
        decision = "COMMIT"
    elif same_vessel_top2:
        decision = "REFINE_GRID"
    else:
        decision = "ABSTAIN"

    return {
        "decision": decision,
        "top_vessel": None if top_key == "__NULL__" else int(top_key),
        "top_vessel_score": top_score,
        "second_vessel": None if second_key == "__NULL__" else int(second_key),
        "second_vessel_score": second_score,
        "margin": vessel_margin,
        "same_vessel_top2_rows": same_vessel_top2,
        "abstain_flag": decision == "ABSTAIN",
    }


if __name__ == "__main__":
    import pandas as pd

    # Tiny synthetic sanity check (not a real episode): one vessel clearly
    # ahead of the rest -> should COMMIT once MARGIN_THRESHOLD_COMMIT is set.
    if MARGIN_THRESHOLD_COMMIT is None:
        print("MARGIN_THRESHOLD_COMMIT is None -- fill it in from "
              "evaluate_margin_threshold_v2.py's output first. Skipping self-test.")
    else:
        alpha_df = pd.DataFrame({
            "mmsi": [200000000, 200000000, 200000001, 200000002],
            "t0_hours": [66, 72, 72, 72],
            "alpha": [0.05, 0.60, 0.10, 0.05],
        })
        null_alpha = 0.20
        result = evaluate(alpha_df, null_alpha)
        print(result)
