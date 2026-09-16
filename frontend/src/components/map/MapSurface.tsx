import { useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { MapView } from "./MapView";
import type { AisTrack, CustodesDecision, SpillAnalysis, SuspectCandidate } from "../../types/intelligence";

interface MapSurfaceProps {
    activeLayer: string;
    onLayerChange: (layer: string) => void;
    investigationTab: string;
    onTabChange?: (tab: string) => void;
    aisTracks: AisTrack[];
    highlightedVesselId: number | null;
    analysis: SpillAnalysis | null;
    cawActive?: boolean;
    winningVesselId?: number | null;
    decision?: CustodesDecision | null;
    isIdentifying?: boolean;
    identifyRun?: number;
    identified?: boolean;
    suspects?: SuspectCandidate[];
    onVesselSelect?: (vesselId: number) => void;
}

const layerOptions = [
    {
        id: "Map",
        label: "Map",
        icon: (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                <line x1="8" y1="2" x2="8" y2="18" />
                <line x1="16" y1="6" x2="16" y2="22" />
            </svg>
        ),
    },
    {
        id: "Satellite",
        label: "Satellite",
        icon: (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
            </svg>
        ),
    },
    {
        id: "Layers",
        label: "Layers",
        icon: (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
            </svg>
        ),
    },
];

const navigationTabs = [
    {
        id: "Overview",
        label: "Overview",
        icon: (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
        ),
    },
    {
        id: "Hindcast",
        label: "Hindcast",
        icon: (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
        ),
    },
    {
        id: "Forecast",
        label: "Forecast",
        icon: (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
        ),
    },
    {
        id: "AIS Analysis",
        label: "AIS Analysis",
        icon: (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
        ),
    },
    {
        id: "Suspects",
        label: "Suspects",
        icon: (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
            </svg>
        ),
    },
];

export function MapSurface({
    activeLayer,
    onLayerChange,
    investigationTab,
    onTabChange,
    aisTracks,
    highlightedVesselId,
    analysis,
    cawActive,
    winningVesselId,
    decision,
    isIdentifying,
    identifyRun,
    identified,
    suspects,
    onVesselSelect,
}: MapSurfaceProps) {
    const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);
    const [cursorCoords, setCursorCoords] = useState<{ lon: number; lat: number } | null>(null);
    const [showLayersMenu, setShowLayersMenu] = useState(false);
    const [hindcastRun, setHindcastRun] = useState(0);
    const [forecastRun, setForecastRun] = useState(0);
    const [layerVisibility, setLayerVisibility] = useState({
        spill: true,
        hindcast: true,
        forecast: true,
        ais: true,
        graticule: true,
    });

    const toggleLayer = (key: keyof typeof layerVisibility) => {
        setLayerVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <section className="relative h-full min-h-[480px] w-full flex-1 overflow-hidden bg-[#020813]">
            {/* The GIS Map Canvas */}
            <MapView
                activeLayer={activeLayer}
                investigationTab={investigationTab}
                aisTracks={aisTracks}
                highlightedVesselId={highlightedVesselId}
                analysis={analysis}
                cawActive={cawActive}
                winningVesselId={winningVesselId}
                decision={decision}
                isIdentifying={isIdentifying}
                identifyRun={identifyRun}
                hindcastRun={hindcastRun}
                forecastRun={forecastRun}
                identified={identified}
                suspects={suspects}
                onVesselSelect={onVesselSelect}
                onMapReady={setMapInstance}
                onCoordsUpdate={setCursorCoords}
                layerVisibility={layerVisibility}
            />

            {/* TOP-LEFT: Tactical Segmented Layer Selector */}
            <div className="absolute left-3.5 top-3.5 z-20 flex items-center rounded-lg border border-[#162c44] bg-[#050f1d]/85 p-1 shadow-xl backdrop-blur-md">
                {layerOptions.map((layer) => {
                    const isActive = activeLayer === layer.id || (layer.id === "Layers" && showLayersMenu);
                    return (
                        <button
                            key={layer.id}
                            onClick={() => {
                                if (layer.id === "Layers") {
                                    setShowLayersMenu((prev) => !prev);
                                } else {
                                    setShowLayersMenu(false);
                                }
                                onLayerChange(layer.id);
                            }}
                            type="button"
                            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                                isActive
                                    ? "bg-[#0070f3] text-white shadow-[0_0_12px_rgba(0,112,243,0.4)]"
                                    : "text-[#7a9bb5] hover:bg-[#0c2238] hover:text-[#f8fafc]"
                            }`}
                        >
                            <span>{layer.icon}</span>
                            <span>{layer.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* TOP-LEFT: Floating GIS Layer Controls Drawer/Dropdown */}
            {showLayersMenu && (
                <div className="absolute left-3.5 top-14 z-30 w-56 rounded-xl border border-[#162c44] bg-[#050f1d]/95 p-3.5 shadow-2xl backdrop-blur-md">
                    <div className="flex items-center justify-between border-b border-[#162c44] pb-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#7ab8d0]">
                            GIS Layer Visibility
                        </span>
                        <button
                            type="button"
                            onClick={() => setShowLayersMenu(false)}
                            className="rounded p-0.5 text-[#64748b] hover:bg-[#0c2238] hover:text-[#f8fafc]"
                        >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>

                    <div className="mt-2.5 space-y-2.5 text-[11px]">
                        <label className="flex cursor-pointer items-center justify-between hover:text-[#f8fafc]">
                            <div className="flex items-center gap-2">
                                <span className="inline-block h-2 w-2 rounded-sm bg-[#ef4444]" />
                                <span className="text-[#cbd5e1]">Oil Spill Slick</span>
                            </div>
                            <input
                                type="checkbox"
                                checked={layerVisibility.spill}
                                onChange={() => toggleLayer("spill")}
                                className="h-3.5 w-3.5 accent-[#0070f3] cursor-pointer"
                            />
                        </label>


                        <label className="flex cursor-pointer items-center justify-between hover:text-[#f8fafc]">
                            <div className="flex items-center gap-2">
                                <span className="inline-block h-2 w-2 rounded-full bg-[#0284c7]" />
                                <span className="text-[#cbd5e1]">Hindcast Trajectory</span>
                            </div>
                            <input
                                type="checkbox"
                                checked={layerVisibility.hindcast}
                                onChange={() => toggleLayer("hindcast")}
                                className="h-3.5 w-3.5 accent-[#0070f3] cursor-pointer"
                            />
                        </label>

                        <label className="flex cursor-pointer items-center justify-between hover:text-[#f8fafc]">
                            <div className="flex items-center gap-2">
                                <span className="inline-block h-2 w-2 rounded-full bg-[#06b6d4]" />
                                <span className="text-[#cbd5e1]">24h Drift Forecast</span>
                            </div>
                            <input
                                type="checkbox"
                                checked={layerVisibility.forecast}
                                onChange={() => toggleLayer("forecast")}
                                className="h-3.5 w-3.5 accent-[#0070f3] cursor-pointer"
                            />
                        </label>

                        <label className="flex cursor-pointer items-center justify-between hover:text-[#f8fafc]">
                            <div className="flex items-center gap-2">
                                <span className="inline-block h-0.5 w-2 bg-[#0ea5e9] shadow-[0_0_4px_rgba(14,165,233,0.8)]" />
                                <span className="text-[#cbd5e1]">AIS Fleet Tracks</span>
                            </div>
                            <input
                                type="checkbox"
                                checked={layerVisibility.ais}
                                onChange={() => toggleLayer("ais")}
                                className="h-3.5 w-3.5 accent-[#0070f3] cursor-pointer"
                            />
                        </label>

                        <label className="flex cursor-pointer items-center justify-between hover:text-[#f8fafc]">
                            <div className="flex items-center gap-2">
                                <span className="inline-block h-0.5 w-2 border-t border-dashed border-[#64748b]" />
                                <span className="text-[#cbd5e1]">Coordinate Graticule</span>
                            </div>
                            <input
                                type="checkbox"
                                checked={layerVisibility.graticule}
                                onChange={() => toggleLayer("graticule")}
                                className="h-3.5 w-3.5 accent-[#0070f3] cursor-pointer"
                            />
                        </label>
                    </div>
                </div>
            )}

            {/* TOP-RIGHT: Tactical Operational Telemetry Display */}
            <div className="absolute right-3.5 top-3.5 z-20 hidden sm:flex items-center gap-2 rounded-lg border border-[#162c44] bg-[#050f1d]/85 px-2.5 py-1 text-[10px] font-mono text-[#7ab8d0] shadow-xl backdrop-blur-md">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] animate-pulse" />
                <span className="text-[9px] uppercase tracking-wider text-[#62859e]">TEL</span>
                <span className="text-[#334e68]">|</span>
                <span className="text-[#cbd5e1]">
                    {cursorCoords
                        ? `${cursorCoords.lat.toFixed(4)}°N  ${cursorCoords.lon.toFixed(4)}°E`
                        : analysis?.detection?.centroid_latlon
                        ? `${analysis.detection.centroid_latlon.lat.toFixed(4)}°N  ${analysis.detection.centroid_latlon.lon.toFixed(4)}°E`
                        : "09.5000°N  75.7667°E"}
                </span>
            </div>

            {/* BOTTOM-LEFT: Tactical Maritime GIS Legend */}
            <div className="pointer-events-none absolute bottom-3.5 left-3.5 z-20 hidden w-[175px] rounded-lg border border-[#162c44] bg-[#050f1d]/85 p-2.5 shadow-xl backdrop-blur-md sm:block">
                <div className="space-y-1.5 text-[9.5px]">
                    <div className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2.5 rounded-sm bg-[#ef4444] border border-[#f87171]/80" />
                        <span className="font-medium text-[#f8fafc]">Spill Detection</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rotate-45 bg-[#f97316] border border-[#fed7aa]" />
                        <span className="text-[#cbd5e1]">Estimated Origin</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-block h-0.5 w-3.5 border-t border-dashed border-[#3b82f6]" />
                        <span className="text-[#94a3b8]">AIS Tracks</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-block h-0.5 w-3.5 bg-[#f59e0b]" />
                        <span className="font-semibold text-[#f59e0b]">Winner Path</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-block h-2 w-3 border border-dashed border-[#06b6d4] bg-[#06b6d4]/20 rounded-sm" />
                        <span className="text-[#a5f3fc]">Forecast Area</span>
                    </div>
                </div>

                {/* Compact Tactical Scale Bar */}
                <div className="mt-2 border-t border-[#162c44]/80 pt-1.5">
                    <div className="flex justify-between text-[7.5px] font-mono text-[#64748b]">
                        <span>0</span>
                        <span>10</span>
                        <span>20 km</span>
                    </div>
                    <div className="relative mt-0.5 h-1 w-full border-b border-l border-r border-[#334e68]">
                        <div className="absolute left-1/2 top-0 h-1 w-px bg-[#334e68]" />
                    </div>
                </div>
            </div>

            {/* BOTTOM-RIGHT: Tactical Map Controls (Compass + Recenter + Zoom) */}
            <div className="absolute bottom-3.5 right-3.5 z-20 flex flex-col items-center gap-1.5">
                {/* Compass / Reset North & Pitch */}
                <button
                    type="button"
                    onClick={() => mapInstance?.resetNorthPitch({ duration: 300 })}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#162c44] bg-[#050f1d]/85 text-[#7ab8d0] shadow-lg backdrop-blur-md transition hover:border-[#00d4ff]/60 hover:bg-[#0c2438] hover:text-[#00d4ff]"
                    title="Reset North & Pitch"
                >
                    <div className="relative flex flex-col items-center">
                        <span className="text-[7px] font-bold text-[#e2e8f0] -mb-1">N</span>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                            <polygon points="12 2 18 21 12 17 6 21 12 2" fill="#ef4444" />
                            <polygon points="12 17 18 21 12 2" fill="#94a3b8" />
                        </svg>
                    </div>
                </button>

                {/* Recenter Incident Centroid */}
                <button
                    type="button"
                    onClick={() => {
                        const lon = analysis?.detection?.centroid_latlon?.lon ?? 75.35;
                        const lat = analysis?.detection?.centroid_latlon?.lat ?? 9.25;
                        mapInstance?.flyTo({ center: [lon, lat], zoom: 7.6, duration: 400 });
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#162c44] bg-[#050f1d]/85 text-[#7ab8d0] shadow-lg backdrop-blur-md transition hover:border-[#00d4ff]/60 hover:bg-[#0c2438] hover:text-[#00d4ff]"
                    title="Recenter Incident"
                >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="7" />
                        <line x1="12" y1="1" x2="12" y2="5" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="1" y1="12" x2="5" y2="12" />
                        <line x1="19" y1="12" x2="23" y2="12" />
                    </svg>
                </button>

                {/* Stacked Zoom Control Pill */}
                <div className="flex flex-col overflow-hidden rounded-lg border border-[#162c44] bg-[#050f1d]/85 shadow-lg backdrop-blur-md">
                    <button
                        type="button"
                        onClick={() => mapInstance?.zoomIn({ duration: 200 })}
                        className="flex h-7 w-7 items-center justify-center text-[#cbd5e1] transition hover:bg-[#0c2438] hover:text-[#00d4ff]"
                        title="Zoom In"
                    >
                        <span className="text-sm font-bold leading-none">+</span>
                    </button>
                    <div className="h-px w-full bg-[#162c44]" />
                    <button
                        type="button"
                        onClick={() => mapInstance?.zoomOut({ duration: 200 })}
                        className="flex h-7 w-7 items-center justify-center text-[#cbd5e1] transition hover:bg-[#0c2438] hover:text-[#00d4ff]"
                        title="Zoom Out"
                    >
                        <span className="text-sm font-bold leading-none">−</span>
                    </button>
                </div>
            </div>

            {/* TACTICAL HINDCAST REPLAY BUTTON */}
            {investigationTab === "Hindcast" && (
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20">
                    <button
                        type="button"
                        onClick={() => setHindcastRun((r) => r + 1)}
                        className="flex items-center gap-2 rounded-lg border border-[#00d4ff]/40 bg-[#051326]/90 px-3 py-1.5 text-xs font-semibold text-[#38bdf8] shadow-[0_0_15px_rgba(0,212,255,0.25)] backdrop-blur-md transition hover:border-[#00d4ff] hover:bg-[#082240] hover:text-white"
                        title="Replay forensic backtracking drift animation"
                    >
                        <svg className="h-3.5 w-3.5 animate-spin-once" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                        </svg>
                        <span className="tracking-wide">REPLAY BACKTRACK</span>
                    </button>
                </div>
            )}

            {/* TACTICAL FORECAST REPLAY BUTTON */}
            {investigationTab === "Forecast" && (
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20">
                    <button
                        type="button"
                        onClick={() => setForecastRun((r) => r + 1)}
                        className="flex items-center gap-2 rounded-lg border border-[#06b6d4]/40 bg-[#051326]/90 px-3 py-1.5 text-xs font-semibold text-[#22d4ee] shadow-[0_0_15px_rgba(6,182,212,0.25)] backdrop-blur-md transition hover:border-[#22d4ee] hover:bg-[#082240] hover:text-white"
                        title="Replay hydrodynamic drift forecast animation"
                    >
                        <svg className="h-3.5 w-3.5 animate-spin-once" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                        </svg>
                        <span className="tracking-wide">REPLAY FORECAST</span>
                    </button>
                </div>
            )}

            {/* BOTTOM-CENTER: Floating Investigation Navigation Pill */}
            <div className="absolute bottom-3.5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-xl border border-[#162c44] bg-[#050f1d]/90 p-1 shadow-xl backdrop-blur-md">
                {navigationTabs.map((tab) => {
                    const isActive = investigationTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => onTabChange?.(tab.id)}
                            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                                isActive
                                    ? "bg-[#0070f3] text-white shadow-[0_0_10px_rgba(0,112,243,0.4)]"
                                    : "text-[#7a9bb5] hover:bg-[#0c2238] hover:text-[#f8fafc]"
                            }`}
                        >
                            <span>{tab.icon}</span>
                            <span className="hidden md:inline">{tab.label}</span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}

