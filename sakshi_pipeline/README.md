# Sakshi end-to-end pipeline — how to run it

This is the full pipeline wired together: land masking → drift physics →
Layer 0 detection (your real repo) → age/weathering (your real modules) →
behavioral anomaly prior → joint scoring → backward hindcast, age
estimate, vessel ranking, forward forecast.

## 1. Where to run it

Anywhere with Python 3.10+ and internet access for a one-time `pip install`
(no internet needed at runtime — everything, including land masking, runs
offline). A laptop is fine; no GPU needed.

## 2. Install dependencies

```bash
pip install numpy pandas torch --no-deps   # --no-deps avoids pulling in
                                             # multi-GB CUDA packages you
                                             # don't need for CPU-only use
pip install shapely global-land-mask rasterio opencv-python-headless \
            scipy pyproj affine
```

If `torch --no-deps` fails to import afterward on your machine (rare,
depends on platform), drop `--no-deps` and accept the larger download.

## 3. Run it

```bash
cd sakshi_pipeline
python3 engine.py
```

This prints the backward hindcast (which vessel + origin + time the
system thinks caused the spill), the age estimate, the vessel ranking,
and the forward forecast — see `sample_run_output.txt` for exactly what
a real run produces.

**Runtime: about 110–120 seconds** (was 60-70s before the candidate
grid was made finer — see section 6), dominated by the behavioral
model's 60-epoch LSTM training and 30 candidate t0 hypotheses x 20
vessels = 600 drift-physics simulations. This is exactly why your
script already plans a recorded backup — don't run this live on
stage. Run it once now, record that run, and use the recorded video
as your Step 2–5 segment per the script's own contingency plan.

## 4. Get the UI fixture

```bash
python3 export_fixture.py
```

Writes `output_for_ui.json` — hand this to your teammate. It's a static
snapshot of one real run's output, in the fixed shape he should build
the dashboard against. It also includes a `field_provenance` block
mapping every field to real-vs-synthetic, so the UI's honesty badges
don't have to be guessed.

## 5. What's real vs synthetic in this run (matches your checklist)

- **Land masking**: real, offline (`global-land-mask`), no network needed.
- **Layer 0 detection**: your real `pipeline.py`/`polygonize.py`/`area.py`/
  `flag.py` code, run for real — fed a synthetic mask (since the
  checkpoint isn't trained), not a synthetic *function*.
- **Drift physics**: real RK4 integrator, on a synthetic current field
  calibrated to reproduce the one real displacement you have ground
  truth for (sinking point → detection point over 72h, ~1.3km error).
- **Age/weathering**: fully real, your two modules, unmodified.
- **Behavioral prior**: real LSTM, trained on synthetic AIS traffic
  (20 vessels, one with an injected anomaly at the real incident
  time/place).
- **Vessel ranking**: not a separate module — `summarize()` is literally
  `groupby(vessel).sum(score)`, exactly as your architecture diagram
  says.

## 6. Sample result (this run)

**Update 1**: fixed a bug in `ais_synthetic.py` where the anomalous
vessel's pre-incident track didn't actually pass through
`REAL_SINKING` at `REAL_ELAPSED_HOURS` (two stacked off-by-ones --
random-walk noise leaking into what should've been a deterministic
backward-solved leg, plus a row-index vs. timestamp mismatch). Origin
error at the true t0=72h is now exactly 0km (was 16.2km before the
fix).

**Update 2**: widened the candidate grid from 12 candidates (6h
steps, `CANDIDATE_T0_HOURS` in `engine.py`) to 30 candidates (2h
steps across the physically plausible 48-96h window, coarser
outside it). The 6h grid was too coarse to resolve which of two
adjacent, near-tied candidates was actually the shape-match peak.
At 2h resolution the L_shape(t0) curve for the true vessel is now
visibly a real, unimodal peak spanning roughly 60-78h (rises from
zero at 56h, peaks around 64-70h, decays back to zero by 82h) --
not noise. Runtime went from ~65s to ~115s as a result (600 drift
sims instead of 240) -- still fine for an offline pre-recorded run.

The MAP hypothesis correctly identifies the injected anomalous vessel
as the top suspect, with an origin ~2.3km from the real sinking point
and an age estimate of ~67.9h vs the real 72h -- see
`sample_run_output.txt` for the full numbers.

**Known limitation (unchanged by the finer grid)**: MAP lands on
t0=68h, not the true 72h. The finer grid resolved the *coarse*
quantization problem, but it also revealed the honest underlying
limitation: `KERALA_CURRENT` is a synthetic current field calibrated
to reproduce only ONE displacement vector (sink to detection over
72h) -- it has no independent constraint on shape/timing at nearby
candidates, so the score curve's peak sits within a few hours of
truth but not exactly on it. The true value (72h) scores within
~14% of the MAP peak (0.0753 vs 0.0871) -- i.e. it's solidly inside
the peak, just not the argmax. Fixing this properly needs a real
regional current product (CMEMS or INCOIS) instead of the
single-point-calibrated synthetic field; that's not done in this
snapshot.

## Files

- `land_mask.py` — offline land/sea check + beaching logic
- `drift.py` — RK4 drift physics, recentered/calibrated on Kerala
- `ais_synthetic.py` — synthetic AIS generator with injected anomaly
- `behavioral.py` — LSTM behavioral anomaly model (from your notebook)
- `weathering.py`, `agelikelihood.py` — your real age/weathering modules, unchanged
- `layer0_pkg/` — your real Layer 0 repo (detection/geometry/texture/lookalike)
- `detection_layer0.py` — wires a synthetic mask into your real Layer 0 pipeline
- `footprint.py` — particle-cloud → polygon + IoU helper
- `engine.py` — the joint scoring engine end-to-end (run this)
- `export_fixture.py` — writes `output_for_ui.json` for the UI teammate
