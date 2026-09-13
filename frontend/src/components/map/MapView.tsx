import { useEffect, useRef, useState } from "react";
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
}: MapViewProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    const [region, setRegion] = useState<RegionRecord | null>(null);
    const [spillId, setSpillId] = useState<number | null>(null);
    const [loadError, setLoadError] = useState(false);
    const animationStateRef = useRef<{ runId: number | null; frameId: number | null; hasPlayed: boolean }>({ runId: null, frameId: null, hasPlayed: false });
    // Tracks which identifyRun already had its step-A spill-focus camera move, so re-renders
    // between the click and the results arrival do not re-trigger the 700ms focus repeatedly.
    const spillFocusRunRef = useRef(0);

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

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: publicRasterStyle,
            center: [75.77, 9.5],
            zoom: 7.5,
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
        mapRef.current = map;

        return () => {
            map.remove();
            mapRef.current = null;
        };
    }, []);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !region) return;

        const drawData = () => {
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
                label: `SPILL MS-${String(spillId ?? 1).padStart(3, "0")}\nCONFIDENCE ${Math.round((analysis?.detection.confidence ?? 0) * 100)}%`,
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
                ? asFeatureCollection({ type: "Point", coordinates: hindcastOriginLonLat }, { label: "Hypothesized origin", layer: "hindcast-origin-label" })
                : emptyCollection;
            const spillCentroidLonLat: [number, number] | null = spillCentroid?.type === "Point" ? (spillCentroid.coordinates as [number, number]) : null;
            const hindcastReferenceData = hindcastOriginLonLat && spillCentroidLonLat
                ? asFeatureCollection({ type: "LineString", coordinates: [hindcastOriginLonLat, spillCentroidLonLat] }, { label: "origin-to-detection reference", layer: "hindcast-origin-reference" })
                : emptyCollection;
            const forecastCentroidLonLat: [number, number] | null = analysis
                ? [analysis.forward_forecast_centroid_lonlat.lon, analysis.forward_forecast_centroid_lonlat.lat]
                : null;
            const forecastCentroidData = forecastCentroidLonLat
                ? asFeatureCollection({ type: "Point", coordinates: forecastCentroidLonLat }, { layer: "forecast-centroid" })
                : emptyCollection;
            const forecastCentroidLabelData = forecastCentroidLonLat
                ? asFeatureCollection({ type: "Point", coordinates: forecastCentroidLonLat }, { label: "24h forecast centroid", layer: "forecast-centroid-label" })
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
                    // While CAW identification is active and a successful identification has not
                    // yet been recorded, suppress the winner's real-time marker: the animated gold
                    // marker (aimed at the hindcast origin) takes its place. Once a successful
                    // identification has been recorded (or on re-runs), the winner's AIS endpoint
                    // stays visible.
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

            // IDENTIFY SUSPECTS, step A: on the first successful identification, focus the camera on the
            // server-provided spill detection area (centroid + polygon, ~700ms). This takes
            // priority over the region-level flyTo and over the winner animation below.
            // On re-runs the camera is left where the user placed it; only CAW/Custodes data,
            // winner styling, and alpha/heatmap state update.
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

            // Forecast centroid markers remain available for reference without rendering the
            // forecast particle cloud or uncertainty envelope over the map.
            ["forecast-centroid", "forecast-centroid-label", "forecast-centroid-ring"].forEach((layerId) => {
                if (map.getLayer(layerId)) {
                    const shouldShow = investigationTab === "Forecast" && analysis?.forward_particle_cloud;
                    map.setLayoutProperty(layerId, "visibility", shouldShow ? "visible" : "none");
                }
            });
                map.addLayer({ id: "region-fill", type: "fill", source: "region", paint: { "fill-color": "#087ea4", "fill-opacity": 0.13 } });
                map.addLayer({ id: "region-line", type: "line", source: "region", paint: { "line-color": "#087ea4", "line-width": 2 } });
                map.addLayer({ id: "spill-glow", type: "line", source: "spill-polygon", paint: { "line-color": "#c45a3c", "line-width": 8, "line-opacity": 0.12, "line-blur": 3 } });
                map.addLayer({ id: "spill-fill", type: "fill", source: "spill-polygon", paint: { "fill-color": "#7a3525", "fill-opacity": 0.38 } });
                map.addLayer({ id: "spill-outline", type: "line", source: "spill-polygon", paint: { "line-color": "#c45a3c", "line-width": 2, "line-opacity": 0.9, "line-dasharray": [2, 1] } });
                map.addLayer({ id: "spill-centroid", type: "circle", source: "spill-centroid", paint: { "circle-color": "#c45a3c", "circle-radius": 6, "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5, "circle-opacity": 0.9 } });
                map.addLayer({ id: "spill-centroid-ring", type: "circle", source: "spill-centroid", paint: { "circle-color": "#c45a3c", "circle-radius": 10, "circle-stroke-color": "#c45a3c", "circle-stroke-width": 1, "circle-opacity": 0.25, "circle-blur": 1 } });
                map.addLayer({ id: "spill-label", type: "symbol", source: "spill-label", layout: { "text-field": ["get", "label"], "text-size": 10, "text-anchor": "left", "text-offset": [1.2, 0], "text-allow-overlap": true }, paint: { "text-color": "#7a3525", "text-halo-color": "#ffffff", "text-halo-width": 1.5 } });
                map.addLayer({ id: "hindcast-origin-marker", type: "circle", source: "hindcast-origin-marker", paint: { "circle-color": "#164f9c", "circle-radius": 7, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2, "circle-opacity": 0.95 } });
                map.addLayer({ id: "hindcast-origin-ring", type: "circle", source: "hindcast-origin-marker", paint: { "circle-color": "#164f9c", "circle-radius": 12, "circle-stroke-color": "#164f9c", "circle-stroke-width": 1, "circle-opacity": 0.2, "circle-blur": 1 } });
                map.addLayer({ id: "hindcast-origin-label", type: "symbol", source: "hindcast-origin-label", layout: { "text-field": ["get", "label"], "text-size": 10, "text-anchor": "left", "text-offset": [1.2, 0], "text-allow-overlap": true }, paint: { "text-color": "#164f9c", "text-halo-color": "#ffffff", "text-halo-width": 1.5 } });
                map.addLayer({ id: "hindcast-reference-line", type: "line", source: "hindcast-origin-reference", paint: { "line-color": "#164f9c", "line-width": 1.2, "line-opacity": 0.7, "line-dasharray": [4, 3] } });
                map.addLayer({ id: "hindcast-reference-label", type: "symbol", source: "hindcast-origin-reference", layout: { "text-field": ["get", "label"], "text-size": 9, "symbol-placement": "line", "text-letter-spacing": 0.05, "text-allow-overlap": true }, paint: { "text-color": "#164f9c", "text-halo-color": "#ffffff", "text-halo-width": 2 } });
                map.addLayer({ id: "forecast-centroid", type: "circle", source: "forecast-centroid", paint: { "circle-color": "#087ea4", "circle-radius": 7, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2, "circle-opacity": 0.9 } });
                map.addLayer({ id: "forecast-centroid-ring", type: "circle", source: "forecast-centroid", paint: { "circle-color": "#087ea4", "circle-radius": 12, "circle-stroke-color": "#087ea4", "circle-stroke-width": 1, "circle-opacity": 0.2, "circle-blur": 1 } });
                map.addLayer({ id: "forecast-centroid-label", type: "symbol", source: "forecast-centroid-label", layout: { "text-field": ["get", "label"], "text-size": 10, "text-anchor": "left", "text-offset": [1.2, 0], "text-allow-overlap": true }, paint: { "text-color": "#087ea4", "text-halo-color": "#ffffff", "text-halo-width": 1.5 } });
                map.addLayer({ id: "ais-vessel-tracks", type: "line", source: "ais-vessel-tracks", paint: { "line-color": "#5b7a99", "line-width": 1.4, "line-opacity": 0.75 } });
                map.addLayer({ id: "ais-vessel-markers", type: "circle", source: "ais-vessel-markers", paint: { "circle-color": "#2e4a63", "circle-radius": 4, "circle-stroke-color": "rgba(255,255,255,0.85)", "circle-stroke-width": 1.2, "circle-opacity": 0.9 } });
                map.on("click", "ais-vessel-markers", (event) => {
                    const feature = event.features?.[0];
                    if (!feature?.geometry || feature.geometry.type !== "Point") return;
                    const properties = feature.properties ?? {};
                    const content = document.createElement("div");
                    content.className = "text-xs leading-5 text-ink";
                    content.innerHTML = `<strong>${String(properties.vesselName ?? "Vessel")}</strong><br />${String(properties.vesselType ?? "Unknown")} · ${String(properties.flag ?? "Unknown")}<br /><span>Track: ${new Date(String(properties.timestamp)).toLocaleString()}</span><br /><span>Speed: ${String(properties.speedKnots)} kn · Course: ${String(properties.courseDegrees)}°</span>`;
                    new maplibregl.Popup({ closeButton: true, offset: 10 }).setLngLat(feature.geometry.coordinates as [number, number]).setDOMContent(content).addTo(map);
                });
                map.on("mouseenter", "ais-vessel-markers", () => { map.getCanvas().style.cursor = "pointer"; });
                map.on("mouseleave", "ais-vessel-markers", () => { map.getCanvas().style.cursor = ""; });


            ["hindcast-origin-marker", "hindcast-origin-ring", "hindcast-origin-label", "hindcast-reference-line", "hindcast-reference-label"].forEach((layerId) => {
                if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", investigationTab === "Hindcast" ? "visible" : "none");
            });
            ["forecast-centroid", "forecast-centroid-ring", "forecast-centroid-label"].forEach((layerId) => {
                if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", investigationTab === "Forecast" ? "visible" : "none");
            });
            ["ais-vessel-tracks", "ais-vessel-markers", "ais-vessel-tracks-glow"].forEach((layerId) => {
                if (map.getLayer(layerId)) {
                    const shouldShow = investigationTab === "AIS Analysis" || (highlightedVesselId !== null && investigationTab === "Suspects");
                    map.setLayoutProperty(layerId, "visibility", shouldShow ? "visible" : "none");
                }
            });
            if (map.getLayer("ais-vessel-tracks")) {
                const isWinnerExpr = ["==", ["get", "vesselId"], cawActive && winningVesselId !== null ? winningVesselId : -1] as any;
                const isHighlightedExpr = ["==", ["get", "vesselId"], highlightedVesselId ?? -1] as any;
                // Muted blue-gray for non-winning tracks; thin and subtle while CAW is active;
                // the winner stays strongly highlighted in gold.
                map.setPaintProperty("ais-vessel-tracks", "line-color", ["case", isWinnerExpr, "#F59E0B", isHighlightedExpr, "#d96d4c", "#5b7a99"] as any);
                map.setPaintProperty("ais-vessel-tracks", "line-width", ["case", isWinnerExpr, 4.5, isHighlightedExpr, 3.5, cawActive ? 1.2 : 1.6] as any);
                map.setPaintProperty("ais-vessel-tracks", "line-opacity", ["case", isWinnerExpr, 1, cawActive ? 0.3 : 0.8] as any);
            }
            if (map.getLayer("ais-vessel-markers")) {
                const isWinnerExpr = ["==", ["get", "vesselId"], cawActive && winningVesselId !== null ? winningVesselId : -1] as any;
                // Professional maritime-style markers: dark blue center + subtle light stroke so
                // they stay clearly visible over satellite imagery. While CAW is active the
                // non-winning candidates are de-emphasized but still visible.
                map.setPaintProperty("ais-vessel-markers", "circle-color", ["case", isWinnerExpr, "#F59E0B", cawActive ? "rgba(46, 74, 99, 0.35)" : "#2e4a63"] as any);
                map.setPaintProperty("ais-vessel-markers", "circle-radius", ["case", isWinnerExpr, 8, cawActive ? 3.5 : 4] as any);
                map.setPaintProperty("ais-vessel-markers", "circle-opacity", ["case", isWinnerExpr, 1, cawActive ? 0.55 : 0.9] as any);
                map.setPaintProperty("ais-vessel-markers", "circle-stroke-color", ["case", isWinnerExpr, "#F59E0B", "rgba(255, 255, 255, 0.85)"] as any);
                map.setPaintProperty("ais-vessel-markers", "circle-stroke-width", ["case", isWinnerExpr, 2.5, cawActive ? 1 : 1.2] as any);
            }

            // CAW identification: animate the winning vessel from its last AIS fix toward the
            // server-provided BACKWARD-HINDCAST MAP ORIGIN hypothesis (never the detection point).
            if (cawActive && winningVesselId !== null) {
                if (!map.getSource("caw-winner-marker")) {
                    map.addSource("caw-winner-marker", { type: "geojson", data: emptyCollection });
                }
                if (!map.getSource("caw-approach-line")) {
                    map.addSource("caw-approach-line", { type: "geojson", data: emptyCollection });
                }
                if (!map.getLayer("caw-winner-marker")) {
                    map.addLayer({ id: "caw-winner-marker", type: "circle", source: "caw-winner-marker", paint: { "circle-color": "#F59E0B", "circle-radius": 9, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5, "circle-opacity": 0.95 } });
                }
                if (!map.getLayer("caw-winner-ring")) {
                    map.addLayer({ id: "caw-winner-ring", type: "circle", source: "caw-winner-marker", paint: { "circle-color": "#F59E0B", "circle-radius": 14, "circle-stroke-color": "#F59E0B", "circle-stroke-width": 1, "circle-opacity": 0.2, "circle-blur": 1 } });
                }
                if (!map.getLayer("caw-approach-line")) {
                    map.addLayer({ id: "caw-approach-line", type: "line", source: "caw-approach-line", paint: { "line-color": "#F59E0B", "line-width": 1.3, "line-opacity": 0.65, "line-dasharray": [3, 3] } });
                }
            }
            ["caw-winner-marker", "caw-winner-ring", "caw-approach-line"].forEach((layerId) => {
                if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", cawActive && winningVesselId !== null ? "visible" : "none");
            });

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
                        else map.addSource("caw-winner-marker", { type: "geojson", data: markerCollection });
                        const approachSource = map.getSource("caw-approach-line") as maplibregl.GeoJSONSource | undefined;
                        if (approachSource) approachSource.setData(approachCollection);
                        else map.addSource("caw-approach-line", { type: "geojson", data: approachCollection });
                    };
                    // Paint the START position (last AIS fix) synchronously so the marker never
                    // jumps to the final position first: the flight is visibly seen moving toward
                    // the hindcast MAP origin.
                    paintAnimatedWinner(start[0], start[1]);
                    // IDENTIFY SUSPECTS, step B: frame the last AIS fix together with the
                    // hindcast MAP origin BEFORE the animation runs, then step C: animate
                    // last fix -> MAP origin over ~1800ms once the camera framing completes.
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
                                // Finish exactly at the hindcast MAP origin.
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
                    // Safety net in case the camera is already at the target bounds and no
                    // moveend event ever fires.
                    window.setTimeout(kick, 800);
                }
            }
            /*
            // While a CAW identification is active (or running), keep the camera framed on the
            // flight zone / spill area: zooming out to the whole region would make the
            // last-fix -> origin hop invisible and would fight the identification camera moves.
            if (!isIdentifying && !(cawActive && identifyRun > 0)) {
                const center = regionCenter(region.geometry);
                map.flyTo({ center, zoom: 4.5, duration: 800 });
            }
            */
        };

        if (map.isStyleLoaded()) drawData();
        else map.once("load", drawData);
    }, [region, spillId, analysis, investigationTab, aisTracks, highlightedVesselId, cawActive, winningVesselId, isIdentifying, identifyRun]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !map.isStyleLoaded()) return;
        ["region-fill", "region-line", "spill-glow", "spill-fill", "spill-outline", "spill-centroid", "spill-centroid-ring", "spill-label"].forEach((layerId) => {
            if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "visible");
        });
    }, [activeLayer]);

    return <div className="absolute inset-0"><div className="absolute inset-0" ref={containerRef} /><div className="pointer-events-none absolute left-4 top-4 rounded-sm border border-[#31516a] bg-[#061624]/90 px-3 py-2 text-[10px] font-semibold uppercase tracking-[.14em] text-[#9ed7eb]">{region?.name ?? "Arabian Sea"} · live map</div>{loadError && <div className="pointer-events-none absolute bottom-4 left-4 rounded-sm border border-ember/50 bg-[#061624]/95 px-3 py-2 text-[10px] text-[#f0a58e]">API data unavailable · basemap still active</div>}</div>;
}
