import { useState } from "react";
import type { AlphaSurfaceResponse } from "../../types/intelligence";

interface AlphaSurfaceHeatmapProps {
    alphaSurface: AlphaSurfaceResponse | null;
    winningVesselId: number | null;
    identified: boolean;
    loading?: boolean;
    onVesselClick?: (vesselId: number) => void;
}

export function AlphaSurfaceHeatmap({
    alphaSurface,
    winningVesselId,
    identified,
    loading = false,
    onVesselClick,
}: AlphaSurfaceHeatmapProps) {
    const [hoveredCell, setHoveredCell] = useState<{
        vesselId: number;
        t0: number;
        alpha: number;
    } | null>(null);

    // Standby or loading state
    if (!identified || !alphaSurface || loading) {
        return (
            <div className="rounded-xl border border-[#15293e] bg-[#071322] p-3.5 text-[#cbd5e1] shadow-lg">
                <div className="flex items-center justify-between border-b border-[#1b344b] pb-2.5">
                    <div>
                        <p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#7ab8d0]">
                            Alpha Surface
                        </p>
                        <p className="text-[8.5px] text-[#62859e]">Candidate vessels × hypothesized t₀</p>
                    </div>
                    <span className="rounded border border-[#334155]/60 bg-[#1e293b]/40 px-2 py-0.5 font-mono text-[8.5px] font-semibold text-[#94a3b8]">
                        {loading ? "ANALYZING…" : "Awaiting analysis"}
                    </span>
                </div>
                <div className="mt-3 rounded-lg border border-dashed border-[#1b344b] bg-[#030d17]/60 p-4 text-center">
                    <p className="text-[10px] text-[#62859e]">
                        {loading
                            ? "Computing Cross-Attention Weights (CAW) across candidate tracks…"
                            : "Cross-attention weights over candidate vessels × hypothesized t₀ drift intervals will render after identification."}
                    </p>
                </div>
            </div>
        );
    }

    const { vessel_ids, t0_hours, alpha, null_alpha } = alphaSurface;

    // Find maximum alpha value in matrix for scaling intensity
    let maxAlpha = 0;
    for (let r = 0; r < alpha.length; r++) {
        for (let c = 0; c < alpha[r].length; c++) {
            if (alpha[r][c] > maxAlpha) {
                maxAlpha = alpha[r][c];
            }
        }
    }
    if (maxAlpha <= 0) maxAlpha = 1;

    return (
        <div className="rounded-xl border border-[#15293e] bg-[#071322] p-3.5 text-[#cbd5e1] shadow-lg">
            <div className="mb-2.5 flex items-center justify-between border-b border-[#1b344b] pb-2">
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#7ab8d0]">
                        Alpha Surface
                    </p>
                    <p className="text-[8px] text-[#62859e]">Candidate vessels × hypothesized t₀</p>
                </div>
                <span className="rounded border border-[#1b344b] bg-[#030d17] px-2 py-0.5 font-mono text-[8.5px] font-semibold text-[#00d4ff]">
                    {vessel_ids.length} × {t0_hours.length} grid
                </span>
            </div>

            {/* Matrix Heatmap */}
            <div className="max-h-[140px] overflow-auto rounded-lg border border-[#1b344b] bg-[#030d17]">
                <table className="w-full border-collapse text-left text-[8px]">
                    <thead className="sticky top-0 z-10 border-b border-[#1b344b] bg-[#061422] text-[#62859e]">
                        <tr>
                            <th className="sticky left-0 z-20 bg-[#061422] px-2 py-1 font-mono font-medium">
                                Vessel
                            </th>
                            {t0_hours.map((t0, cIdx) => (
                                <th
                                    key={t0}
                                    className="px-0.5 py-1 text-center font-mono font-normal min-w-[12px]"
                                    title={`t0 = ${t0}h before detection`}
                                >
                                    {cIdx % 5 === 0 ? `${Math.round(t0)}h` : "·"}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {vessel_ids.map((vesselId, rIdx) => {
                            const isWinner = winningVesselId !== null && vesselId === winningVesselId;
                            return (
                                <tr
                                    key={vesselId}
                                    className={`cursor-pointer transition-colors ${
                                        isWinner
                                            ? "bg-[#f59e0b]/15 font-semibold text-[#f59e0b]"
                                            : "hover:bg-[#0a1828] text-[#cbd5e1]"
                                    }`}
                                    onClick={() => onVesselClick?.(vesselId)}
                                >
                                    <td className="sticky left-0 z-10 bg-inherit px-2 py-0.5 font-mono whitespace-nowrap border-r border-[#1b344b]/60">
                                        {isWinner && <span className="mr-1 text-[#f59e0b]">★</span>}
                                        {vesselId}
                                    </td>
                                    {t0_hours.map((t0, cIdx) => {
                                        const cellVal = alpha[rIdx]?.[cIdx] ?? 0;
                                        const intensity = Math.min(cellVal / maxAlpha, 1.0);
                                        const bgColor =
                                            cellVal > 0.0001
                                                ? `rgba(245, 158, 11, ${Math.max(0.12, intensity * 0.95)})`
                                                : "transparent";

                                        return (
                                            <td
                                                key={t0}
                                                className="p-0 border-[0.5px] border-[#1b344b]/30 text-center"
                                                style={{ backgroundColor: bgColor }}
                                                onMouseEnter={() =>
                                                    setHoveredCell({ vesselId, t0, alpha: cellVal })
                                                }
                                                onMouseLeave={() => setHoveredCell(null)}
                                                title={`MMSI ${vesselId} @ -${Math.round(t0)}h: ${(cellVal * 100).toFixed(4)}%`}
                                            >
                                                <div className="h-2 w-2 mx-auto" />
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* High -> Low Color Scale Bar with disclosure note */}
            <div className="mt-2.5 flex items-center justify-between text-[8px] text-[#7ab8d0]">
                <span className="font-semibold text-[#f59e0b]">High</span>
                <div className="mx-2 h-1.5 flex-1 rounded-full bg-gradient-to-r from-[#f59e0b] via-[#d97706]/70 to-[#0c2438]" />
                <span className="font-semibold text-[#62859e]">Low</span>
            </div>

            {/* Visual Explanation Card Notice */}
            <p className="mt-1 text-center font-mono text-[7.5px] text-[#5a7d96]">
                Visual explanation of attention weights · Not spatial probability density
            </p>

            {/* Null Hypothesis Banner */}
            {null_alpha !== null && null_alpha !== undefined && (
                <div className="mt-2 flex items-center justify-between rounded-lg border border-[#1b344b] bg-[#030d17] px-2.5 py-1.5 text-[9px]">
                    <div className="flex items-center gap-1.5">
                        <span className="font-semibold uppercase tracking-wider text-[#7ab8d0]">
                            Null Hypothesis
                        </span>
                        <span className="text-[7.5px] text-[#62859e]">(unexplained)</span>
                    </div>
                    <span className="font-mono font-bold text-[#cbd5e1]">
                        {(null_alpha * 100).toFixed(2)}%
                    </span>
                </div>
            )}
        </div>
    );
}
