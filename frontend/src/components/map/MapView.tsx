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

// All map layers created once in declaration order with strict visual hierarchy:
// PRIMARY: Detected Oil Spill (Alert red-orange)
// SECONDARY: Hindcast origin (Sky blue) & Forecast dispersion envelope (Cyan)
// TERTIARY: AIS vessel tracks & fleet markers (Subtle slate-navy)
// WINNER: Golden/amber highlighted vessel trajectory
const STATIC_LAYERS: Array<{ id: string; spec: maplibregl.LayerSpecification }> = [
    { id: "region-fill", spec: { id: "region-fill", type: "fill", source: "region", paint: { "fill-color": "#061a2b", "fill-opacity": 0.08 } } },
    { id: "region-line", spec: { id: "region-line", type: "line", source: "region", paint: { "line-color": "#1b3852", "line-width": 1, "line-opacity": 0.4 } } },
    // PRIMARY: Oil Spill Slick
    { id: "spill-fill", spec: { id: "spill-fill", type: "fill", source: "spill-polygon", paint: { "fill-color": "#dc2626", "fill-opacity": 0.35 } } },
    { id: "spill-outline", spec: { id: "spill-outline", type: "line", source: "spill-polygon", paint: { "line-color": "#f97316", "line-width": 2, "line-opacity": 0.9, "line-dasharray": [3, 2] } } },
    { id: "spill-centroid-ring", spec: { id: "spill-centroid-ring", type: "circle", source: "spill-centroid", paint: { "circle-color": "#ef4444", "circle-radius": 14, "circle-stroke-color": "#ef4444", "circle-stroke-width": 1.5, "circle-opacity": 0.2, "circle-blur": 0 } } },
    { id: "spill-centroid", spec: { id: "spill-centroid", type: "circle", source: "spill-centroid", paint: { "circle-color": "#ef4444", "circle-radius": 5.5, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2, "circle-opacity": 1 } } },
    { id: "spill-label", spec: { id: "spill-label", type: "symbol", source: "spill-label", layout: { "text-field": ["get", "label"], "text-size": 10, "text-anchor": "left", "text-offset": [1.1, 0], "text-allow-overlap": true, "text-letter-spacing": 0.06 }, paint: { "text-color": "#fed7aa", "text-halo-color": "#020912", "text-halo-width": 2 } } },
    // SECONDARY: Hindcast Origin
    { id: "hindcast-reference-line", spec: { id: "hindcast-reference-line", type: "line", source: "hindcast-origin-reference", paint: { "line-color": "#0284c7", "line-width": 1.4, "line-opacity": 0.7, "line-dasharray": [4, 3] } } },
    { id: "hindcast-origin-ring", spec: { id: "hindcast-origin-ring", type: "circle", source: "hindcast-origin-marker", paint: { "circle-color": "#0284c7", "circle-radius": 13, "circle-stroke-color": "#0284c7", "circle-stroke-width": 1.5, "circle-opacity": 0.2, "circle-blur": 0 } } },
    { id: "hindcast-origin-marker", spec: { id: "hindcast-origin-marker", type: "circle", source: "hindcast-origin-marker", paint: { "circle-color": "#0284c7", "circle-radius": 6.5, "circle-stroke-color": "#e0f2fe", "circle-stroke-width": 2, "circle-opacity": 0.95 } } },
    { id: "hindcast-origin-label", spec: { id: "hindcast-origin-label", type: "symbol", source: "hindcast-origin-label", layout: { "text-field": ["get", "label"], "text-size": 9, "text-anchor": "left", "text-offset": [1.1, 0], "text-allow-overlap": true, "text-letter-spacing": 0.05 }, paint: { "text-color": "#bae6fd", "text-halo-color": "#020912", "text-halo-width": 2 } } },
    // SECONDARY: Forecast 24h Dispersion & Uncertainty Envelope
    { id: "forecast-envelope-fill", spec: { id: "forecast-envelope-fill", type: "fill", source: "forecast-envelope", paint: { "fill-color": "#06b6d4", "fill-opacity": 0.16 } } },
    { id: "forecast-envelope-outline", spec: { id: "forecast-envelope-outline", type: "line", source: "forecast-envelope", paint: { "line-color": "#06b6d4", "line-width": 1.5, "line-opacity": 0.75, "line-dasharray": [3, 2] } } },
    { id: "forecast-centroid-ring", spec: { id: "forecast-centroid-ring", type: "circle", source: "forecast-centroid", paint: { "circle-color": "#22d4ee", "circle-radius": 13, "circle-stroke-color": "#22d4ee", "circle-stroke-width": 1.5, "circle-opacity": 0.2, "circle-blur": 0 } } },
    { id: "forecast-centroid", spec: { id: "forecast-centroid", type: "circle", source: "forecast-centroid", paint: { "circle-color": "#22d4ee", "circle-radius": 6, "circle-stroke-color": "#cffafe", "circle-stroke-width": 2, "circle-opacity": 0.95 } } },
    { id: "forecast-centroid-label", spec: { id: "forecast-centroid-label", type: "symbol", source: "forecast-centroid-label", layout: { "text-field": ["get", "label"], "text-size": 9, "text-anchor": "left", "text-offset": [1.1, 0], "text-allow-overlap": true, "text-letter-spacing": 0.05 }, paint: { "text-color": "#a5f3fc", "text-halo-color": "#020912", "text-halo-width": 2 } } },
    // TERTIARY: AIS Fleet Tracks & Markers (Subtle, unobtrusive)
    { id: "ais-vessel-tracks", spec: { id: "ais-vessel-tracks", type: "line", source: "ais-vessel-tracks", paint: { "line-color": "#475569", "line-width": 1.2, "line-opacity": 0.5 } } },
    { id: "ais-vessel-markers", spec: { id: "ais-vessel-markers", type: "circle", source: "ais-vessel-markers", paint: { "circle-color": "#334155", "circle-radius": 3.5, "circle-stroke-color": "rgba(148, 163, 184, 0.6)", "circle-stroke-width": 1, "circle-opacity": 0.75 } } },
];

const ALL_LAYER_IDS = STATIC_LAYERS.map((l) => l.id);
const ALL_SOURCE_IDS = [
    "region", "spill-polygon", "spill-centroid", "spill-label",
    "hindcast-origin-marker", "hindcast-origin-label", "hindcast-origin-reference",
    "forecast-centroid", "forecast-centroid-label", "forecast-envelope",
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
    const [cursorCoords, setCursorCoords] = useState<{ lon: number; lat: number } | null>(null);
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
        mapRef.current = map;

        // Track live coordinates on hover
        const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
            setCursorCoords({ lon: e.lngLat.lng, lat: e.lngLat.lat });
        };
        const handleMouseLeave = () => {
            setCursorCoords(null);
        };
        map.on("mousemove", handleMouseMove);
        map.on("mouseout", handleMouseLeave);

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
            const forecastEnvelopeData: FeatureCollection = analysis?.uncertainty_envelope ?? emptyCollection;
            setSource("forecast-centroid", forecastCentroidData);
            setSource("forecast-centroid-label", forecastCentroidLabelData);
            setSource("forecast-envelope", forecastEnvelopeData);
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
            ["forecast-centroid", "forecast-centroid-ring", "forecast-centroid-label", "forecast-envelope-fill", "forecast-envelope-outline"].forEach((layerId) => {
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

            {/* Top-Left: Tactical Sector & Live Coordinate telemetry */}
            <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2.5 rounded border border-[#1b344b] bg-[#030d17]/90 px-3 py-1.5 shadow-md backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] animate-pulse" />
                <span className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-[#7ab8d0]">
                    {region?.name ?? "Arabian Sea"} Sector
                </span>
                <span className="text-[#334e68]">|</span>
                <span className="font-mono text-[9.5px] font-medium text-[#a8d4f0]">
                    {cursorCoords ? (
                        <>
                            <span>{cursorCoords.lat.toFixed(3)}°N</span>
                            <span className="mx-1.5 text-[#334e68]">·</span>
                            <span>{cursorCoords.lon.toFixed(3)}°E</span>
                        </>
                    ) : analysis ? (
                        <>
                            <span>{analysis.detection.centroid_latlon.lat.toFixed(2)}°N</span>
                            <span className="mx-1.5 text-[#334e68]">·</span>
                            <span>{analysis.detection.centroid_latlon.lon.toFixed(2)}°E</span>
                        </>
                    ) : (
                        <span>75.77°E · 9.50°N</span>
                    )}
                </span>
            </div>

            {/* Bottom-Left: Tactical Map Legend */}
            <div className="pointer-events-none absolute bottom-3 left-3 z-10 hidden rounded border border-[#1b344b] bg-[#030d17]/92 p-3 shadow-lg backdrop-blur-sm sm:block">
                <div className="mb-2 flex items-center justify-between gap-4 border-b border-[#1b344b]/80 pb-1.5">
                    <p className="text-[8.5px] font-bold uppercase tracking-[.18em] text-[#5a7d96]">
                        Tactical Hierarchy
                    </p>
                    <span className="font-mono text-[8px] text-[#00d4ff]">LIVE GIS</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[9px]">
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 rounded-sm bg-[#ef4444] border border-[#fca5a5]" />
                        <span className="font-semibold text-[#f8fafc]">Spill Detection</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 rounded-full bg-[#0284c7] border border-[#7dd3fc]" />
                        <span className="text-[#cbd5e1]">Hindcast Origin</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 rounded-sm border border-dashed border-[#06b6d4] bg-[#06b6d4]/20" />
                        <span className="text-[#cbd5e1]">Forecast Envelope</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 rounded-full bg-[#22d4ee]" />
                        <span className="text-[#cbd5e1]">Forecast Centroid</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block h-0.5 w-3 bg-[#f59e0b]" />
                        <span className="font-semibold text-[#f59e0b]">Winner Path</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block h-0.5 w-3 bg-[#475569]" />
                        <span className="text-[#64748b]">AIS Vessel Track</span>
                    </span>
                </div>
                {/* Scale reference bar */}
                <div className="mt-2.5 flex items-center justify-between border-t border-[#1b344b]/60 pt-1.5 font-mono text-[8px] text-[#5a7d96]">
                    <span>0</span>
                    <div className="mx-2 h-1 flex-1 border-b border-l border-r border-[#334e68]" />
                    <span>40 km</span>
                </div>
            </div>

            {/* Bottom-Right: Tactical Map Controls */}
            <div className="absolute bottom-3 right-3 z-20 flex flex-col gap-1.5">
                {/* Compass / Reset North */}
                <button
                    type="button"
                    onClick={() => mapRef.current?.resetNorthPitch({ duration: 400 })}
                    className="flex h-8 w-8 items-center justify-center rounded border border-[#1b344b] bg-[#030d17]/90 text-[#7ab8d0] shadow-md backdrop-blur-sm transition hover:border-[#00d4ff]/50 hover:bg-[#0c2438] hover:text-[#00d4ff]"
                    title="Reset North & Pitch"
                >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                        <polygon points="12 2 18 21 12 17 6 21 12 2" fill="#ef4444" />
                        <polygon points="12 17 18 21 12 2" fill="#64748b" />
                    </svg>
                </button>

                {/* Recenter on Spill Centroid */}
                <button
                    type="button"
                    onClick={() => {
                        if (analysis && mapRef.current) {
                            mapRef.current.flyTo({
                                center: [analysis.detection.centroid_latlon.lon, analysis.detection.centroid_latlon.lat],
                                zoom: 8.5,
                                duration: 600,
                            });
                        }
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded border border-[#1b344b] bg-[#030d17]/90 text-[#7ab8d0] shadow-md backdrop-blur-sm transition hover:border-[#00d4ff]/50 hover:bg-[#0c2438] hover:text-[#00d4ff]"
                    title="Recenter on Spill Incident"
                >
                    <span className="text-sm leading-none">⌖</span>
                </button>

                {/* Zoom In */}
                <button
                    type="button"
                    onClick={() => mapRef.current?.zoomIn({ duration: 250 })}
                    className="flex h-8 w-8 items-center justify-center rounded border border-[#1b344b] bg-[#030d17]/90 text-[#7ab8d0] shadow-md backdrop-blur-sm transition hover:border-[#00d4ff]/50 hover:bg-[#0c2438] hover:text-[#00d4ff]"
                    title="Zoom In"
                >
                    <span className="text-base font-bold leading-none">+</span>
                </button>

                {/* Zoom Out */}
                <button
                    type="button"
                    onClick={() => mapRef.current?.zoomOut({ duration: 250 })}
                    className="flex h-8 w-8 items-center justify-center rounded border border-[#1b344b] bg-[#030d17]/90 text-[#7ab8d0] shadow-md backdrop-blur-sm transition hover:border-[#00d4ff]/50 hover:bg-[#0c2438] hover:text-[#00d4ff]"
                    title="Zoom Out"
                >
                    <span className="text-base font-bold leading-none">−</span>
                </button>
            </div>

            {/* Error banner */}
            {loadError && (
                <div className="pointer-events-none absolute bottom-3 right-14 z-10 rounded border border-[#ef4444]/40 bg-[#030d17]/95 px-3 py-1.5 text-[10px] text-[#ef4444]">
                    API data unavailable · basemap active
                </div>
            )}
        </div>
    );
}
