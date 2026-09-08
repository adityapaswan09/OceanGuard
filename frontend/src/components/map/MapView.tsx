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

export function MapView({ activeLayer = "Satellite", investigationTab = "Overview", aisTracks = [], highlightedVesselId = null, analysis = null }: MapViewProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    const [region, setRegion] = useState<RegionRecord | null>(null);
    const [spillId, setSpillId] = useState<number | null>(null);
    const [loadError, setLoadError] = useState(false);

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
                features: aisTracks.filter((track) => track.points.length > 0).map((track) => {
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
            // Particle cloud and uncertainty envelope (forecast)
            const particleCloudData: FeatureCollection = analysis?.forward_particle_cloud ? (analysis.forward_particle_cloud as FeatureCollection) : emptyCollection;
            const envelopeData: FeatureCollection = analysis?.uncertainty_envelope ? (analysis.uncertainty_envelope as FeatureCollection) : emptyCollection;
            setSource("forward-particle-cloud", particleCloudData);
            setSource("forecast-centroid", forecastCentroidData);
            setSource("forecast-centroid-label", forecastCentroidLabelData);
            setSource("ais-vessel-tracks", aisTrackData);
            setSource("ais-vessel-markers", aisMarkerData);
            setSource("uncertainty-envelope", envelopeData);

            // Add layers for particle cloud and envelope if not already added
            if (!map.getLayer("particle-points")) {
                map.addLayer({
                    id: "particle-points",
                    type: "circle",
                    source: "forward-particle-cloud",
                    paint: {
                        "circle-color": "#ff7f0e",
                        "circle-radius": 4,
                        "circle-stroke-color": "#ffffff",
                        "circle-stroke-width": 1,
                    },
                });
                map.addLayer({
                    id: "uncertainty-envelope",
                    type: "fill",
                    source: "uncertainty-envelope",
                    paint: {
                        "fill-color": "#ff7f0e",
                        "fill-opacity": 0.2,
                    },
                });
                map.addLayer({
                    id: "uncertainty-envelope-line",
                    type: "line",
                    source: "uncertainty-envelope",
                    paint: {
                        "line-color": "#ff7f0e",
                        "line-width": 2,
                    },
                });
            }

            // Visibility handling for forecast related layers (including new ones)
            ["forecast-centroid", "forecast-centroid-label", "particle-points", "uncertainty-envelope", "uncertainty-envelope-line"].forEach((layerId) => {
                if (map.getLayer(layerId)) {
                    const shouldShow = investigationTab === "Forecast" && analysis?.forward_particle_cloud;
                    map.setLayoutProperty(layerId, "visibility", shouldShow ? "visible" : "none");
                }
            });

                map.addLayer({ id: "region-fill", type: "fill", source: "region", paint: { "fill-color": "#087ea4", "fill-opacity": 0.13 } });
                map.addLayer({ id: "region-line", type: "line", source: "region", paint: { "line-color": "#087ea4", "line-width": 2 } });
                map.addLayer({ id: "spill-glow", type: "line", source: "spill-polygon", paint: { "line-color": "#f28a3d", "line-width": 10, "line-opacity": 0.16, "line-blur": 4 } });
                map.addLayer({ id: "spill-fill", type: "fill", source: "spill-polygon", paint: { "fill-color": "#8f3d2e", "fill-opacity": 0.42 } });
                map.addLayer({ id: "spill-outline", type: "line", source: "spill-polygon", paint: { "line-color": "#f0643d", "line-width": 3, "line-opacity": 0.95 } });
                map.addLayer({ id: "spill-centroid", type: "circle", source: "spill-centroid", paint: { "circle-color": "#f0643d", "circle-radius": 7, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
                map.addLayer({ id: "spill-label", type: "symbol", source: "spill-label", layout: { "text-field": ["get", "label"], "text-size": 11, "text-anchor": "left", "text-offset": [1.2, 0], "text-allow-overlap": true }, paint: { "text-color": "#8f3d2e", "text-halo-color": "#ffffff", "text-halo-width": 2 } });
                map.addLayer({ id: "hindcast-origin-marker", type: "circle", source: "hindcast-origin-marker", paint: { "circle-color": "#f28a3d", "circle-radius": 8, "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
                map.addLayer({ id: "hindcast-origin-label", type: "symbol", source: "hindcast-origin-label", layout: { "text-field": ["get", "label"], "text-size": 10, "text-anchor": "left", "text-offset": [1.2, 0], "text-allow-overlap": true }, paint: { "text-color": "#164f9c", "text-halo-color": "#ffffff", "text-halo-width": 2 } });
                map.addLayer({ id: "hindcast-reference-line", type: "line", source: "hindcast-origin-reference", paint: { "line-color": "#164f9c", "line-width": 1.5, "line-opacity": 0.85, "line-dasharray": [4, 3] } });
                map.addLayer({ id: "hindcast-reference-label", type: "symbol", source: "hindcast-origin-reference", layout: { "text-field": ["get", "label"], "text-size": 9, "symbol-placement": "line", "text-letter-spacing": 0.05, "text-allow-overlap": true }, paint: { "text-color": "#164f9c", "text-halo-color": "#ffffff", "text-halo-width": 2 } });
                map.addLayer({ id: "forecast-centroid", type: "circle", source: "forecast-centroid", paint: { "circle-color": "#087ea4", "circle-radius": 8, "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
                map.addLayer({ id: "forecast-centroid-label", type: "symbol", source: "forecast-centroid-label", layout: { "text-field": ["get", "label"], "text-size": 10, "text-anchor": "left", "text-offset": [1.2, 0], "text-allow-overlap": true }, paint: { "text-color": "#087ea4", "text-halo-color": "#ffffff", "text-halo-width": 2 } });
                map.addLayer({ id: "ais-vessel-tracks", type: "line", source: "ais-vessel-tracks", paint: { "line-color": "#7b4bb7", "line-width": 2.5, "line-opacity": 0.82 } });
                map.addLayer({ id: "ais-vessel-markers", type: "circle", source: "ais-vessel-markers", paint: { "circle-color": "#7b4bb7", "circle-radius": 5, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
                map.on("click", "ais-vessel-markers", (event) => {
                    const feature = event.features?.[0];
                    if (!feature?.geometry || feature.geometry.type !== "Point") return;
                    const properties = feature.properties ?? {};
                    const content = document.createElement("div");
                    content.className = "text-xs leading-5 text-[#173247]";
                    content.innerHTML = `<strong>${String(properties.vesselName ?? "Vessel")}</strong><br />${String(properties.vesselType ?? "Unknown")} · ${String(properties.flag ?? "Unknown")}<br /><span>Track: ${new Date(String(properties.timestamp)).toLocaleString()}</span><br /><span>Speed: ${String(properties.speedKnots)} kn · Course: ${String(properties.courseDegrees)}°</span>`;
                    new maplibregl.Popup({ closeButton: true, offset: 10 }).setLngLat(feature.geometry.coordinates as [number, number]).setDOMContent(content).addTo(map);
                });
                map.on("mouseenter", "ais-vessel-markers", () => { map.getCanvas().style.cursor = "pointer"; });
                map.on("mouseleave", "ais-vessel-markers", () => { map.getCanvas().style.cursor = ""; });


            ["hindcast-origin-marker", "hindcast-origin-label", "hindcast-reference-line", "hindcast-reference-label"].forEach((layerId) => {
                if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", investigationTab === "Hindcast" ? "visible" : "none");
            });
            ["forecast-centroid", "forecast-centroid-label"].forEach((layerId) => {
                if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", investigationTab === "Forecast" ? "visible" : "none");
            });
            ["ais-vessel-tracks", "ais-vessel-markers"].forEach((layerId) => {
                if (map.getLayer(layerId)) {
                    const shouldShow = investigationTab === "AIS Analysis" || (highlightedVesselId !== null && investigationTab === "Suspects");
                    map.setLayoutProperty(layerId, "visibility", shouldShow ? "visible" : "none");
                }
            });
            if (map.getLayer("ais-vessel-tracks")) {
                map.setPaintProperty("ais-vessel-tracks", "line-color", ["case", ["==", ["get", "vesselId"], highlightedVesselId ?? -1], "#d96d4c", "#7b4bb7"]);
                map.setPaintProperty("ais-vessel-tracks", "line-width", ["case", ["==", ["get", "vesselId"], highlightedVesselId ?? -1], 4, 2.5]);
            }

            const center = regionCenter(region.geometry);
            map.flyTo({ center, zoom: 4.5, duration: 800 });
        };

        if (map.isStyleLoaded()) drawData();
        else map.once("load", drawData);
    }, [region, spillId, analysis, investigationTab, aisTracks, highlightedVesselId]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !map.isStyleLoaded()) return;
        ["region-fill", "region-line", "spill-glow", "spill-fill", "spill-outline", "spill-centroid", "spill-label"].forEach((layerId) => {
            if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "visible");
        });
    }, [activeLayer]);

    return <div className="absolute inset-0"><div className="absolute inset-0" ref={containerRef} /><div className="pointer-events-none absolute left-4 top-4 rounded-sm border border-white/80 bg-white/90 px-3 py-2 text-[10px] font-semibold uppercase tracking-[.14em] text-[#315a6a]">{region?.name ?? "Arabian Sea"} · live map</div>{loadError && <div className="absolute bottom-4 left-4 rounded-sm border border-[#e7b1a0] bg-white/95 px-3 py-2 text-[10px] text-[#9d4f3c]">API data unavailable · basemap still active</div>}</div>;
}
