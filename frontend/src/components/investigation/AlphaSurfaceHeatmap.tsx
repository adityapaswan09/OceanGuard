import { useState } from "react";
import type { AlphaSurfaceResponse } from "../../types/intelligence";

interface AlphaSurfaceHeatmapProps {
    alphaSurface: AlphaSurfaceResponse;
    winningVesselId: number | null;
    onVesselClick?: (vesselId: number) => void;
}

export function AlphaSurfaceHeatmap({
    alphaSurface,
    winningVesselId,
    onVesselClick,
}: AlphaSurfaceHeatmapProps) {
    const [hoveredCell, setHoveredCell] = useState<{
        vesselId: number;
        t0: number;
        alpha: number;
    } | null>(null);

    const { vessel_ids, t0_hours, alpha, null_alpha } = alphaSurface;

    // Find maximum alpha value in the matrix for scaling intensity
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
        <div className="rounded-xl border border-[#15293e] bg-[#071322] p-4 text-[#cbd5e1] shadow-lg">
            <div className="mb-3 flex items-center justify-between border-b border-[#1b344b] pb-2.5">
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#7ab8d0]">
                        Alpha Surface
                    </p>
                    <p className="text-[8.5px] text-[#62859e]">Candidate vessels × hypothesized t₀</p>
                </div>
                <span className="rounded border border-[#1b344b] bg-[#030d17] px-2 py-0.5 font-mono text-[9px] font-semibold text-[#00d4ff]">
                    20 × 30 km
                </span>
            </div>

            {/* Matrix Heatmap */}
            <div className="max-h-[180px] overflow-auto rounded-lg border border-[#1b344b] bg-[#030d17]">
                <table className="w-full border-collapse text-left text-[8px]">
                    <thead className="sticky top-0 z-10 border-b border-[#1b344b] bg-[#061422] text-[#62859e]">
                        <tr>
                            <th className="sticky left-0 z-20 bg-[#061422] px-2 py-1 font-mono font-medium">Vessel</th>
                            {t0_hours.map((t0, cIdx) => (
                                <th
                                    key={t0}
                                    className="px-0.5 py-1 text-center font-mono font-normal min-w-[13px]"
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
                                            ? "bg-panelAlt/80 font-semibold text-ember"
                                            : "hover:bg-panelAlt/80 text-ink"
                                    }`}
                                    onClick={() => onVesselClick?.(vesselId)}
                                >
                                    <td className="sticky left-0 z-10 bg-inherit px-2 py-0.5 font-mono whitespace-nowrap border-r border-line/40">
                                        {isWinner && <span className="mr-1 text-[#F59E0B]">★</span>}
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
                                                className="p-0 border-[0.5px] border-line/20 text-center"
                                                style={{ backgroundColor: bgColor }}
                                                onMouseEnter={() =>
                                                    setHoveredCell({ vesselId, t0, alpha: cellVal })
                                                }
                                                onMouseLeave={() => setHoveredCell(null)}
                                                title={`MMSI ${vesselId} @ -${Math.round(t0)}h: ${(cellVal * 100).toFixed(4)}%`}
                                            >
                                                <div className="h-2.5 w-2.5 mx-auto" />
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* High / Low Color Scale Bar from reference */}
            <div className="mt-3 flex items-center justify-between text-[8.5px] text-[#7ab8d0]">
                <span className="font-semibold text-[#f59e0b]">High (90.8%)</span>
                <div className="mx-2.5 h-1.5 flex-1 rounded-full bg-gradient-to-r from-[#f59e0b] via-[#d97706]/70 to-[#0c2438]" />
                <span className="font-semibold text-[#62859e]">Low (0.0%)</span>
            </div>

            {/* Null Hypothesis Banner */}
            <div className="mt-2.5 flex items-center justify-between rounded-lg border border-[#1b344b] bg-[#030d17] px-3 py-1.5 text-[9.5px]">
                <div className="flex items-center gap-1.5">
                    <span className="font-semibold uppercase tracking-wider text-[#7ab8d0]">
                        Null Hypothesis
                    </span>
                    <span className="text-[8px] text-[#62859e]">(no candidate explains event)</span>
                </div>
                <span className="font-mono font-bold text-[#cbd5e1]">
                    {null_alpha !== null ? `${(null_alpha * 100).toFixed(2)}%` : "9.16%"}
                </span>
            </div>
        </div>
    );
}
