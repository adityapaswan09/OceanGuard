import { useEffect, useRef, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Geometry } from "geojson";

import { API_BASE_URL } from "../../services/api";
import type { AisTrack, SpillAnalysis } from "../../types/intelligence";

type RegionRecord = {
    id: number;
    name: string;
    geometry: Geometry;
};

type SpillRecord = {
    id: number;
};

interface MapViewProps {
    activeLayer?: string;
    investigationTab?: string;
    aisTracks?: AisTrack[];
    highlightedVesselId?: number | null;
    analysis?: SpillAnalysis | null;
    cawActive?: boolean;
    winningVesselId?: number | null;
    isIdentifying?: boolean;
    identifyRun?: number;
    identified?: boolean;
    onVesselSelect?: (vesselId: number) => void;
}

const emptyCollection: FeatureCollection = {
    type: "FeatureCollection",
    features: [],
};

const publicRasterStyle = {
    version: 8 as const,
    sources: {
        esriSatellite: {
            type: "raster" as const,
            tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
            tileSize: 256,
            attribution: "Tiles © Esri",
        },
    },
    layers: [{ id: "esri-satellite", type: "raster" as const, source: "esriSatellite" }],
};

function asFeatureCollection(geometry: Geometry | undefined, properties: Record<string, unknown>): FeatureCollection {
    return geometry
        ? { type: "FeatureCollection", features: [{ type: "Feature", geometry, properties }] }
        : emptyCollection;
}

function regionCenter(geometry: Geometry): [number, number] {
    if (geometry.type === "Polygon") return geometry.coordinates[0][0] as [number, number];
    if (geometry.type === "MultiPolygon") return geometry.coordinates[0][0][0] as [number, number];
    if (geometry.type === "Point") return geometry.coordinates as [number, number];
    return [75.77, 9.5];
}

// All map layers created once in declaration order. Paint properties that need
// dynamic updates are applied separately in the data-draw effect.
const STATIC_LAYERS: Array<{ id: string; spec: maplibregl.LayerSpecification }> = [
    { id: "region-fill", spec: { id: "region-fill", type: "fill", source: "region", paint: { "fill-color": "#1a4a6a", "fill-opacity": 0.06 } } },
    { id: "region-line", spec: { id: "region-line", type: "line", source: "region", paint: { "line-color": "#2a5a7a", "line-width": 1, "line-opacity": 0.5 } } },
    { id: "spill-fill", spec: { id: "spill-fill", type: "fill", source: "spill-polygon", paint: { "fill-color": "#b85a3a", "fill-opacity": 0.28 } } },
    { id: "spill-outline", spec: { id: "spill-outline", type: "line", source: "spill-polygon", paint: { "line-color": "#d97a4a", "line-width": 1.5, "line-opacity": 0.85, "line-dasharray": [3, 2] } } },
    { id: "spill-centroid-ring", spec: { id: "spill-centroid-ring", type: "circle", source: "spill-centroid", paint: { "circle-color": "#d97a4a", "circle-radius": 12, "circle-stroke-color": "#d97a4a", "circle-stroke-width": 1, "circle-opacity": 0.15, "circle-blur": 0 } } },
    { id: "spill-centroid", spec: { id: "spill-centroid", type: "circle", source: "spill-centroid", paint: { "circle-color": "#d97a4a", "circle-radius": 5, "circle-stroke-color": "#f0d0b0", "circle-stroke-width": 1.5, "circle-opacity": 0.9 } } },
    { id: "spill-label", spec: { id: "spill-label", type: "symbol", source: "spill-label", layout: { "text-field": ["get", "label"], "text-size": 10, "text-anchor": "left", "text-offset": [1.0, 0], "text-allow-overlap": true, "text-letter-spacing": 0.06 }, paint: { "text-color": "#e8c0a0", "text-halo-color": "#0a1828", "text-halo-width": 2 } } },
    { id: "hindcast-reference-line", spec: { id: "hindcast-reference-line", type: "line", source: "hindcast-origin-reference", paint: { "line-color": "#4a8ec4", "line-width": 1.2, "line-opacity": 0.6, "line-dasharray": [4, 3] } } },
    { id: "hindcast-origin-ring", spec: { id: "hindcast-origin-ring", type: "circle", source: "hindcast-origin-marker", paint: { "circle-color": "#4a8ec4", "circle-radius": 12, "circle-stroke-color": "#4a8ec4", "circle-stroke-width": 1, "circle-opacity": 0.18, "circle-blur": 0 } } },
    { id: "hindcast-origin-marker", spec: { id: "hindcast-origin-marker", type: "circle", source: "hindcast-origin-marker", paint: { "circle-color": "#4a8ec4", "circle-radius": 6, "circle-stroke-color": "#a8d4f0", "circle-stroke-width": 1.5, "circle-opacity": 0.95 } } },
    { id: "hindcast-origin-label", spec: { id: "hindcast-origin-label", type: "symbol", source: "hindcast-origin-label", layout: { "text-field": ["get", "label"], "text-size": 9, "text-anchor": "left", "text-offset": [1.0, 0], "text-allow-overlap": true, "text-letter-spacing": 0.05 }, paint: { "text-color": "#a8d4f0", "text-halo-color": "#0a1828", "text-halo-width": 2 } } },
    { id: "forecast-centroid-ring", spec: { id: "forecast-centroid-ring", type: "circle", source: "forecast-centroid", paint: { "circle-color": "#22d4ee", "circle-radius": 12, "circle-stroke-color": "#22d4ee", "circle-stroke-width": 1, "circle-opacity": 0.18, "circle-blur": 0 } } },
    { id: "forecast-centroid", spec: { id: "forecast-centroid", type: "circle", source: "forecast-centroid", paint: { "circle-color": "#22d4ee", "circle-radius": 6, "circle-stroke-color": "#a0ecf4", "circle-stroke-width": 1.5, "circle-opacity": 0.9 } } },
    { id: "forecast-centroid-label", spec: { id: "forecast-centroid-label", type: "symbol", source: "forecast-centroid-label", layout: { "text-field": ["get", "label"], "text-size": 9, "text-anchor": "left", "text-offset": [1.0, 0], "text-allow-overlap": true, "text-letter-spacing": 0.05 }, paint: { "text-color": "#a0ecf4", "text-halo-color": "#0a1828", "text-halo-width": 2 } } },
    { id: "ais-vessel-tracks", spec: { id: "ais-vessel-tracks", type: "line", source: "ais-vessel-tracks", paint: { "line-color": "#5b7a99", "line-width": 1.4, "line-opacity": 0.6 } } },
    { id: "ais-vessel-markers", spec: { id: "ais-vessel-markers", type: "circle", source: "ais-vessel-markers", paint: { "circle-color": "#3e5a73", "circle-radius": 4, "circle-stroke-color": "rgba(180,200,220,0.6)", "circle-stroke-width": 1, "circle-opacity": 0.8 } } },
];

const ALL_LAYER_IDS = STATIC_LAYERS.map((l) => l.id);
const ALL_SOURCE_IDS = [
    "region", "spill-polygon", "spill-centroid", "spill-label",
    "hindcast-origin-marker", "hindcast-origin-label", "hindcast-origin-reference",
    "forecast-centroid", "forecast-centroid-label",
    "ais-vessel-tracks", "ais-vessel-markers",
];

export function MapView({
    activeLayer = "Satellite",
    investigationTab = "Overview",
    aisTracks = [],
    highlightedVesselId = null,
    analysis = null,
    cawActive = false,
    winningVesselId = null,
    isIdentifying = false,
    identifyRun = 0,
    identified = false,
    onVesselSelect,
}: MapViewProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    const layersInitializedRef = useRef(false);
    const clickHandlerRef = useRef<((e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => void) | null>(null);
    const [region, setRegion] = useState<RegionRecord | null>(null);
    const [spillId, setSpillId] = useState<number | null>(null);
    const [loadError, setLoadError] = useState(false);
    const animationStateRef = useRef<{ runId: number | null; frameId: number | null; hasPlayed: boolean }>({ runId: null, frameId: null, hasPlayed: false });
    const spillFocusRunRef = useRef(0);

    // --- Fetch region + spill metadata ---
    useEffect(() => {
        let cancelled = false;
        Promise.all([
            fetch(`${API_BASE_URL}/regions/`).then((response) => response.json() as Promise<RegionRecord[]>),
            fetch(`${API_BASE_URL}/spills/`).then((response) => response.json() as Promise<{ items: SpillRecord[] }>),
        ])
            .then(([regions, spills]) => {
                if (cancelled) return;
                setRegion(regions[0] ?? null);
                setSpillId(spills.items[0]?.id ?? null);
            })
            .catch(() => {
                if (!cancelled) setLoadError(true);
            });
        return () => { cancelled = true; };
    }, []);

    // --- Initialize map once ---
    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: publicRasterStyle,
            center: [75.77, 9.5],
            zoom: 7.5,
            attributionControl: { compact: true },
        });
        // Navigation at bottom-right so it doesn't collide with the layer switcher at top-right.
        map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizeRoll: true }), "bottom-right");
        mapRef.current = map;

        // --- Resize handling: container size changes + window resize ---
        const resizeMap = () => map.resize();
        const ro = new ResizeObserver(resizeMap);
        if (containerRef.current) ro.observe(containerRef.current);
        window.addEventListener("resize", resizeMap);

        return () => {
            ro.disconnect();
            window.removeEventListener("resize", resizeMap);
            map.remove();
            mapRef.current = null;
            layersInitializedRef.current = false;
        };
    }, []);

    // --- Create all sources + layers exactly once after style load ---
    const ensureLayers = useCallback(() => {
        const map = mapRef.current;
        if (!map || layersInitializedRef.current) return;

        // Add all GeoJSON sources with empty data first.
        for (const id of ALL_SOURCE_IDS) {
            if (!map.getSource(id)) {
                map.addSource(id, { type: "geojson", data: emptyCollection });
            }
        }
        // Add all static layers in order.
        for (const { id, spec } of STATIC_LAYERS) {
            if (!map.getLayer(id)) {
                map.addLayer(spec);
            }
        }

        // CAW winner layers (created once, visibility toggled later).
        if (!map.getSource("caw-winner-marker")) {
            map.addSource("caw-winner-marker", { type: "geojson", data: emptyCollection });
        }
        if (!map.getSource("caw-approach-line")) {
            map.addSource("caw-approach-line", { type: "geojson", data: emptyCollection });
        }
        if (!map.getLayer("caw-approach-line")) {
            map.addLayer({ id: "caw-approach-line", type: "line", source: "caw-approach-line", paint: { "line-color": "#f0a040", "line-width": 1.5, "line-opacity": 0.7, "line-dasharray": [3, 3] } });
        }
        if (!map.getLayer("caw-winner-ring")) {
            map.addLayer({ id: "caw-winner-ring", type: "circle", source: "caw-winner-marker", paint: { "circle-color": "#f0a040", "circle-radius": 14, "circle-stroke-color": "#f0a040", "circle-stroke-width": 1, "circle-opacity": 0.18, "circle-blur": 0 } });
        }
        if (!map.getLayer("caw-winner-marker")) {
            map.addLayer({ id: "caw-winner-marker", type: "circle", source: "caw-winner-marker", paint: { "circle-color": "#f0a040", "circle-radius": 8, "circle-stroke-color": "#fff0d0", "circle-stroke-width": 2, "circle-opacity": 0.95 } });
        }

        layersInitializedRef.current = true;
    }, []);

    // --- Update source data + dynamic paint properties (runs on every relevant prop change) ---
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !region) return;

        const drawData = () => {
            ensureLayers();

            const regionData = asFeatureCollection(region.geometry, { name: region.name, layer: "region" });
            const spillPolygon: Geometry | undefined = analysis
                ? { type: "Polygon", coordinates: [analysis.detection.polygon_latlon] }
                : undefined;
            const spillCentroid: Geometry | undefined = analysis
                ? { type: "Point", coordinates: [analysis.detection.centroid_latlon.lon, analysis.detection.centroid_latlon.lat] }
                : undefined;
            const spillData = asFeatureCollection(spillPolygon, { id: spillId ?? 1, layer: "spill-polygon" });
            const spillProperties = {
                id: spillId ?? 1,
                label: `DETECTED SPILL\nMS-${String(spillId ?? 1).padStart(3, "0")} · ${Math.round((analysis?.detection.confidence ?? 0) * 100)}%`,
                layer: "spill-label",
            };
            const centroidData = asFeatureCollection(spillCentroid, { id: spillId ?? 1, layer: "spill-centroid" });
            const labelData = asFeatureCollection(spillCentroid, spillProperties);
            const hindcastOriginLonLat: [number, number] | null = analysis
                ? [analysis.backward_hindcast.hypothesized_origin_lonlat.lon, analysis.backward_hindcast.hypothesized_origin_lonlat.lat]
                : null;
            const hindcastOriginData = hindcastOriginLonLat
                ? asFeatureCollection({ type: "Point", coordinates: hindcastOriginLonLat }, { layer: "hindcast-origin-marker" })
                : emptyCollection;
            const hindcastOriginLabelData = hindcastOriginLonLat
                ? asFeatureCollection({ type: "Point", coordinates: hindcastOriginLonLat }, { label: "HINDCAST ORIGIN", layer: "hindcast-origin-label" })
                : emptyCollection;
            const spillCentroidLonLat: [number, number] | null = spillCentroid?.type === "Point" ? (spillCentroid.coordinates as [number, number]) : null;
            const hindcastReferenceData = hindcastOriginLonLat && spillCentroidLonLat
                ? asFeatureCollection({ type: "LineString", coordinates: [hindcastOriginLonLat, spillCentroidLonLat] }, { label: "origin→detection", layer: "hindcast-origin-reference" })
                : emptyCollection;
            const forecastCentroidLonLat: [number, number] | null = analysis
                ? [analysis.forward_forecast_centroid_lonlat.lon, analysis.forward_forecast_centroid_lonlat.lat]
                : null;
            const forecastCentroidData = forecastCentroidLonLat
                ? asFeatureCollection({ type: "Point", coordinates: forecastCentroidLonLat }, { layer: "forecast-centroid" })
                : emptyCollection;
            const forecastCentroidLabelData = forecastCentroidLonLat
                ? asFeatureCollection({ type: "Point", coordinates: forecastCentroidLonLat }, { label: "24H FORECAST", layer: "forecast-centroid-label" })
                : emptyCollection;
            const aisTrackData: FeatureCollection = {
                type: "FeatureCollection",
                features: aisTracks.filter((track) => track.points.length > 1).map((track) => ({
                    type: "Feature",
                    geometry: { type: "LineString", coordinates: track.points.map((point) => [point.longitude, point.latitude]) },
                    properties: { vesselId: track.vesselId, vesselName: track.vesselName },
                })),
            };
            const aisMarkerData: FeatureCollection = {
                type: "FeatureCollection",
                features: aisTracks
                    .filter((track) => track.points.length > 0)
                    .filter((track) => !(cawActive && winningVesselId !== null && track.vesselId === winningVesselId && !identified))
                    .map((track) => {
                    const point = track.points[track.points.length - 1];
                    return {
                        type: "Feature",
                        geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
                        properties: { vesselId: track.vesselId, vesselName: track.vesselName, vesselType: track.vesselType ?? "Unknown", flag: track.flag ?? "Unknown", timestamp: point.timestamp, speedKnots: point.speed_knots, courseDegrees: point.course_degrees },
                    };
                }),
            };

            const setSource = (id: string, data: FeatureCollection) => {
                const source = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
                if (source) source.setData(data);
                else map.addSource(id, { type: "geojson", data });
            };

            setSource("region", regionData);
            setSource("spill-polygon", spillData);
            setSource("spill-centroid", centroidData);
            setSource("spill-label", labelData);
            setSource("hindcast-origin-marker", hindcastOriginData);
            setSource("hindcast-origin-label", hindcastOriginLabelData);
            setSource("hindcast-origin-reference", hindcastReferenceData);
            setSource("forecast-centroid", forecastCentroidData);
            setSource("forecast-centroid-label", forecastCentroidLabelData);
            setSource("ais-vessel-tracks", aisTrackData);
            setSource("ais-vessel-markers", aisMarkerData);

            // --- IDENTIFY SUSPECTS step A: first identification camera focus ---
            if (isIdentifying && identifyRun > spillFocusRunRef.current && !identified) {
                spillFocusRunRef.current = identifyRun;
                if (analysis) {
                    const polygon = analysis.detection.polygon_latlon;
                    if (polygon.length > 0) {
                        let minLon = polygon[0][0], maxLon = polygon[0][0], minLat = polygon[0][1], maxLat = polygon[0][1];
                        for (const [lon, lat] of polygon) {
                            if (lon < minLon) minLon = lon;
                            if (lon > maxLon) maxLon = lon;
                            if (lat < minLat) minLat = lat;
                            if (lat > maxLat) maxLat = lat;
                        }
                        map.fitBounds([minLon, minLat, maxLon, maxLat], { padding: 110, duration: 700, maxZoom: 11 });
                    } else {
                        map.flyTo({ center: [analysis.detection.centroid_latlon.lon, analysis.detection.centroid_latlon.lat], zoom: 9, duration: 700 });
                    }
                }
            }

            // --- Visibility control by investigation tab ---
            const hindcastVisible = investigationTab === "Hindcast";
            ["hindcast-origin-marker", "hindcast-origin-ring", "hindcast-origin-label", "hindcast-reference-line"].forEach((layerId) => {
                if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", hindcastVisible ? "visible" : "none");
            });

            const forecastVisible = investigationTab === "Forecast" && !!analysis;
            ["forecast-centroid", "forecast-centroid-ring", "forecast-centroid-label"].forEach((layerId) => {
                if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", forecastVisible ? "visible" : "none");
            });

            const aisVisible = investigationTab === "AIS Analysis" || (highlightedVesselId !== null && investigationTab === "Suspects");
            ["ais-vessel-tracks", "ais-vessel-markers"].forEach((layerId) => {
                if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", aisVisible ? "visible" : "none");
            });

            // --- Dynamic paint properties for AIS tracks ---
            if (map.getLayer("ais-vessel-tracks")) {
                const isWinnerExpr = ["==", ["get", "vesselId"], cawActive && winningVesselId !== null ? winningVesselId : -1] as any;
                const isHighlightedExpr = ["==", ["get", "vesselId"], highlightedVesselId ?? -1] as any;
                map.setPaintProperty("ais-vessel-tracks", "line-color", ["case", isWinnerExpr, "#f0a040", isHighlightedExpr, "#d97a4a", "#5b7a99"] as any);
                map.setPaintProperty("ais-vessel-tracks", "line-width", ["case", isWinnerExpr, 3.5, isHighlightedExpr, 2.5, cawActive ? 1.0 : 1.4] as any);
                map.setPaintProperty("ais-vessel-tracks", "line-opacity", ["case", isWinnerExpr, 0.85, cawActive ? 0.25 : 0.55] as any);
            }
            if (map.getLayer("ais-vessel-markers")) {
                const isWinnerExpr = ["==", ["get", "vesselId"], cawActive && winningVesselId !== null ? winningVesselId : -1] as any;
                map.setPaintProperty("ais-vessel-markers", "circle-color", ["case", isWinnerExpr, "#f0a040", cawActive ? "rgba(62, 90, 115, 0.3)" : "#3e5a73"] as any);
                map.setPaintProperty("ais-vessel-markers", "circle-radius", ["case", isWinnerExpr, 7, cawActive ? 3 : 4] as any);
                map.setPaintProperty("ais-vessel-markers", "circle-opacity", ["case", isWinnerExpr, 0.95, cawActive ? 0.5 : 0.8] as any);
                map.setPaintProperty("ais-vessel-markers", "circle-stroke-color", ["case", isWinnerExpr, "#fff0d0", "rgba(180,200,220,0.6)"] as any);
                map.setPaintProperty("ais-vessel-markers", "circle-stroke-width", ["case", isWinnerExpr, 2, 1] as any);
            }

            // --- CAW winner layers visibility ---
            ["caw-winner-marker", "caw-winner-ring", "caw-approach-line"].forEach((layerId) => {
                if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", cawActive && winningVesselId !== null ? "visible" : "none");
            });

            // --- CAW winner animation (first identification only) ---
            if (cawActive && !isIdentifying && winningVesselId !== null && hindcastOriginLonLat && !animationStateRef.current.hasPlayed && animationStateRef.current?.runId !== identifyRun) {
                if (animationStateRef.current?.frameId !== null && animationStateRef.current.frameId !== undefined) {
                    cancelAnimationFrame(animationStateRef.current.frameId as number);
                }
                animationStateRef.current = { runId: null, frameId: null, hasPlayed: false };
                const winningTrack = aisTracks.find((track) => track.vesselId === winningVesselId);
                const lastFix = winningTrack?.points[winningTrack.points.length - 1];
                if (lastFix && hindcastOriginLonLat) {
                    const start: [number, number] = [lastFix.longitude, lastFix.latitude];
                    const end: [number, number] = [hindcastOriginLonLat[0], hindcastOriginLonLat[1]];
                    const durationMs = 1800;
                    const startedAt = Date.now();
                    const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
                    const paintAnimatedWinner = (lon: number, lat: number) => {
                        const markerCollection: FeatureCollection = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: { winningVesselId } }] };
                        const approachCollection: FeatureCollection = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [start, [lon, lat]] }, properties: {} }] };
                        const markerSource = map.getSource("caw-winner-marker") as maplibregl.GeoJSONSource | undefined;
                        if (markerSource) markerSource.setData(markerCollection);
                        const approachSource = map.getSource("caw-approach-line") as maplibregl.GeoJSONSource | undefined;
                        if (approachSource) approachSource.setData(approachCollection);
                    };
                    paintAnimatedWinner(start[0], start[1]);
                    const startAnimation = () => {
                        if (animationStateRef.current?.runId === identifyRun && animationStateRef.current.frameId !== null) return;
                        animationStateRef.current.hasPlayed = true;
                        animationStateRef.current = { runId: identifyRun, frameId: null, hasPlayed: true };
                        const animStep = () => {
                            const elapsed = Date.now() - startedAt;
                            const t = Math.min(elapsed / durationMs, 1);
                            const eased = easeInOutCubic(t);
                            const lon = start[0] + (end[0] - start[0]) * eased;
                            const lat = start[1] + (end[1] - start[1]) * eased;
                            paintAnimatedWinner(lon, lat);
                            if (t < 1) {
                                animationStateRef.current = { runId: identifyRun, frameId: requestAnimationFrame(animStep), hasPlayed: true };
                            } else {
                                paintAnimatedWinner(end[0], end[1]);
                                animationStateRef.current = { runId: identifyRun, frameId: null, hasPlayed: true };
                            }
                        };
                        animationStateRef.current = { runId: identifyRun, frameId: requestAnimationFrame(animStep), hasPlayed: true };
                    };
                    map.fitBounds([start, end], { padding: 120, duration: 700, maxZoom: 13 });
                    let animationKicked = false;
                    const kick = () => {
                        if (animationKicked || animationStateRef.current?.runId === identifyRun) return;
                        animationKicked = true;
                        startAnimation();
                    };
                    map.once("moveend", kick);
                    window.setTimeout(kick, 800);
                }
            }
        };

        if (map.isStyleLoaded()) drawData();
        else map.once("load", drawData);
    }, [region, spillId, analysis, investigationTab, aisTracks, highlightedVesselId, cawActive, winningVesselId, isIdentifying, identifyRun, identified, ensureLayers]);

    // --- Vessel click handler: register once, update via ref to avoid stacking ---
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        const handler = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
            const feature = e.features?.[0];
            if (!feature?.geometry || feature.geometry.type !== "Point") return;
            const props = feature.properties ?? {};
            const vesselId = Number(props.vesselId);
            if (!Number.isNaN(vesselId) && onVesselSelect) {
                onVesselSelect(vesselId);
            }
            // Show compact info popup
            const content = document.createElement("div");
            content.className = "text-xs leading-5";
            content.innerHTML = `<strong style="color:#e8f0f5">${String(props.vesselName ?? "Vessel")}</strong><br/><span style="color:#7a9ab0">${String(props.vesselType ?? "Unknown")} · ${String(props.flag ?? "Unknown")}</span><br/><span style="color:#5a7d96;font-size:10px">${String(props.speedKnots)} kn · ${String(props.courseDegrees)}°</span>`;
            new maplibregl.Popup({ closeButton: true, offset: 10 }).setLngLat(feature.geometry.coordinates as [number, number]).setDOMContent(content).addTo(map);
        };

        // Register once only
        if (!clickHandlerRef.current) {
            map.on("click", "ais-vessel-markers", handler);
            clickHandlerRef.current = handler;
        }
        map.on("mouseenter", "ais-vessel-markers", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "ais-vessel-markers", () => { map.getCanvas().style.cursor = ""; });
    }, [onVesselSelect]);

    // --- Spill layer visibility follows activeLayer ---
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !map.isStyleLoaded()) return;
        ["region-fill", "region-line", "spill-fill", "spill-outline", "spill-centroid", "spill-centroid-ring", "spill-label"].forEach((layerId) => {
            if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "visible");
        });
    }, [activeLayer]);

    return (
        <div className="absolute inset-0">
            <div className="absolute inset-0" ref={containerRef} />
            {/* Region label — top-left, non-interactive */}
            <div className="pointer-events-none absolute left-3 top-3 rounded-sm border border-[#1e3a52] bg-[#020b14]/90 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.14em] text-[#7ab8d0]">
                {region?.name ?? "Arabian Sea"} · Live Map
            </div>
            {/* Coordinate readout — bottom-left, monospace, non-interactive */}
            <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-sm border border-[#1e3a52] bg-[#020b14]/90 px-3 py-1.5 font-mono text-[10px] text-[#7ab8d0]">
                {analysis ? (
                    <>
                        <span className="text-[#5a7d96]">LAT</span> <b className="text-[#a8d4f0]">{analysis.detection.centroid_latlon.lat.toFixed(2)}°N</b>
                        <span className="mx-2 text-[#3a5a72]">|</span>
                        <span className="text-[#5a7d96]">LON</span> <b className="text-[#a8d4f0]">{analysis.detection.centroid_latlon.lon.toFixed(2)}°E</b>
                    </>
                ) : (
                    <span className="text-[#5a7d96]">Awaiting telemetry…</span>
                )}
            </div>
            {/* Map legend — bottom-center, compact, non-interactive */}
            <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 rounded-sm border border-[#1e3a52] bg-[#020b14]/90 px-3 py-2 sm:block">
                <p className="mb-1.5 text-[8px] font-semibold uppercase tracking-[.18em] text-[#5a7d96]">Map Legend</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-[#9bb8c4]">
                    <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[#d97a4a]" />Spill</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[#4a8ec4]" />Hindcast</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[#22d4ee]" />Forecast</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[#f0a040]" />Winner</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-0.5 bg-[#5b7a99]" />AIS Track</span>
                    <span className="flex items-center gap-1.5"><svg width="12" height="2" className="inline-block"><line x1="0" y1="1" x2="12" y2="1" stroke="#f0a040" strokeWidth="1.5" strokeDasharray="3 3" /></svg>Hindcast Path</span>
                </div>
            </div>
            {/* Error banner */}
            {loadError && <div className="pointer-events-none absolute bottom-3 right-20 z-10 rounded-sm border border-[#b85a3a]/50 bg-[#020b14]/95 px-3 py-1.5 text-[10px] text-[#d97a4a]">API data unavailable · basemap active</div>}
        </div>
    );
}
