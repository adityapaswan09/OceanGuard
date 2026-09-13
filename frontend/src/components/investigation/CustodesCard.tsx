import { CUSTODES_CHECKPOINT_PRECISION, type CustodesStatusResponse } from "../../types/intelligence";

interface CustodesCardProps {
    custodes: CustodesStatusResponse | null;
    identified: boolean;
    loading?: boolean;
}

export function CustodesCard({ custodes, identified, loading = false }: CustodesCardProps) {
    const isReady = identified && custodes !== null && !loading;
    const isAbstain = isReady && (custodes.decision === "ABSTAIN" || custodes.top_vessel === null);

    const getDecisionBadge = () => {
        if (loading) {
            return (
                <span className="rounded-full border border-[#00d4ff]/40 bg-[#00d4ff]/10 px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#00d4ff] animate-pulse">
                    IDENTIFYING…
                </span>
            );
        }
        if (!identified || !custodes) {
            return (
                <span className="rounded-full border border-[#334155]/60 bg-[#1e293b]/40 px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#94a3b8]">
                    Awaiting identification
                </span>
            );
        }
        const decision = custodes.decision;
        if (decision === "COMMIT") {
            return (
                <span className="rounded-full border border-[#10b981]/50 bg-[#10b981]/15 px-2.5 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-wider text-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.2)]">
                    COMMIT
                </span>
            );
        }
        if (decision === "REFINE_GRID") {
            return (
                <span className="rounded-full border border-[#f59e0b]/50 bg-[#f59e0b]/15 px-2.5 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-wider text-[#f59e0b]">
                    REFINE_GRID
                </span>
            );
        }
        return (
            <span className="rounded-full border border-[#ef4444]/50 bg-[#ef4444]/15 px-2.5 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-wider text-[#ef4444]">
                ABSTAIN
            </span>
        );
    };

    // Top Candidate
    let topCandidateTitle = "—";
    let topCandidateScore = "—";

    if (loading) {
        topCandidateTitle = "Evaluating…";
        topCandidateScore = "…";
    } else if (isReady) {
        if (isAbstain) {
            topCandidateTitle = "No confident match";
            topCandidateScore = "—";
        } else {
            topCandidateTitle = `MMSI ${custodes.top_vessel}`;
            topCandidateScore =
                custodes.top_vessel_score !== null
                    ? `${(custodes.top_vessel_score * 100).toFixed(1)}%`
                    : "—";
        }
    }

    // Runner-Up
    let runnerUpName = "—";
    let runnerUpScore = "";

    if (loading) {
        runnerUpName = "Evaluating…";
    } else if (isReady) {
        if (custodes.second_vessel === null) {
            runnerUpName = "NULL HYPOTHESIS";
            runnerUpScore =
                custodes.second_vessel_score !== null
                    ? `${(custodes.second_vessel_score * 100).toFixed(1)}%`
                    : "—";
        } else {
            runnerUpName = `MMSI ${custodes.second_vessel}`;
            runnerUpScore =
                custodes.second_vessel_score !== null
                    ? `${(custodes.second_vessel_score * 100).toFixed(1)}%`
                    : "—";
        }
    }

    // Same-vessel top-2
    let sameVesselText = "—";
    let marginText = "";

    if (loading) {
        sameVesselText = "Evaluating…";
    } else if (isReady) {
        sameVesselText = custodes.same_vessel_top2_rows ? "True (t ± refine)" : "False";
        if (custodes.margin !== null && custodes.margin !== undefined) {
            marginText = `${custodes.margin.toFixed(2)}% margin`;
        }
    }

    return (
        <div className="rounded-xl border border-[#15293e] bg-[#071322] p-4 text-[#cbd5e1] shadow-lg">
            {/* Header: CUSTODES with Decision badge */}
            <div className="flex items-center justify-between border-b border-[#1b344b] pb-3">
                <div className="flex items-center gap-2">
                    <span
                        className={`h-2 w-2 rounded-full ${
                            loading
                                ? "bg-[#00d4ff] animate-ping"
                                : isReady && !isAbstain
                                ? "bg-[#10b981] animate-pulse"
                                : isAbstain
                                ? "bg-[#ef4444]"
                                : "bg-[#64748b]"
                        }`}
                    />
                    <p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#7ab8d0]">
                        CUSTODES
                    </p>
                </div>
                {getDecisionBadge()}
            </div>

            {/* Top Candidate Metric Box */}
            <div
                className={`mt-3 rounded-lg border p-3 transition-colors ${
                    isAbstain
                        ? "border-[#ef4444]/40 bg-[#ef4444]/5"
                        : isReady
                        ? "border-[#f59e0b]/40 bg-[#0a1828]"
                        : "border-[#1b344b] bg-[#040e1a]"
                }`}
            >
                <p className="text-[9px] font-semibold uppercase tracking-wider text-[#7ab8d0]">
                    Top Candidate
                </p>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                    <span
                        className={`font-mono text-base sm:text-lg font-extrabold tracking-tight ${
                            isAbstain
                                ? "text-[#ef4444]"
                                : isReady
                                ? "text-[#f59e0b]"
                                : "text-[#64748b]"
                        }`}
                    >
                        {topCandidateTitle}
                    </span>
                    <span
                        className={`font-mono text-base font-bold ${
                            isAbstain
                                ? "text-[#94a3b8]"
                                : isReady
                                ? "text-[#f59e0b]"
                                : "text-[#64748b]"
                        }`}
                    >
                        {topCandidateScore}
                    </span>
                </div>
            </div>

            {/* Sub-Metrics: Runner-up & Same-vessel */}
            <div className="mt-3 space-y-2 text-[10px]">
                {/* Runner-up */}
                <div className="flex items-center justify-between rounded-lg border border-[#1b344b] bg-[#030d17] px-3 py-2">
                    <span className="text-[#62859e]">Runner-up</span>
                    <div className="flex items-center gap-2">
                        <span
                            className={`font-mono font-semibold ${
                                isReady && runnerUpName === "NULL HYPOTHESIS"
                                    ? "text-[#38bdf8]"
                                    : isReady
                                    ? "text-[#f8fafc]"
                                    : "text-[#64748b]"
                            }`}
                        >
                            {runnerUpName}
                        </span>
                        {runnerUpScore && (
                            <span className="font-mono font-bold text-[#7ab8d0]">
                                {runnerUpScore}
                            </span>
                        )}
                    </div>
                </div>

                {/* Same-vessel top-2 */}
                <div className="flex items-center justify-between rounded-lg border border-[#1b344b] bg-[#030d17] px-3 py-2">
                    <span className="text-[#62859e]">Same-vessel top-2</span>
                    <div className="flex items-center gap-2">
                        <span
                            className={`font-mono font-semibold ${
                                isReady && custodes?.same_vessel_top2_rows
                                    ? "text-[#10b981]"
                                    : isReady
                                    ? "text-[#94a3b8]"
                                    : "text-[#64748b]"
                            }`}
                        >
                            {sameVesselText}
                        </span>
                        {marginText && (
                            <>
                                <span className="font-mono text-[#62859e]">·</span>
                                <span className="font-mono text-[9px] text-[#7ab8d0]">
                                    {marginText}
                                </span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Refine Grid warning banner if active */}
            {isReady && custodes?.decision === "REFINE_GRID" && (
                <div className="mt-3 rounded-lg border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-3 py-2 text-[9.5px] text-[#f59e0b]">
                    Confidence borderline — re-running at finer resolution recommended.
                </div>
            )}

            {/* Abstain warning banner if active */}
            {isReady && (custodes?.abstain_flag || isAbstain) && (
                <div className="mt-3 rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 px-3 py-2 text-[9.5px] text-[#ef4444]">
                    Abstain flag active: attribution uncertainty exceeds threshold.
                </div>
            )}

            {/* Checkpoint Validation Precision Footer */}
            <div className="mt-3 flex items-center justify-between border-t border-[#1b344b]/60 pt-2.5 font-mono text-[8.5px]">
                <span className="text-[#62859e]">CAW/Custodes checkpoint</span>
                <span
                    className="font-semibold text-[#00d4ff]"
                    title="Held-out validation benchmark precision (not single-incident confidence)"
                >
                    {CUSTODES_CHECKPOINT_PRECISION}
                </span>
            </div>
        </div>
    );
}
