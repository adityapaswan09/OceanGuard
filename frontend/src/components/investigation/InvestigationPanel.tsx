import {
    CUSTODES_CHECKPOINT_PRECISION,
    type AlphaSurfaceResponse,
    type CustodesStatusResponse,
    type SpillAnalysis,
    type SuspectCandidate,
} from "../../types/intelligence";
import { AlphaSurfaceHeatmap } from "./AlphaSurfaceHeatmap";
import { CustodesCard } from "./CustodesCard";

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
    identified,
    onIdentifySuspects,
    identifyLoading,
    identifyError,
}: InvestigationPanelProps) {
    const isIntelligenceHome = activeTab === "Overview" || activeTab === "Suspects";

    // Top 5 candidates sorted strictly by backend overall_score descending
    const sortedSuspects = [...suspects].sort((a, b) => b.overall_score - a.overall_score).slice(0, 5);
    const maxScore = sortedSuspects.length > 0 && sortedSuspects[0].overall_score > 0 ? sortedSuspects[0].overall_score : 1;

    return (
        <aside className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto rounded-xl border border-[#15293e] bg-[#071322] p-3 text-[#cbd5e1] shadow-xl lg:w-[320px] xl:w-[350px]">
            {/* Top Action Header: Identify Suspects trigger and status */}
            <div className="flex items-center justify-between rounded-xl border border-[#1b344b] bg-[#030d17] p-2.5">
                <div>
                    <div className="flex items-center gap-1.5">
                        <span
                            className={`h-1.5 w-1.5 rounded-full ${
                                identifyLoading
                                    ? "bg-[#00d4ff] animate-ping"
                                    : identified
                                    ? "bg-[#10b981]"
                                    : "bg-[#64748b]"
                            }`}
                        />
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#7ab8d0]">
                            Attribution Engine
                        </p>
                    </div>
                    <p className="mt-0.5 text-[8.5px] text-[#62859e]">
                        {identifyLoading
                            ? "Analyzing candidate trajectories…"
                            : identified
                            ? "Custodes evaluation resolved"
                            : "Standby · Ready to analyze"}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onIdentifySuspects}
                    disabled={identifyLoading}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[9.5px] font-bold uppercase tracking-wider transition ${
                        identifyLoading
                            ? "border-[#1b344b] bg-[#0b2238] text-[#62859e] cursor-wait"
                            : identified
                            ? "border-[#0070f3]/60 bg-[#0070f3]/15 text-[#38bdf8] hover:bg-[#0070f3] hover:text-white"
                            : "border-[#0070f3] bg-[#0070f3] text-white hover:bg-[#0060df] shadow-[0_0_12px_rgba(0,112,243,0.4)]"
                    }`}
                >
                    <span className={identifyLoading ? "animate-spin" : ""}>⟳</span>
                    <span>
                        {identifyLoading
                            ? "IDENTIFYING…"
                            : identified
                            ? "RE-RUN IDENTIFICATION"
                            : "IDENTIFY SUSPECTS"}
                    </span>
                </button>
            </div>

            {identifyError && (
                <div className="rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 p-2.5 text-[9.5px] text-[#ef4444]">
                    Attribution request failed. Check network connection or pipeline status.
                </div>
            )}

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
                        ← Back to Overview
                    </button>
                </div>
            )}

            {/* Render Tab-Specific Details if not Overview or Suspects */}
            {activeTab === "Hindcast" && (
                <div className="space-y-3 rounded-xl border border-[#15293e] bg-[#030d17] p-3">
                    <div className="flex items-center justify-between border-b border-[#1b344b] pb-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#38bdf8]">
                            Backward Drift Hindcast
                        </p>
                        <span className="font-mono text-[8px] text-[#7dd3fc]">LEEMAR-150</span>
                    </div>
                    <p className="text-[9px] text-[#8aaec4]">
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
                            <span className="font-mono font-bold text-[#f59e0b]">
                                {identified && custodes?.top_vessel ? `MMSI ${custodes.top_vessel}` : "Pending identification"}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[#62859e]">Attribution score</span>
                            <span className="font-mono font-bold text-[#00d4ff]">
                                {identified && custodes?.top_vessel_score !== null && custodes?.top_vessel_score !== undefined
                                    ? `${(custodes.top_vessel_score * 100).toFixed(1)}%`
                                    : "—"}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === "Forecast" && (
                <div className="space-y-3 rounded-xl border border-[#15293e] bg-[#030d17] p-3">
                    <div className="flex items-center justify-between border-b border-[#1b344b] pb-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#22d4ee]">
                            Forward Drift Forecast (24H)
                        </p>
                        <span className="font-mono text-[8px] text-[#67e8f9]">CONVEX HULL</span>
                    </div>
                    <p className="text-[9px] text-[#8aaec4]">
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
                <div className="space-y-3 rounded-xl border border-[#15293e] bg-[#030d17] p-3">
                    <div className="flex items-center justify-between border-b border-[#1b344b] pb-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#7ab8d0]">
                            Corridor Fleet Traffic
                        </p>
                        <span className="font-mono text-[8px] text-[#00d4ff]">ARABIAN SEA</span>
                    </div>
                    <p className="text-[9px] text-[#8aaec4]">
                        Correlating AIS candidate tracks across incident temporal bounds (t₀ − 72h to detection).
                    </p>
                </div>
            )}

            {activeTab === "Timeline" && (
                <div className="rounded-xl border border-[#15293e] bg-[#030d17] p-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#7ab8d0]">
                        Operational Chronology
                    </p>
                    <InvestigationTimeline detectionTime={detectionTime} />
                </div>
            )}

            {activeTab === "Images" && (
                <div className="space-y-3 rounded-xl border border-[#15293e] bg-[#030d17] p-3">
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
                <div className="space-y-3 rounded-xl border border-[#15293e] bg-[#030d17] p-3">
                    <div className="flex items-center justify-between border-b border-[#1b344b] pb-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#7ab8d0]">
                            Maritime Dossier
                        </p>
                        <span className="rounded border border-[#10b981]/40 bg-[#10b981]/10 px-1.5 py-0.5 font-mono text-[8px] text-[#10b981]">
                            OFFICIAL
                        </span>
                    </div>
                    <p className="text-[9px] text-[#8aaec4]">
                        Multi-modal dossier compiled from Copernicus SAR imagery, backward hindcast, and Cross-Attention AIS attribution.
                    </p>
                </div>
            )}

            {/* 1. CUSTODES DECISION & METRICS CARD */}
            <CustodesCard
                custodes={custodes}
                identified={identified}
                loading={identifyLoading}
            />

            {/* 2. ALPHA SURFACE HEATMAP CARD */}
            <AlphaSurfaceHeatmap
                alphaSurface={alphaSurface}
                winningVesselId={winningVesselId}
                identified={identified}
                loading={identifyLoading}
                onVesselClick={onSuspectSelect}
            />

            {/* 3. TOP 5 CANDIDATES (Bound to actual overall_score sorted descending) */}
            <div className="rounded-xl border border-[#15293e] bg-[#071322] p-3.5 text-[#cbd5e1] shadow-lg">
                <div className="flex items-center justify-between border-b border-[#1b344b] pb-2.5">
                    <div>
                        <p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#7ab8d0]">
                            Top 5 Candidates
                        </p>
                        <p className="text-[8px] text-[#62859e]">Ranked by overall attribution score</p>
                    </div>
                    <span className="font-mono text-[8px] text-[#62859e]">
                        {identified ? "overall_score" : "STANDBY"}
                    </span>
                </div>

                <div className="mt-2.5 space-y-1.5">
                    {identified && sortedSuspects.length > 0 ? (
                        sortedSuspects.map((candidate, idx) => {
                            const isSelected = candidate.vessel_id === selectedSuspectId;
                            const isTop = idx === 0 && candidate.overall_score > 0.1;
                            const scoreFormatted = candidate.overall_score.toFixed(3);
                            const barWidth = Math.min(100, Math.max(4, (candidate.overall_score / maxScore) * 100));

                            return (
                                <div
                                    key={candidate.vessel_id}
                                    onClick={() => onSuspectSelect(candidate.vessel_id)}
                                    className={`flex items-center justify-between gap-2.5 rounded-lg border px-2.5 py-1.5 cursor-pointer transition ${
                                        isSelected
                                            ? "border-[#f59e0b]/70 bg-[#0c2438] shadow-[0_0_8px_rgba(245,158,11,0.15)]"
                                            : "border-[#1b344b] bg-[#030d17] hover:border-[#f59e0b]/40 hover:bg-[#0a1828]"
                                    }`}
                                >
                                    <div className="flex items-center gap-2 min-w-[130px]">
                                        <span className="font-mono text-[10px] font-bold text-[#62859e]">
                                            #{idx + 1}
                                        </span>
                                        <span
                                            className={`font-mono text-xs font-bold ${
                                                isTop ? "text-[#f59e0b]" : "text-[#f8fafc]"
                                            }`}
                                        >
                                            MMSI {candidate.vessel_id}
                                        </span>
                                    </div>

                                    <div className="flex flex-1 items-center gap-2 max-w-[120px]">
                                        <div className="h-1.5 flex-1 rounded-full bg-[#0b1c2b] overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${
                                                    isTop ? "bg-[#f59e0b]" : "bg-[#475569]"
                                                }`}
                                                style={{ width: `${barWidth}%` }}
                                            />
                                        </div>
                                        <span
                                            className={`font-mono text-[10px] font-bold min-w-[34px] text-right ${
                                                isTop ? "text-[#f59e0b]" : "text-[#94a3b8]"
                                            }`}
                                        >
                                            {scoreFormatted}
                                        </span>
                                    </div>
                                </div>
                            );
                        })
                    ) : identifyLoading ? (
                        // Loading skeleton rows
                        [1, 2, 3, 4, 5].map((num) => (
                            <div
                                key={num}
                                className="flex items-center justify-between gap-2.5 rounded-lg border border-[#1b344b] bg-[#030d17] px-2.5 py-1.5 opacity-60"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-[10px] text-[#62859e]">#{num}</span>
                                    <span className="font-mono text-[10px] text-[#64748b]">Evaluating…</span>
                                </div>
                                <span className="font-mono text-[10px] text-[#62859e]">…</span>
                            </div>
                        ))
                    ) : (
                        // Standby empty rows (no fake values before identification)
                        [1, 2, 3, 4, 5].map((num) => (
                            <div
                                key={num}
                                className="flex items-center justify-between gap-2.5 rounded-lg border border-[#1b344b]/60 bg-[#030d17]/50 px-2.5 py-1.5"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-[10px] text-[#62859e]">#{num}</span>
                                    <span className="font-mono text-[10px] text-[#64748b]">—</span>
                                </div>
                                <span className="font-mono text-[10px] text-[#62859e]">—</span>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* 4. PROVENANCE & METHODOLOGY CARD */}
            <div className="rounded-xl border border-[#15293e] bg-[#071322] p-3 text-[#cbd5e1] shadow-lg">
                <div className="flex items-center justify-between border-b border-[#1b344b] pb-2">
                    <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#7ab8d0]">
                        Provenance & Methodology
                    </p>
                    <span className="rounded border border-[#1b344b] bg-[#020912] px-1.5 py-0.5 font-mono text-[7.5px] text-[#5a7d96]">
                        SYNTHETIC AIS
                    </span>
                </div>
                <div className="mt-2 space-y-1.5 text-[8.5px] leading-relaxed text-[#62859e]">
                    <p>
                        • AIS candidate tracks are synthetic demo data generated for pipeline validation.
                    </p>
                    <p>
                        • CAW/Custodes uses the validated attention checkpoint ({CUSTODES_CHECKPOINT_PRECISION}).
                    </p>
                    <p>
                        • Attribution scores represent ranked candidate probabilities, not a declaration of legal culpability.
                    </p>
                </div>
            </div>
        </aside>
    );
}
