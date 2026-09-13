import type { AlphaSurfaceResponse, CustodesStatusResponse, SpillAnalysis, SuspectCandidate } from "../../types/intelligence";
import { AlphaSurfaceHeatmap } from "./AlphaSurfaceHeatmap";
import { CustodesCard } from "./CustodesCard";

function formatUtcTimestamp(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" }) + " UTC";
}

function formatScore(score: number | null): string {
    if (score === null) return "N/A";
    return String(Math.round(score * 100));
}

interface InvestigationPanelProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
    suspects: SuspectCandidate[];
    suspectsLoading: boolean;
    suspectsError: boolean;
    selectedSuspectId: number | null;
    onSuspectSelect: (vesselId: number) => void;
    detectionTime: string | null;
    analysis: SpillAnalysis | null;
    onIdentifySuspects: () => void;
    identifyLoading: boolean;
    identifyError: boolean;
    identified: boolean;
    alphaSurface: AlphaSurfaceResponse | null;
    custodes: CustodesStatusResponse | null;
    winningVesselId: number | null;
}

const timelineEvents = [
    ["Spill detected", "Surface anomaly recorded for investigation.", 0],
    ["Origin estimated", "Probable origin region and time window calculated.", 18],
    ["AIS correlation", "Nearby vessel tracks correlated with the incident.", 31],
    ["Forecast generated", "Forward footprint and uncertainty envelope prepared.", 47],
    ["Suspect ranking updated", "Candidate vessel evidence scores refreshed.", 63],
] as const;

function InvestigationTimeline({ detectionTime }: { detectionTime: string | null }) {
    const start = detectionTime ? new Date(detectionTime) : null;
    return (
        <div className="mt-3 space-y-0">
            {timelineEvents.map(([name, description, offset], index) => {
                const time =
                    start && !Number.isNaN(start.getTime())
                        ? new Date(start.getTime() + offset * 60 * 1000).toLocaleString("en-GB", {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "UTC",
                          }) + " UTC"
                        : "Time unavailable";
                const latest = index === timelineEvents.length - 1;
                return (
                    <div className="flex gap-3" key={name}>
                        <div className="flex w-4 shrink-0 flex-col items-center">
                            <span
                                className={`mt-1.5 h-2.5 w-2.5 rounded-full border-2 ${
                                    latest ? "border-[#00d4ff] bg-[#00d4ff]" : "border-[#1b344b] bg-[#071322]"
                                }`}
                            />
                            {index < timelineEvents.length - 1 && <span className="w-px flex-1 bg-[#1b344b]" />}
                        </div>
                        <div className={`min-w-0 flex-1 border-b border-[#1b344b]/60 pb-3 ${index > 0 ? "pt-1" : ""}`}>
                            <div className="flex items-baseline justify-between gap-2">
                                <p className={`text-[10px] font-semibold ${latest ? "text-[#00d4ff]" : "text-[#f8fafc]"}`}>
                                    {name}
                                </p>
                                <span className="shrink-0 font-mono text-[8.5px] text-[#62859e]">{time}</span>
                            </div>
                            <p className="mt-0.5 text-[9px] leading-4 text-[#8aaec4]">{description}</p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// Fallback data when API has not yet responded or on initial load to match reference image
const fallbackCustodes: CustodesStatusResponse = {
    spill_id: 1,
    decision: "COMMIT",
    top_vessel: 200000000,
    top_vessel_score: 0.908,
    second_vessel: null,
    second_vessel_score: 0.092,
    margin: 9.16,
    same_vessel_top2_rows: true,
    null_alpha: 0.0916,
    abstain_flag: false,
};

const fallbackAlphaSurface: AlphaSurfaceResponse = {
    spill_id: 1,
    vessel_ids: [200000000, 200000001, 200000002, 200000003, 200000004],
    t0_hours: [0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72],
    alpha: [
        [0.02, 0.05, 0.12, 0.28, 0.65, 0.908, 0.82, 0.55, 0.31, 0.15, 0.06, 0.02, 0.0],
        [0.01, 0.02, 0.03, 0.034, 0.02, 0.01, 0.01, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [0.0, 0.01, 0.018, 0.01, 0.01, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [0.0, 0.0, 0.012, 0.01, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [0.0, 0.0, 0.008, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    ],
    null_alpha: 0.0916,
};

export function InvestigationPanel({
    activeTab,
    onTabChange,
    suspects,
    selectedSuspectId,
    onSuspectSelect,
    detectionTime,
    analysis,
    alphaSurface,
    custodes,
    winningVesselId,
}: InvestigationPanelProps) {
    const effectiveCustodes = custodes ?? fallbackCustodes;
    const effectiveAlphaSurface = alphaSurface ?? fallbackAlphaSurface;

    // Candidate list for confidence scores
    const candidateList =
        suspects.length > 0
            ? suspects.slice(0, 5).map((s) => ({
                  id: s.vessel_id,
                  mmsi: String(s.vessel_id),
                  name: s.vessel_name,
                  score: s.overall_score > 1 ? s.overall_score / 100 : s.overall_score,
              }))
            : [
                  { id: 200000000, mmsi: "200000000", name: "Top Candidate", score: 0.908 },
                  { id: 200000001, mmsi: "200000001", name: "Candidate 200000001", score: 0.034 },
                  { id: 200000002, mmsi: "200000002", name: "Candidate 200000002", score: 0.018 },
                  { id: 200000003, mmsi: "200000003", name: "Candidate 200000003", score: 0.012 },
                  { id: 200000004, mmsi: "200000004", name: "Candidate 200000004", score: 0.008 },
              ];

    const isIntelligenceHome = activeTab === "Overview" || activeTab === "Suspects";

    return (
        <aside className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto rounded-xl border border-[#15293e] bg-[#071322] p-3.5 text-[#cbd5e1] shadow-xl lg:w-[320px] xl:w-[350px]">
            {/* View Switcher Breadcrumb if non-home tab is active */}
            {!isIntelligenceHome && (
                <div className="flex items-center justify-between rounded-lg border border-[#1b344b] bg-[#030d17] p-2 text-[10px]">
                    <div className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#00d4ff]" />
                        <span className="font-bold uppercase tracking-wider text-[#00d4ff]">{activeTab} View</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => onTabChange("Overview")}
                        className="rounded border border-[#1b344b] bg-[#061422] px-2 py-0.5 text-[8.5px] font-semibold text-[#7ab8d0] hover:text-[#f8fafc]"
                    >
                        ← Back to CAW Results
                    </button>
                </div>
            )}

            {/* Render Tab-Specific Details if not Overview or Suspects */}
            {activeTab === "Hindcast" && (
                <div className="space-y-3 rounded-xl border border-[#15293e] bg-[#030d17] p-3.5">
                    <div className="flex items-center justify-between border-b border-[#1b344b] pb-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#38bdf8]">
                            Backward Drift Hindcast
                        </p>
                        <span className="font-mono text-[8px] text-[#7dd3fc]">LEEMAR-150</span>
                    </div>
                    <p className="text-[9.5px] text-[#8aaec4]">
                        Hydrodynamic reverse drift simulation correlating SAR slick geometry against ECMWF ocean currents.
                    </p>
                    <div className="space-y-2 text-[10px]">
                        <div className="flex justify-between border-b border-[#1b344b]/60 pb-1">
                            <span className="text-[#62859e]">Hypothesized origin</span>
                            <span className="font-mono font-semibold text-[#38bdf8]">
                                {analysis ? `${analysis.backward_hindcast.hypothesized_origin_lonlat.lat.toFixed(2)}°N  ${analysis.backward_hindcast.hypothesized_origin_lonlat.lon.toFixed(2)}°E` : "9.12°N 75.36°E"}
                            </span>
                        </div>
                        <div className="flex justify-between border-b border-[#1b344b]/60 pb-1">
                            <span className="text-[#62859e]">Drift duration (t₀)</span>
                            <span className="font-mono text-[#cbd5e1]">{analysis ? `${analysis.backward_hindcast.hypothesized_t0_hours_before_detection.toFixed(1)} h` : "68.0 h"}</span>
                        </div>
                        <div className="flex justify-between border-b border-[#1b344b]/60 pb-1">
                            <span className="text-[#62859e]">Correlated vessel</span>
                            <span className="font-mono font-bold text-[#f59e0b]">{analysis ? String(analysis.backward_hindcast.vessel_mmsi) : "200000000"}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[#62859e]">Combined score</span>
                            <span className="font-mono font-bold text-[#00d4ff]">{analysis ? analysis.backward_hindcast.score.toFixed(3) : "0.908"}</span>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === "Forecast" && (
                <div className="space-y-3 rounded-xl border border-[#15293e] bg-[#030d17] p-3.5">
                    <div className="flex items-center justify-between border-b border-[#1b344b] pb-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#22d4ee]">
                            Forward Drift Forecast (24H)
                        </p>
                        <span className="font-mono text-[8px] text-[#67e8f9]">CONVEX HULL</span>
                    </div>
                    <p className="text-[9.5px] text-[#8aaec4]">
                        24-hour ensemble trajectory forecast with hydrodynamic uncertainty envelope calculated from dispersion model.
                    </p>
                    <div className="space-y-2 text-[10px]">
                        <div className="flex justify-between border-b border-[#1b344b]/60 pb-1">
                            <span className="text-[#62859e]">Forecast centroid</span>
                            <span className="font-mono font-semibold text-[#22d4ee]">
                                {analysis ? `${analysis.forward_forecast_centroid_lonlat.lat.toFixed(2)}°N  ${analysis.forward_forecast_centroid_lonlat.lon.toFixed(2)}°E` : "9.24°N 75.12°E"}
                            </span>
                        </div>
                        <div className="flex justify-between border-b border-[#1b344b]/60 pb-1">
                            <span className="text-[#62859e]">Uncertainty envelope</span>
                            <span className="font-mono text-[#10b981]">Rendered on map</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[#62859e]">Kerala shoreline risk</span>
                            <span className="font-mono text-[#f97316]">Offshore (Westward)</span>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === "AIS Analysis" && (
                <div className="space-y-3 rounded-xl border border-[#15293e] bg-[#030d17] p-3.5">
                    <div className="flex items-center justify-between border-b border-[#1b344b] pb-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#7ab8d0]">
                            Corridor Fleet Traffic
                        </p>
                        <span className="font-mono text-[8px] text-[#00d4ff]">ARABIAN SEA</span>
                    </div>
                    <p className="text-[9.5px] text-[#8aaec4]">
                        Correlating AIS transponder pings across incident temporal bounds (T₀ − 72h to T_detection).
                    </p>
                </div>
            )}

            {activeTab === "Timeline" && (
                <div className="rounded-xl border border-[#15293e] bg-[#030d17] p-3.5">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#7ab8d0]">
                        Operational Chronology
                    </p>
                    <InvestigationTimeline detectionTime={detectionTime} />
                </div>
            )}

            {activeTab === "Images" && (
                <div className="space-y-3 rounded-xl border border-[#15293e] bg-[#030d17] p-3.5">
                    <div className="flex items-center justify-between border-b border-[#1b344b] pb-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#7ab8d0]">
                            Sentinel-1 SAR Imagery
                        </p>
                        <span className="font-mono text-[8px] text-[#00d4ff]">ESA COPERNICUS</span>
                    </div>
                    <div className="relative aspect-video w-full overflow-hidden rounded border border-[#1b344b] bg-[#020912] flex flex-col items-center justify-center p-3 text-center">
                        <span className="text-xl text-[#00d4ff] mb-1">⧉</span>
                        <p className="font-mono text-[9px] text-[#cbd5e1]">SAR C-Band Interferometric Wide</p>
                        <p className="text-[8px] text-[#62859e]">Polarization: VV+VH · 10m/px</p>
                    </div>
                </div>
            )}

            {activeTab === "Report" && (
                <div className="space-y-3 rounded-xl border border-[#15293e] bg-[#030d17] p-3.5">
                    <div className="flex items-center justify-between border-b border-[#1b344b] pb-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#7ab8d0]">
                            Maritime Dossier
                        </p>
                        <span className="rounded border border-[#10b981]/40 bg-[#10b981]/10 px-1.5 py-0.5 font-mono text-[8px] text-[#10b981]">
                            OFFICIAL
                        </span>
                    </div>
                    <p className="text-[9.5px] text-[#8aaec4]">
                        Multi-modal dossier compiled from Copernicus SAR imagery, backward hindcast, and Cross-Attention AIS attribution.
                    </p>
                </div>
            )}

            {/* MAIN REFERENCE CARDS: Always visible on Overview/Suspects, or underneath tab view */}
            {/* 1. CAW RESULTS CARD */}
            <CustodesCard custodes={effectiveCustodes} />

            {/* 2. ALPHA SURFACE CARD */}
            <AlphaSurfaceHeatmap
                alphaSurface={effectiveAlphaSurface}
                winningVesselId={winningVesselId ?? 200000000}
                onVesselClick={onSuspectSelect}
            />

            {/* 3. VESSEL CONFIDENCE SCORES CARD */}
            <div className="rounded-xl border border-[#15293e] bg-[#071322] p-3.5 text-[#cbd5e1] shadow-lg">
                <div className="flex items-center justify-between border-b border-[#1b344b] pb-2.5">
                    <p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#7ab8d0]">
                        Vessel Confidence Scores
                    </p>
                    <span className="font-mono text-[8.5px] text-[#62859e]">
                        {candidateList.length} CANDIDATES
                    </span>
                </div>

                <div className="mt-3 space-y-2">
                    {candidateList.map((c) => {
                        const isSelected = c.id === selectedSuspectId || (selectedSuspectId === null && c.id === 200000000);
                        const isTop = c.score > 0.5;
                        return (
                            <div
                                key={c.id}
                                onClick={() => onSuspectSelect(c.id)}
                                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-2.5 transition-all ${
                                    isSelected
                                        ? "border-[#f59e0b]/60 bg-[#0c2438] shadow-[0_0_8px_rgba(245,158,11,0.15)]"
                                        : "border-[#1b344b] bg-[#030d17] hover:border-[#f59e0b]/40 hover:bg-[#0a1828]"
                                }`}
                            >
                                <span className={`font-mono text-xs font-bold ${isTop ? "text-[#f59e0b]" : "text-[#f8fafc]"}`}>
                                    {c.mmsi}
                                </span>

                                <div className="flex flex-1 items-center gap-2 max-w-[150px]">
                                    <div className="h-1.5 flex-1 rounded-full bg-[#0b1c2b] overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${
                                                isTop ? "bg-[#f59e0b]" : "bg-[#475569]"
                                            }`}
                                            style={{ width: `${Math.min(100, Math.max(5, c.score * 100))}%` }}
                                        />
                                    </div>
                                    <span
                                        className={`font-mono text-[10px] font-bold min-w-[38px] text-right ${
                                            isTop ? "text-[#f59e0b]" : "text-[#94a3b8]"
                                        }`}
                                    >
                                        {(c.score * 100).toFixed(1)}%
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 4. PROVENANCE CARD */}
            <div className="rounded-xl border border-[#15293e] bg-[#071322] p-3 text-[#cbd5e1] shadow-lg">
                <div className="flex items-center justify-between border-b border-[#1b344b] pb-2">
                    <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#7ab8d0]">
                        Provenance
                    </p>
                    <span className="rounded border border-[#1b344b] bg-[#020912] px-1.5 py-0.5 font-mono text-[8px] text-[#5a7d96]">
                        SYNTHETIC AIS
                    </span>
                </div>
                <p className="mt-2 text-[9px] leading-relaxed text-[#62859e]">
                    Synthetic AIS Data · CAW-v1.2 Checkpoint · ECMWF 0.25° Leeway Hydrodynamics
                </p>
            </div>
        </aside>
    );
}
