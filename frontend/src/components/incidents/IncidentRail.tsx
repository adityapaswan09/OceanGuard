import type { CustodesStatusResponse, SpillAnalysis } from "../../types/intelligence";

interface IncidentRailProps {
    analysis: SpillAnalysis | null;
    onIdentifySuspects?: () => void;
    identifyLoading?: boolean;
    identified?: boolean;
    identifyError?: boolean;
    custodes?: CustodesStatusResponse | null;
    identifiedAt?: string | null;
}

function formatUtcDateTime(timestampSeconds?: number | null): string {
    if (!timestampSeconds || Number.isNaN(timestampSeconds)) return "—";
    const date = new Date(timestampSeconds * 1000);
    if (Number.isNaN(date.getTime())) return "—";
    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = date.toLocaleString("en-GB", { month: "short", timeZone: "UTC" }).toUpperCase();
    const year = date.getUTCFullYear();
    const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
    return `${day} ${month} ${year} / ${time} UTC`;
}

function formatUtcTime(timestampSeconds?: number | null): string {
    if (!timestampSeconds || Number.isNaN(timestampSeconds)) return "—";
    const date = new Date(timestampSeconds * 1000);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

function formatIsoUtcTime(isoString?: string | null): string {
    if (!isoString) return "—";
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" }) + " UTC";
}

export function IncidentRail({
    analysis,
    onIdentifySuspects,
    identifyLoading = false,
    identified = false,
    identifyError = false,
    custodes = null,
    identifiedAt = null,
}: IncidentRailProps) {
    // 1. Truthful Incident Overview extraction from analysis response
    const detectionTimestamp = analysis?.detection?.detection_timestamp ?? null;
    const detectionTimeText = formatUtcDateTime(detectionTimestamp);

    const confidenceText =
        analysis?.detection?.confidence !== undefined && analysis?.detection?.confidence !== null
            ? `${(analysis.detection.confidence * 100).toFixed(1)}%`
            : "—";

    const coordsText =
        analysis?.detection?.centroid_latlon
            ? `${analysis.detection.centroid_latlon.lat.toFixed(4)}°N · ${analysis.detection.centroid_latlon.lon.toFixed(4)}°E`
            : "—";

    const areaText =
        analysis?.detection?.physical_area_km2 !== undefined && analysis?.detection?.physical_area_km2 !== null
            ? `${analysis.detection.physical_area_km2.toFixed(2)} km²`
            : "—";

    const ageText =
        analysis?.age_estimate_hours !== undefined && analysis?.age_estimate_hours !== null
            ? `${analysis.age_estimate_hours.toFixed(1)} h`
            : "—";

    // 2. Key Metrics logic
    const isAnalyzing = identifyLoading;
    const isIdentified = identified && custodes !== null && !identifyLoading;
    const isAbstain = isIdentified && (custodes.decision === "ABSTAIN" || custodes.top_vessel === null);

    // Top Vessel Score
    let topVesselScoreText = "—";
    if (isAnalyzing) {
        topVesselScoreText = "ANALYZING…";
    } else if (isIdentified) {
        if (isAbstain) {
            topVesselScoreText = "—";
        } else if (custodes.top_vessel_score !== null && custodes.top_vessel_score !== undefined) {
            topVesselScoreText = `${(custodes.top_vessel_score * 100).toFixed(1)}%`;
        }
    }

    // Null Hypothesis
    const nullAlphaVal = custodes?.null_alpha ?? null;
    let nullHypothesisText = "—";
    if (isAnalyzing) {
        nullHypothesisText = "ANALYZING…";
    } else if (isIdentified && nullAlphaVal !== null && nullAlphaVal !== undefined) {
        nullHypothesisText = `${(nullAlphaVal * 100).toFixed(2)}%`;
    }

    // CAW Winner
    let cawWinnerText = "—";
    if (isAnalyzing) {
        cawWinnerText = "ANALYZING…";
    } else if (isIdentified) {
        if (isAbstain) {
            cawWinnerText = "None — abstained";
        } else if (custodes.top_vessel !== null && custodes.top_vessel !== undefined) {
            cawWinnerText = `MMSI ${custodes.top_vessel}`;
        } else {
            cawWinnerText = "None — abstained";
        }
    }

    // 3. Pipeline Timestamps for Latest Updates
    const detectionStageTime = formatUtcTime(detectionTimestamp);

    const hindcastOriginTs =
        detectionTimestamp !== null && analysis?.backward_hindcast?.hypothesized_t0_hours_before_detection !== undefined
            ? detectionTimestamp - analysis.backward_hindcast.hypothesized_t0_hours_before_detection * 3600
            : null;
    const hindcastStageTime = formatUtcTime(hindcastOriginTs);

    const forecastTs = detectionTimestamp !== null ? detectionTimestamp + 24 * 3600 : null;
    const forecastStageTime = formatUtcTime(forecastTs);

    const identificationStageTime = isAnalyzing
        ? "ANALYZING…"
        : isIdentified && identifiedAt
        ? formatIsoUtcTime(identifiedAt)
        : "—";

    return (
        <aside className="flex w-full shrink-0 flex-col overflow-y-auto rounded-xl border border-[#15293e] bg-[#071322] p-3.5 text-[#cbd5e1] shadow-xl lg:w-[290px] xl:w-[310px]">
            {/* 1. INCIDENT OVERVIEW */}
            <div>
                <p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#7ab8d0]">
                    Incident Overview
                </p>
                <div className="mt-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-[#ef4444] animate-pulse" />
                        <span className="text-sm font-bold text-[#ef4444]">Oil Spill Detected</span>
                    </div>
                    {confidenceText !== "—" && (
                        <span className="rounded border border-[#ef4444]/40 bg-[#ef4444]/15 px-1.5 py-0.5 font-mono text-[8.5px] font-semibold text-[#fca5a5]">
                            {confidenceText} conf
                        </span>
                    )}
                </div>

                <div className="mt-2.5 space-y-1.5 text-[10px]">
                    <div className="flex items-center justify-between border-b border-[#1b344b]/60 pb-1">
                        <span className="text-[#62859e]">Detected at</span>
                        <span className="font-mono text-[#cbd5e1]">{detectionTimeText}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-[#1b344b]/60 pb-1">
                        <span className="text-[#62859e]">Coordinates</span>
                        <span className="font-mono text-[#8aaec4]">{coordsText}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-[#1b344b]/60 pb-1">
                        <span className="text-[#62859e]">Spill area</span>
                        <span className="font-mono font-semibold text-[#f8fafc]">{areaText}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[#62859e]">Estimated age</span>
                        <span className="font-mono text-[#cbd5e1]">{ageText}</span>
                    </div>
                </div>
            </div>

            {/* Satellite Map Preview Thumbnail */}
            <div className="mt-3 overflow-hidden rounded-lg border border-[#1b344b] bg-[#020b14] relative aspect-[16/9] shadow-inner">
                {/* Visual Satellite Texture Overlay */}
                <div
                    className="absolute inset-0 bg-cover bg-center opacity-85"
                    style={{
                        backgroundImage: `radial-gradient(circle at 50% 50%, rgba(2, 132, 199, 0.25), transparent 70%), linear-gradient(135deg, #021a30 0%, #032442 50%, #011424 100%)`,
                    }}
                />
                {/* Grid Overlay lines */}
                <div className="absolute inset-0 opacity-20 bg-[linear-gradient(to_right,#00d4ff_1px,transparent_1px),linear-gradient(to_bottom,#00d4ff_1px,transparent_1px)] [background-size:20px_20px]" />
                {/* SAR Detected Irregular Slick Shape */}
                <svg className="absolute inset-0 h-full w-full pointer-events-none" viewBox="0 0 200 120" preserveAspectRatio="xMidYMid meet">
                    {/* Outer irregular slick */}
                    <polygon
                        points="57.1,25.1 68.0,21.5 80.7,17.3 94.3,26.0 113.3,28.7 126.0,41.4 137.8,55.9 147.7,81.3 141.4,95.8 125.1,93.0 107.9,99.4 88.9,94.9 76.2,81.3 64.4,69.5 60.8,52.3 56.2,37.8"
                        fill="#dc2626"
                        fillOpacity="0.25"
                        stroke="#ef4444"
                        strokeWidth="1.4"
                        strokeLinejoin="round"
                    />
                    {/* Dense interior core */}
                    <polygon
                        points="75.1,39.8 81.4,37.6 88.8,35.2 96.7,40.3 107.7,41.9 115.1,49.2 121.9,57.6 127.7,72.3 124.0,80.7 114.6,79.2 104.6,82.8 93.5,80.2 86.2,72.3 79.3,65.5 77.2,55.5 74.6,47.1"
                        fill="#991b1b"
                        fillOpacity="0.45"
                        stroke="#dc2626"
                        strokeWidth="0.9"
                        strokeLinejoin="round"
                    />
                    {/* Crisp centroid dot */}
                    <circle cx="100" cy="60" r="2.5" fill="#ef4444" stroke="#ffffff" strokeWidth="1" />
                </svg>
                <span className="absolute bottom-1.5 right-2 rounded bg-[#020912]/80 px-1.5 py-0.5 font-mono text-[8px] text-[#00d4ff]">
                    SAR C-BAND
                </span>
            </div>

            {/* 2. KEY METRICS (3 Balanced Cards) */}
            <div className="mt-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#7ab8d0]">
                    Key Metrics
                </p>
                <div className="space-y-2">
                    {/* Top row: Top Vessel Score and Null Hypothesis */}
                    <div className="grid grid-cols-2 gap-2">
                        {/* Top Vessel Score */}
                        <div className="rounded-lg border border-[#1b344b] bg-[#030d17] p-2.5">
                            <p className="text-[8.5px] font-semibold uppercase tracking-wider text-[#62859e]">
                                Top Vessel Score
                            </p>
                            <p
                                className={`mt-1 font-mono text-base font-bold ${
                                    isAnalyzing
                                        ? "text-[11px] text-[#00d4ff] animate-pulse"
                                        : isAbstain || topVesselScoreText === "—"
                                        ? "text-[#64748b]"
                                        : "text-[#10b981]"
                                }`}
                            >
                                {topVesselScoreText}
                            </p>
                        </div>

                        {/* Null Hypothesis */}
                        <div className="rounded-lg border border-[#1b344b] bg-[#030d17] p-2.5">
                            <p className="text-[8.5px] font-semibold uppercase tracking-wider text-[#62859e]">
                                Null Hypothesis
                            </p>
                            <p
                                className={`mt-1 font-mono text-base font-bold ${
                                    isAnalyzing
                                        ? "text-[11px] text-[#00d4ff] animate-pulse"
                                        : nullHypothesisText === "—"
                                        ? "text-[#64748b]"
                                        : "text-[#f8fafc]"
                                }`}
                            >
                                {nullHypothesisText}
                            </p>
                        </div>
                    </div>

                    {/* Bottom row: CAW Winner full-width card */}
                    <div className="rounded-lg border border-[#1b344b] bg-[#030d17] px-3 py-2 flex items-center justify-between">
                        <p className="text-[8.5px] font-semibold uppercase tracking-wider text-[#62859e]">
                            CAW Winner
                        </p>
                        <p
                            className={`font-mono text-xs font-bold truncate ${
                                isAnalyzing
                                    ? "text-[#00d4ff] animate-pulse"
                                    : isAbstain
                                    ? "text-[#ef4444]"
                                    : cawWinnerText === "—"
                                    ? "text-[#64748b]"
                                    : "text-[#f59e0b]"
                            }`}
                            title={cawWinnerText}
                        >
                            {cawWinnerText}
                        </p>
                    </div>
                </div>
            </div>

            {/* 3. LATEST UPDATES (4 Pipeline Stages) */}
            <div className="mt-4">
                <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#7ab8d0]">
                        Latest Updates
                    </p>
                    <span className="flex items-center gap-1 rounded bg-[#10b981]/15 border border-[#10b981]/40 px-1.5 py-0.5 text-[8.5px] font-bold text-[#10b981]">
                        Pipeline <span className="text-[9px]">✓</span>
                    </span>
                </div>

                <div className="mt-2.5 space-y-2.5 border-l border-[#1b344b] pl-3 text-[9.5px]">
                    {/* Stage 1: DETECTION */}
                    <div className="relative">
                        <span className="absolute -left-[16px] top-1 h-2 w-2 rounded-full border border-[#0284c7] bg-[#0284c7]" />
                        <div className="flex items-center justify-between">
                            <span className="font-semibold text-[#f8fafc]">
                                Detection
                            </span>
                            <span className="font-mono text-[8px] text-[#62859e]">
                                {detectionStageTime}
                            </span>
                        </div>
                        <p className="text-[8.5px] text-[#62859e]">
                            SAR slick boundary & centroid resolved
                        </p>
                    </div>

                    {/* Stage 2: HINDCAST */}
                    <div className="relative">
                        <span className="absolute -left-[16px] top-1 h-2 w-2 rounded-full border border-[#0284c7] bg-[#0284c7]" />
                        <div className="flex items-center justify-between">
                            <span className="font-semibold text-[#cbd5e1]">
                                Hindcast
                            </span>
                            <span className="font-mono text-[8px] text-[#62859e]">
                                {hindcastStageTime}
                            </span>
                        </div>
                        <p className="text-[8.5px] text-[#62859e]">
                            {analysis?.backward_hindcast
                                ? `Reverse drift simulation (t₀ = -${analysis.backward_hindcast.hypothesized_t0_hours_before_detection.toFixed(1)}h)`
                                : "Backward trajectory estimated"}
                        </p>
                    </div>

                    {/* Stage 3: FORECAST */}
                    <div className="relative">
                        <span className="absolute -left-[16px] top-1 h-2 w-2 rounded-full border border-[#0284c7] bg-[#0284c7]" />
                        <div className="flex items-center justify-between">
                            <span className="font-semibold text-[#cbd5e1]">
                                Forecast
                            </span>
                            <span className="font-mono text-[8px] text-[#62859e]">
                                {forecastStageTime}
                            </span>
                        </div>
                        <p className="text-[8.5px] text-[#62859e]">
                            24h forward trajectory & uncertainty
                        </p>
                    </div>

                    {/* Stage 4: IDENTIFICATION */}
                    <div className="relative">
                        <span
                            className={`absolute -left-[16px] top-1 h-2 w-2 rounded-full border ${
                                isAnalyzing
                                    ? "border-[#00d4ff] bg-[#00d4ff] animate-ping"
                                    : isIdentified
                                    ? isAbstain
                                        ? "border-[#ef4444] bg-[#ef4444]"
                                        : "border-[#10b981] bg-[#10b981] shadow-[0_0_6px_rgba(16,185,129,0.8)]"
                                    : "border-[#1b344b] bg-[#071322]"
                            }`}
                        />
                        <div className="flex items-center justify-between">
                            <span
                                className={`font-semibold ${
                                    isAnalyzing
                                        ? "text-[#00d4ff]"
                                        : isIdentified
                                        ? "text-[#f8fafc]"
                                        : "text-[#62859e]"
                                }`}
                            >
                                Identification
                            </span>
                            <span
                                className={`font-mono text-[8px] ${
                                    isAnalyzing ? "text-[#00d4ff] animate-pulse" : "text-[#62859e]"
                                }`}
                            >
                                {identificationStageTime}
                            </span>
                        </div>
                        <p
                            className={`text-[8.5px] ${
                                isAnalyzing
                                    ? "text-[#7ab8d0]"
                                    : isIdentified
                                    ? isAbstain
                                        ? "text-[#ef4444]"
                                        : "text-[#7ab8d0]"
                                    : "text-[#475569]"
                            }`}
                        >
                            {isAnalyzing
                                ? "Resolving candidate attribution…"
                                : isIdentified
                                ? isAbstain
                                    ? "Custodes decision: ABSTAIN (no confident match)"
                                    : `Custodes decision: ${custodes?.decision ?? "COMMIT"}`
                                : "Awaiting identification run"}
                        </p>
                    </div>
                </div>
            </div>

            {/* 4. ACTION BUTTON: IDENTIFY SUSPECTS / RE-RUN IDENTIFICATION */}
            <div className="mt-4 pt-2 border-t border-[#1b344b]/60">
                <button
                    type="button"
                    onClick={onIdentifySuspects}
                    disabled={identifyLoading}
                    className={`w-full flex items-center justify-center gap-2 rounded-lg py-2.5 px-4 text-xs font-bold uppercase tracking-wider transition-all shadow-lg ${
                        identifyLoading
                            ? "bg-[#0b2238] text-[#62859e] border border-[#1b344b] cursor-wait"
                            : identified
                            ? "bg-[#0070f3]/20 hover:bg-[#0070f3] text-[#38bdf8] hover:text-white border border-[#0070f3]/60"
                            : "bg-[#0070f3] hover:bg-[#0060df] text-white shadow-[0_0_15px_rgba(0,112,243,0.3)]"
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
                <p className="mt-1.5 text-center font-mono text-[8.5px] text-[#5a7d96]">
                    {identifyLoading
                        ? "Executing CAW Cross-Attention analysis…"
                        : isIdentified && identifiedAt
                        ? `Resolved at ${formatIsoUtcTime(identifiedAt)}`
                        : "Standby · Ready to identify"}
                </p>
                {identifyError && (
                    <p className="mt-1 text-center text-[8.5px] text-[#ef4444]">
                        Identification service unavailable
                    </p>
                )}
            </div>
        </aside>
    );
}