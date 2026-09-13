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
        <div className="rounded-sm border border-line bg-panel/90 p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
                <div>
                    <p className="eyebrow text-signal">CAW Alpha Surface (20 × 30)</p>
                    <p className="text-[9px] text-mist">Candidate vessels × hypothesized t₀ (hours before detection)</p>
                </div>
                {hoveredCell ? (
                    <span className="font-mono text-[9px] font-semibold text-ink">
                        MMSI {hoveredCell.vesselId} · -{Math.round(hoveredCell.t0)}h · α = {(hoveredCell.alpha * 100).toFixed(3)}%
                    </span>
                ) : (
                    <span className="font-mono text-[9px] text-mist">Hover cell for details</span>
                )}
            </div>

            {/* Matrix Heatmap */}
            <div className="max-h-[200px] overflow-auto border border-line/60 rounded-sm">
                <table className="w-full border-collapse text-left text-[8px]">
                    <thead className="sticky top-0 z-10 bg-panelAlt/80 border-b border-line text-mist">
                        <tr>
                            <th className="sticky left-0 z-20 bg-panelAlt/80 px-2 py-1 font-mono font-medium">Vessel</th>
                            {t0_hours.map((t0, cIdx) => (
                                <th
                                    key={t0}
                                    className="px-0.5 py-1 text-center font-mono font-normal min-w-[14px]"
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

            {/* Null Hypothesis Banner */}
            <div className="mt-2.5 flex items-center justify-between rounded-sm border border-dashed border-[#cbd5e1] bg-panelAlt/80 px-3 py-1.5 text-[10px]">
                <div className="flex items-center gap-1.5">
                    <span className="font-semibold uppercase tracking-wider text-mist">
                        Null Hypothesis
                    </span>
                    <span className="text-[9px] text-mist">(Mass on "No candidate vessel explains event")</span>
                </div>
                <span className="font-mono font-bold text-[#1e293b]">
                    {null_alpha !== null ? `${(null_alpha * 100).toFixed(2)}%` : "N/A"}
                </span>
            </div>
        </div>
    );
}
