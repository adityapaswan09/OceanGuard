import { MapView } from "./MapView";
import type { AisTrack, SpillAnalysis } from "../../types/intelligence";

interface MapSurfaceProps {
    activeLayer: string;
    onLayerChange: (layer: string) => void;
    investigationTab: string;
    aisTracks: AisTrack[];
    highlightedVesselId: number | null;
    analysis: SpillAnalysis | null;
    cawActive?: boolean;
    winningVesselId?: number | null;
    isIdentifying?: boolean;
    identifyRun?: number;
    identified?: boolean;
    onVesselSelect?: (vesselId: number) => void;
}

const layers = ["Satellite", "Bathymetry", "Vector"];

export function MapSurface({
    activeLayer,
    onLayerChange,
    investigationTab,
    aisTracks,
    highlightedVesselId,
    analysis,
    cawActive,
    winningVesselId,
    isIdentifying,
    identifyRun,
    identified,
    onVesselSelect,
}: MapSurfaceProps) {
    return (
        <section className="relative min-h-[430px] flex-1 overflow-hidden border-b border-line bg-navy lg:min-h-0">
            <MapView
                activeLayer={activeLayer}
                investigationTab={investigationTab}
                aisTracks={aisTracks}
                highlightedVesselId={highlightedVesselId}
                analysis={analysis}
                cawActive={cawActive}
                winningVesselId={winningVesselId}
                isIdentifying={isIdentifying}
                identifyRun={identifyRun}
                identified={identified}
                onVesselSelect={onVesselSelect}
            />
            {/* Tactical Layer Switcher — Top-Right */}
            <div className="absolute right-3 top-3 z-20 flex items-center rounded border border-[#1b344b] bg-[#030d17]/90 p-1 shadow-lg backdrop-blur-sm">
                {layers.map((layer) => {
                    const isActive = activeLayer === layer;
                    const icon = layer === "Satellite" ? "🛰" : layer === "Bathymetry" ? "🌊" : "🗺";
                    return (
                        <button
                            key={layer}
                            onClick={() => onLayerChange(layer)}
                            type="button"
                            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.1em] transition ${
                                isActive
                                    ? "border border-[#00d4ff]/40 bg-[#0c2438] text-[#00d4ff] shadow-[0_0_8px_rgba(0,212,255,0.12)]"
                                    : "border border-transparent text-[#62859e] hover:bg-[#071726] hover:text-[#cbd5e1]"
                            }`}
                        >
                            <span className="text-[10px]">{icon}</span>
                            <span>{layer}</span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
