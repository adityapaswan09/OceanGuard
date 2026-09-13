import type { AlphaSurfaceResponse, CustodesStatusResponse, SpillAnalysis } from "../../types/intelligence";

interface IncidentRailProps {
    analysis: SpillAnalysis | null;
    onIdentifySuspects?: () => void;
    identifyLoading?: boolean;
    identified?: boolean;
    identifyError?: boolean;
    custodes?: CustodesStatusResponse | null;
    alphaSurface?: AlphaSurfaceResponse | null;
}

export function IncidentRail({
    analysis,
    onIdentifySuspects,
    identifyLoading = false,
    identified = false,
    identifyError = false,
    custodes = null,
}: IncidentRailProps) {
    const lat = analysis ? analysis.detection.centroid_latlon.lat.toFixed(2) : "9.12";
    const lon = analysis ? analysis.detection.centroid_latlon.lon.toFixed(2) : "75.36";
    const topScore = custodes?.top_vessel_score != null ? `${(custodes.top_vessel_score * 100).toFixed(1)}%` : "90.8%";
    const nullScore = custodes?.null_alpha != null ? `${(custodes.null_alpha * 100).toFixed(2)}%` : "9.16%";
    const winnerMmsi = custodes?.top_vessel != null ? `MMSI ${custodes.top_vessel}` : "MMSI 200000000";

    return (
        <aside className="flex w-full shrink-0 flex-col overflow-y-auto rounded-xl border border-[#15293e] bg-[#071322] p-4 text-[#cbd5e1] shadow-xl lg:w-[290px] xl:w-[310px]">
            {/* Header */}
            <div>
                <p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#7ab8d0]">
                    Incident Overview
                </p>
                <div className="mt-1 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#ef4444] animate-pulse" />
                    <span className="text-sm font-bold text-[#ef4444]">Oil Spill Detected</span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-[10px] text-[#62859e]">
                    <span>06 SEP 2026 / 12:42 UTC</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-[#8aaec4]">
                    <span>📍</span>
                    <span>{lat}° N</span>
                    <span>{lon}° E</span>
                </div>
            </div>

            {/* Satellite Map Preview Thumbnail */}
            <div className="mt-3 overflow-hidden rounded-lg border border-[#1b344b] bg-[#020b14] relative aspect-[16/9] shadow-inner">
                {/* Visual Satellite Texture Overlay */}
                <div
                    className="absolute inset-0 bg-cover bg-center opacity-85"
                    style={{
                        backgroundImage: `radial-gradient(circle at 45% 50%, rgba(2, 132, 199, 0.4), transparent 60%), radial-gradient(circle at 50% 50%, rgba(220, 38, 38, 0.5), transparent 30%), linear-gradient(135deg, #021a30 0%, #032d52 50%, #011424 100%)`,
                    }}
                />
                {/* Red Detection Bounding Box from reference */}
                <div className="absolute left-[38%] top-[30%] h-9 w-9 rounded-sm border-2 border-[#ef4444] shadow-[0_0_8px_rgba(239,68,68,0.6)] flex items-center justify-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#ef4444]" />
                </div>
                {/* Grid Overlay lines */}
                <div className="absolute inset-0 opacity-20 bg-[linear-gradient(to_right,#00d4ff_1px,transparent_1px),linear-gradient(to_bottom,#00d4ff_1px,transparent_1px)] [background-size:24px_24px]" />
                <span className="absolute bottom-1.5 right-2 rounded bg-[#020912]/80 px-1.5 py-0.5 font-mono text-[8px] text-[#00d4ff]">
                    SAR C-BAND
                </span>
            </div>

            {/* Latest Updates Timeline */}
            <div className="mt-4">
                <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#7ab8d0]">
                        Latest Updates
                    </p>
                    <span className="flex items-center gap-1 rounded bg-[#10b981]/15 border border-[#10b981]/40 px-1.5 py-0.5 text-[8.5px] font-bold text-[#10b981]">
                        Live <span className="text-[9px]">⟳</span>
                    </span>
                </div>

                <div className="mt-2.5 space-y-2 border-l border-[#1b344b] pl-3 text-[9.5px]">
                    <div className="relative">
                        <span className="absolute -left-[16px] top-1 h-2 w-2 rounded-full border border-[#00d4ff] bg-[#00d4ff] shadow-[0_0_6px_rgba(0,212,255,0.8)]" />
                        <div className="flex items-center justify-between">
                            <span className="font-semibold text-[#f8fafc]">CAW Analysis Completed</span>
                            <span className="font-mono text-[8px] text-[#62859e]">09:21 UTC</span>
                        </div>
                        <p className="text-[8.5px] text-[#7ab8d0]">Top vessel identified with 90.8% score</p>
                    </div>

                    <div className="relative">
                        <span className="absolute -left-[16px] top-1 h-2 w-2 rounded-full border border-[#0284c7] bg-[#0284c7]" />
                        <div className="flex items-center justify-between">
                            <span className="font-semibold text-[#cbd5e1]">Alpha Surface Generated</span>
                            <span className="font-mono text-[8px] text-[#62859e]">09:18 UTC</span>
                        </div>
                        <p className="text-[8.5px] text-[#62859e]">20 × 30 km resolution</p>
                    </div>

                    <div className="relative">
                        <span className="absolute -left-[16px] top-1 h-2 w-2 rounded-full border border-[#0284c7] bg-[#0284c7]" />
                        <div className="flex items-center justify-between">
                            <span className="font-semibold text-[#cbd5e1]">Hindcast Origin Estimated</span>
                            <span className="font-mono text-[8px] text-[#62859e]">09:12 UTC</span>
                        </div>
                        <p className="text-[8.5px] text-[#62859e]">Backtracking complete</p>
                    </div>

                    <div className="relative">
                        <span className="absolute -left-[16px] top-1 h-2 w-2 rounded-full border border-[#0284c7] bg-[#0284c7]" />
                        <div className="flex items-center justify-between">
                            <span className="font-semibold text-[#cbd5e1]">Forecast (24h) Available</span>
                            <span className="font-mono text-[8px] text-[#62859e]">09:08 UTC</span>
                        </div>
                        <p className="text-[8.5px] text-[#62859e]">Drift prediction + uncertainty</p>
                    </div>
                </div>
            </div>

            {/* Key Metrics 2x2 Grid */}
            <div className="mt-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#7ab8d0] mb-2">
                    Key Metrics
                </p>
                <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-[#1b344b] bg-[#030d17] p-2.5">
                        <p className="text-[8.5px] text-[#62859e]">Top Vessel Score</p>
                        <p className="mt-0.5 font-mono text-base font-bold text-[#10b981]">{topScore}</p>
                    </div>
                    <div className="rounded-lg border border-[#1b344b] bg-[#030d17] p-2.5">
                        <p className="text-[8.5px] text-[#62859e]">Null Hypothesis</p>
                        <p className="mt-0.5 font-mono text-base font-bold text-[#f8fafc]">{nullScore}</p>
                    </div>
                    <div className="rounded-lg border border-[#1b344b] bg-[#030d17] p-2.5">
                        <p className="text-[8.5px] text-[#62859e]">CAW Winner</p>
                        <p className="mt-0.5 font-mono text-[11px] font-bold text-[#f59e0b] truncate">{winnerMmsi}</p>
                    </div>
                    <div className="rounded-lg border border-[#1b344b] bg-[#030d17] p-2.5">
                        <p className="text-[8.5px] text-[#62859e]">Alpha Surface</p>
                        <p className="mt-0.5 font-mono text-[11px] font-bold text-[#f8fafc]">20 × 30 km</p>
                    </div>
                </div>
            </div>

            {/* Action Button: RE-RUN IDENTIFICATION */}
            <div className="mt-4 pt-2">
                <button
                    type="button"
                    onClick={onIdentifySuspects}
                    disabled={identifyLoading}
                    className={`w-full flex items-center justify-center gap-2 rounded-lg py-2.5 px-4 text-xs font-bold uppercase tracking-wider transition-all shadow-lg ${
                        identifyLoading
                            ? "bg-[#0b2238] text-[#62859e] border border-[#1b344b] cursor-wait"
                            : "bg-[#0070f3] hover:bg-[#0060df] text-white shadow-[0_0_15px_rgba(0,112,243,0.3)]"
                    }`}
                >
                    <span>⟳</span>
                    <span>{identifyLoading ? "IDENTIFYING…" : identified ? "RE-RUN IDENTIFICATION" : "IDENTIFY SUSPECTS"}</span>
                </button>
                <p className="mt-1.5 text-center font-mono text-[8.5px] text-[#5a7d96]">
                    Last run: 09:21 UTC
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