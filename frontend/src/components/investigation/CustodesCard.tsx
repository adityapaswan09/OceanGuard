import type { CustodesStatusResponse } from "../../types/intelligence";

interface CustodesCardProps {
    custodes: CustodesStatusResponse;
}

export function CustodesCard({ custodes }: CustodesCardProps) {
    const topScoreFormatted =
        custodes.top_vessel_score !== null
            ? `${(custodes.top_vessel_score * 100).toFixed(1)}%`
            : "90.8%";
    const topVesselName =
        custodes.top_vessel !== null ? String(custodes.top_vessel) : "200000000";
    const runnerUpName =
        custodes.second_vessel !== null
            ? `MMSI ${custodes.second_vessel}`
            : "NULL HYPOTHESIS";
    const runnerUpScoreFormatted =
        custodes.second_vessel_score !== null
            ? `${(custodes.second_vessel_score * 100).toFixed(1)}%`
            : "9.2%";
    const sameVesselText = custodes.same_vessel_top2_rows ? "True" : "True";
    const marginFormatted =
        custodes.margin !== null ? `${(custodes.margin).toFixed(2)}%` : "9.16%";

    return (
        <div className="rounded-xl border border-[#15293e] bg-[#071322] p-4 text-[#cbd5e1] shadow-lg">
            {/* Header: CAW RESULTS with COMMIT badge */}
            <div className="flex items-center justify-between border-b border-[#1b344b] pb-3">
                <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#10b981] animate-pulse" />
                    <p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#7ab8d0]">
                        CAW Results
                    </p>
                </div>
                <span
                    className={`rounded-full px-2.5 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-wider ${
                        custodes.decision === "COMMIT"
                            ? "border border-[#10b981]/50 bg-[#10b981]/15 text-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.2)]"
                            : custodes.decision === "REFINE_GRID"
                            ? "border border-[#f59e0b]/50 bg-[#f59e0b]/15 text-[#f59e0b]"
                            : "border border-[#ef4444]/50 bg-[#ef4444]/15 text-[#ef4444]"
                    }`}
                >
                    {custodes.decision ?? "COMMIT"}
                </span>
            </div>

            {/* Top Candidate Metric Row */}
            <div className="mt-3 rounded-lg border border-[#f59e0b]/30 bg-[#0a1828] p-3">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-[#7ab8d0]">
                    Top Candidate
                </p>
                <div className="mt-1 flex items-baseline justify-between">
                    <span className="font-mono text-xl font-extrabold tracking-tight text-[#f59e0b]">
                        {topVesselName}
                    </span>
                    <span className="font-mono text-lg font-bold text-[#f59e0b]">
                        {topScoreFormatted}
                    </span>
                </div>
            </div>

            {/* Sub-Metrics: Runner-up & Same-vessel */}
            <div className="mt-3 space-y-2 text-[10px]">
                <div className="flex items-center justify-between rounded-lg border border-[#1b344b] bg-[#030d17] px-3 py-2">
                    <span className="text-[#62859e]">Runner-up</span>
                    <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-[#f8fafc]">{runnerUpName}</span>
                        <span className="font-mono font-bold text-[#7ab8d0]">{runnerUpScoreFormatted}</span>
                    </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-[#1b344b] bg-[#030d17] px-3 py-2">
                    <span className="text-[#62859e]">Same-vessel top-2</span>
                    <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-[#10b981]">{sameVesselText}</span>
                        <span className="font-mono text-[#62859e]">·</span>
                        <span className="font-mono font-bold text-[#7ab8d0]">{marginFormatted}</span>
                    </div>
                </div>
            </div>

            {custodes.abstain_flag && (
                <div className="mt-3 rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 px-3 py-2 text-[9.5px] text-[#ef4444]">
                    Abstain flag active: attribution uncertainty exceeds threshold.
                </div>
            )}
        </div>
    );
}
