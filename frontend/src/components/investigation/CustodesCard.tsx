import type { CustodesStatusResponse } from "../../types/intelligence";

interface CustodesCardProps {
    custodes: CustodesStatusResponse;
}

export function CustodesCard({ custodes }: CustodesCardProps) {
    const topScoreFormatted =
        custodes.top_vessel_score !== null
            ? `${(custodes.top_vessel_score * 100).toFixed(1)}%`
            : "N/A";
    const runnerUpName =
        custodes.second_vessel !== null
            ? `MMSI ${custodes.second_vessel}`
            : "NULL HYPOTHESIS";
    const runnerUpScoreFormatted =
        custodes.second_vessel_score !== null
            ? `${(custodes.second_vessel_score * 100).toFixed(1)}%`
            : "N/A";
    const marginFormatted =
        custodes.margin !== null ? `${custodes.margin.toFixed(2)}x` : "N/A";
    const nullAlphaFormatted =
        custodes.null_alpha !== null
            ? `${(custodes.null_alpha * 100).toFixed(2)}%`
            : "N/A";

    return (
        <div className="rounded-sm border border-line bg-panel/90 p-3.5 shadow-sm">
            <div className="flex items-center justify-between border-b border-line pb-2.5">
                <div className="flex items-center gap-2">
                    <p className="eyebrow text-signal">Custodes Status</p>
                    <span
                        className={`rounded-sm px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            custodes.decision === "COMMIT"
                                ? "border border-success/50 bg-success/10 text-success"
                                : custodes.decision === "REFINE_GRID"
                                ? "border border-ember/50 bg-ember/10 text-ember"
                                : "border border-danger/50 bg-danger/10 text-danger"
                        }`}
                    >
                        {custodes.decision}
                    </span>
                </div>
                <span className="font-mono text-[9px] text-mist">
                    Margin: <b className="text-ink">{marginFormatted}</b>
                </span>
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 text-[10px]">
                <div>
                    <p className="text-mist">Top candidate (CAW winner)</p>
                    <p className="font-mono font-semibold text-ink">
                        {custodes.top_vessel !== null ? `MMSI ${custodes.top_vessel}` : "None"}
                    </p>
                </div>
                <div>
                    <p className="text-mist">Top candidate score</p>
                    <p className="font-mono font-semibold text-[#F59E0B]">
                        {topScoreFormatted}
                    </p>
                </div>
                <div>
                    <p className="text-mist">Runner-up</p>
                    <p className="font-mono font-medium text-ink">
                        {runnerUpName}
                    </p>
                </div>
                <div>
                    <p className="text-mist">Runner-up score</p>
                    <p className="font-mono text-mist">
                        {runnerUpScoreFormatted}
                    </p>
                </div>
                <div>
                    <p className="text-mist">Same-vessel top-2</p>
                    <p className="font-mono text-mist">
                        {custodes.same_vessel_top2_rows ? "True (t₀ refine)" : "False"}
                    </p>
                </div>
                <div>
                    <p className="text-mist">Null hypothesis (α)</p>
                    <p className="font-mono font-medium text-[#64748b]">
                        {nullAlphaFormatted}
                    </p>
                </div>
            </div>
            {custodes.abstain_flag && (
                <div className="mt-2.5 rounded-sm border border-danger/50 bg-danger/10 px-2 py-1 text-[9px] text-[#dc2626]">
                    Abstain flag active: attribution uncertainty exceeds threshold.
                </div>
            )}
        </div>
    );
}
