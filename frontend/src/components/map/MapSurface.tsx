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
            />
            <div className="absolute right-5 top-5 z-10 flex rounded-sm border border-[#31516a] bg-[#061624]/95 p-1 shadow-panel">
                {layers.map((layer) => (
                    <button className={`px-3 py-2 text-[9px] font-semibold uppercase tracking-[.12em] ${activeLayer === layer ? "bg-signal text-[#02131f]" : "text-mist hover:bg-panelAlt hover:text-signal"}`} key={layer} onClick={() => onLayerChange(layer)} type="button">
                        {layer}
                    </button>
                ))}
            </div>
            <div className="pointer-events-none absolute bottom-5 left-5 z-10 rounded-sm border border-[#31516a] bg-[#061624]/95 px-3 py-2 font-mono text-[10px] text-[#9ed7eb]">
                {analysis ? (
                    <>
                        <b>{analysis.detection.centroid_latlon.lat.toFixed(2)}°N</b><span className="mx-2 text-mist">/</span><b>{analysis.detection.centroid_latlon.lon.toFixed(2)}°E</b>
                    </>
                ) : (
                    <span className="text-mist">Loading location...</span>
                )}
            </div>
        </section>
    );
}
