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
            {/* Layer switcher — top-right, interactive */}
            <div className="absolute right-3 top-3 z-20 flex rounded-sm border border-[#1e3a52] bg-[#020b14]/95 p-0.5 shadow-[0_2px_12px_rgba(0,0,0,0.5)]">
                {layers.map((layer) => (
                    <button
                        className={`px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[.1em] transition-colors ${
                            activeLayer === layer
                                ? "bg-[#0d2235] text-[#00d4ff]"
                                : "text-[#5a7d96] hover:bg-[#0a1c2c] hover:text-[#7ab8d0]"
                        }`}
                        key={layer}
                        onClick={() => onLayerChange(layer)}
                        type="button"
                    >
                        {layer}
                    </button>
                ))}
            </div>
        </section>
    );
}
