import { useEffect, useRef, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Geometry } from "geojson";

import { API_BASE_URL } from "../../services/api";
import type { AisTrack, AlphaSurfaceResponse, CustodesDecision, SpillAnalysis, SuspectCandidate } from "../../types/intelligence";

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
    decision?: CustodesDecision | null;
    isIdentifying?: boolean;
    identifyRun?: number;
    identified?: boolean;
    alphaSurface?: AlphaSurfaceResponse | null;
    suspects?: SuspectCandidate[];
    onVesselSelect?: (vesselId: number) => void;
    onCoordsUpdate?: (coords: { lon: number; lat: number } | null) => void;
    onMapReady?: (map: MapLibreMap) => void;
    layerVisibility?: {
        spill?: boolean;
        attributionAlpha?: boolean;
        hindcast?: boolean;
        forecast?: boolean;
        ais?: boolean;
        graticule?: boolean;
    };
}

const emptyCollection: FeatureCollection = {
    type: "FeatureCollection",
    features: [],
};

// Generate graticule lines for tactical maritime GIS display
function generateGraticule(): FeatureCollection {
    const features: any[] = [];
    // Meridians (Longitude: 72°E to 78°E)
    for (let lon = 72; lon <= 78; lon += 1) {
        features.push({
            type: "Feature",
            geometry: {
                type: "LineString",
                coordinates: [[lon, 7.0], [lon, 13.0]],
            },
            properties: { label: `${lon}°E`, type: "meridian" },
        });
    }
    // Parallels (Latitude: 7°N to 13°N)
    for (let lat = 7; lat <= 13; lat += 1) {
        features.push({
            type: "Feature",
            geometry: {
                type: "LineString",
                coordinates: [[72.0, lat], [78.0, lat]],
            },
            properties: { label: `${lat}°N`, type: "parallel" },
        });
    }
    return { type: "FeatureCollection", features };
}

const graticuleData = generateGraticule();

// Professional Maritime Dual Basemap:
// - esriDarkGray for high-contrast nautical "Map" view (no API key required)
// - esriSatellite for high-res orbital "Satellite" view (no API key required)
const maritimeMapStyle = {
    version: 8 as const,
    sources: {
        esriDarkGray: {
            type: "raster" as const,
            tiles: [
                "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            attribution: "Tiles © Esri",
        },
        esriSatellite: {
            type: "raster" as const,
            tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
            tileSize: 256,
            attribution: "Tiles © Esri",
        },
    },
    layers: [
        {
            id: "esri-dark-gray",
            type: "raster" as const,
            source: "esriDarkGray",
            paint: { "raster-opacity": 0.95 },
        },
        {
            id: "esri-satellite",
            type: "raster" as const,
            source: "esriSatellite",
            paint: { "raster-opacity": 0.95 },
            layout: { visibility: "none" as const },
        },
    ],
};

function asFeatureCollection(geometry: Geometry | undefined, properties: Record<string, unknown>): FeatureCollection {
    return geometry
        ? { type: "FeatureCollection", features: [{ type: "Feature", geometry, properties }] }
        : emptyCollection;
}

// Generate concentric contour diffusion rings for realistic multi-band oil spill representation
function generateSpillContours(
    polygonCoords: [number, number][],
    centroid: [number, number]
): FeatureCollection {
    if (!polygonCoords || polygonCoords.length < 3) return emptyCollection;

    const [cLon, cLat] = centroid;
    // Restrained, crisp spill boundary and dense core underneath other layers
    const contourLevels = [
        { level: 2, scale: 1.0, color: "#ef4444", stroke: "#f87171", opacity: 0.35, strokeOpacity: 0.85 },
        { level: 1, scale: 0.75, color: "#dc2626", stroke: "#ef4444", opacity: 0.55, strokeOpacity: 0.9 },
    ];

    const features: any[] = [];
    for (const conf of contourLevels) {
        const scaledRing = polygonCoords.map(([lon, lat]) => [
            cLon + (lon - cLon) * conf.scale,
            cLat + (lat - cLat) * conf.scale,
        ]);
        if (
            scaledRing.length > 0 &&
            (scaledRing[0][0] !== scaledRing[scaledRing.length - 1][0] ||
                scaledRing[0][1] !== scaledRing[scaledRing.length - 1][1])
        ) {
            scaledRing.push([...scaledRing[0]]);
        }
        features.push({
            type: "Feature",
            geometry: {
                type: "Polygon",
                coordinates: [scaledRing],
            },
            properties: {
                level: conf.level,
                fillColor: conf.color,
                strokeColor: conf.stroke,
                fillOpacity: conf.opacity,
                strokeOpacity: conf.strokeOpacity,
            },
        });
    }

    return { type: "FeatureCollection", features };
}

// Tactical layer specifications organized by visual hierarchy:
// 1. Basemap (ESRI dark-gray / satellite canvas)
// 2. Graticule coordinate lines
// 3. CAW Attribution Alpha Heatmap (smooth GPU intensity field)
// 4. Spill detection footprint (restrained fill & subtle outline - underneath trajectories/tracks)
// 5. Forecast 24h dispersion trajectory & uncertainty envelope
// 6. AIS fleet tracks (tactical thin dashed blue #3b82f6)
// 7. Hindcast origin-to-spill trajectory (dashed #0284c7)
// 8. CAW Winner golden approach path & amber accent
// 9. Spill centroid tactical core dot
// 10. AIS directional vessel markers
const STATIC_LAYERS: Array<{ id: string; spec: maplibregl.LayerSpecification }> = [
    // Graticule Grid
    {
        id: "graticule-lines",
        spec: {
            id: "graticule-lines",
            type: "line",
            source: "graticule",
            paint: {
                "line-color": "#0c2c47",
                "line-width": 0.8,
                "line-dasharray": [2, 4],
                "line-opacity": 0.65,
            },
        },
    },
    // Region boundaries
    { id: "region-fill", spec: { id: "region-fill", type: "fill", source: "region", paint: { "fill-color": "#041424", "fill-opacity": 0.05 } } },
    { id: "region-line", spec: { id: "region-line", type: "line", source: "region", paint: { "line-color": "#15334d", "line-width": 1, "line-opacity": 0.4 } } },

    // CAW ATTRIBUTION ALPHA HEATMAP (Layer Order #3)
    {
        id: "attribution-alpha-heatmap",
        spec: {
            id: "attribution-alpha-heatmap",
            type: "heatmap",
            source: "attribution-alpha",
            paint: {
                "heatmap-weight": [
                    "interpolate",
                    ["linear"],
                    ["get", "alpha"],
                    0, 0,
                    0.2, 0.25,
                    0.5, 0.6,
                    1, 1,
                ],
                "heatmap-intensity": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    0, 1,
                    8, 2.2,
                    12, 3.5,
                ],
                "heatmap-color": [
                    "interpolate",
                    ["linear"],
                    ["heatmap-density"],
                    0, "rgba(0, 0, 0, 0)",
                    0.15, "rgba(2, 44, 75, 0.4)",
                    0.3, "rgba(2, 132, 199, 0.65)",
                    0.5, "rgba(6, 182, 212, 0.8)",
                    0.7, "rgba(234, 179, 8, 0.88)",
                    0.85, "rgba(249, 115, 22, 0.94)",
                    1.0, "rgba(239, 68, 68, 0.98)",
                ],
                "heatmap-radius": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    4, 20,
                    8, 42,
                    11, 75,
                    14, 120,
                ],
                "heatmap-opacity": 0.82,
            },
        },
    },

    // SPILL DETECTION FOOTPRINT (Layer Order #4: visible underneath tracks & trajectories)
    {
        id: "spill-contours-fill",
        spec: {
            id: "spill-contours-fill",
            type: "fill",
            source: "spill-contours",
            paint: {
                "fill-color": ["get", "fillColor"],
                "fill-opacity": ["get", "fillOpacity"],
            },
        },
    },
    {
        id: "spill-contours-line",
        spec: {
            id: "spill-contours-line",
            type: "line",
            source: "spill-contours",
            paint: {
                "line-color": ["get", "strokeColor"],
                "line-width": ["case", ["==", ["get", "level"], 2], 1.8, 1.2],
                "line-opacity": ["get", "strokeOpacity"],
            },
        },
    },

    // FORECAST 24H DISPERSION & UNCERTAINTY ENVELOPE (Layer Order #5)
    {
        id: "forecast-envelope-fill",
        spec: {
            id: "forecast-envelope-fill",
            type: "fill",
            source: "forecast-envelope",
            paint: { "fill-color": "#06b6d4", "fill-opacity": 0.12 },
        },
    },
    {
        id: "forecast-envelope-outline",
        spec: {
            id: "forecast-envelope-outline",
            type: "line",
            source: "forecast-envelope",
            paint: {
                "line-color": "#06b6d4",
                "line-width": 1.5,
                "line-opacity": 0.8,
                "line-dasharray": [3, 2],
            },
        },
    },
    {
        id: "forecast-trajectory-line",
        spec: {
            id: "forecast-trajectory-line",
            type: "line",
            source: "forecast-trajectory",
            paint: {
                "line-color": "#22d4ee",
                "line-width": 1.6,
                "line-opacity": 0.75,
                "line-dasharray": [4, 3],
            },
        },
    },

    // AIS CANDIDATE FLEET TRACKS (Layer Order #6)
    {
        id: "ais-vessel-tracks",
        spec: {
            id: "ais-vessel-tracks",
            type: "line",
            source: "ais-vessel-tracks",
            paint: {
                "line-color": "#3b82f6",
                "line-width": 1.2,
                "line-opacity": 1.0,
                "line-dasharray": [3, 3],
            },
            layout: {
                "line-join": "round",
                "line-cap": "round",
            },
        },
    },
    {
        id: "ais-vessel-tracks-winner",
        spec: {
            id: "ais-vessel-tracks-winner",
            type: "line",
            source: "ais-vessel-tracks",
            paint: {
                "line-color": "#3b82f6",
                "line-width": 1.4,
                "line-opacity": 1.0,
                "line-dasharray": [3, 3],
            },
            layout: {
                "line-join": "round",
                "line-cap": "round",
            },
            filter: ["==", ["get", "vesselId"], -1],
        },
    },

    // HINDCAST ORIGIN TO SPILL CENTROID TRAJECTORY (Layer Order #7)
    {
        id: "hindcast-trajectory-line",
        spec: {
            id: "hindcast-trajectory-line",
            type: "line",
            source: "hindcast-trajectory",
            paint: {
                "line-color": "#0284c7",
                "line-width": 1.6,
                "line-opacity": 0.85,
                "line-dasharray": [4, 3],
            },
        },
    },

    // CAW WINNER GOLDEN AIS TRACE (Layer Order #8)
    {
        id: "caw-winner-glow",
        spec: {
            id: "caw-winner-glow",
            type: "line",
            source: "caw-approach-line",
            paint: {
                "line-color": "#F59E0B",
                "line-width": 6,
                "line-opacity": 0.25,
                "line-blur": 2,
            },
            layout: {
                "line-join": "round",
                "line-cap": "round",
            },
        },
    },
    {
        id: "caw-winner-path",
        spec: {
            id: "caw-winner-path",
            type: "line",
            source: "caw-approach-line",
            paint: {
                "line-color": "#F59E0B",
                "line-width": 2.8,
                "line-opacity": 1.0,
            },
            layout: {
                "line-join": "round",
                "line-cap": "round",
            },
        },
    },
    // CAW WINNER WAYPOINT DOTS (Layer Order #8)
    {
        id: "caw-winner-waypoints",
        spec: {
            id: "caw-winner-waypoints",
            type: "circle",
            source: "caw-winner-marker",
            paint: {
                "circle-color": "#F59E0B",
                "circle-radius": 3.5,
                "circle-opacity": 1.0,
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 1,
            },
        },
    },

    // SPILL CENTROID CORE DOT (Layer Order #9)
    {
        id: "spill-centroid-glow",
        spec: {
            id: "spill-centroid-glow",
            type: "circle",
            source: "spill-centroid",
            paint: {
                "circle-color": "#ef4444",
                "circle-radius": 4.5,
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 1.5,
                "circle-opacity": 1.0,
            },
        },
    },

    // AIS VESSEL DIRECTIONAL MARKERS (Layer Order #10)
    {
        id: "ais-vessel-markers",
        spec: {
            id: "ais-vessel-markers",
            type: "circle",
            source: "ais-vessel-markers",
            paint: {
                "circle-color": "#f97316",
                "circle-radius": 3.5,
                "circle-stroke-color": "rgba(255, 255, 255, 0.85)",
                "circle-stroke-width": 1.2,
                "circle-opacity": 0.9,
            },
        },
    },
];

const ALL_SOURCE_IDS = [
    "graticule",
    "region",
    "attribution-alpha",
    "spill-contours",
    "spill-centroid",
    "hindcast-trajectory",
    "forecast-trajectory",
    "forecast-envelope",
    "ais-vessel-tracks",
    "ais-vessel-markers",
    "caw-approach-line",
    "caw-winner-marker",
];

export function MapView({
    activeLayer = "Map",
    investigationTab = "Overview",
    aisTracks = [],
    highlightedVesselId = null,
    analysis = null,
    cawActive = false,
    winningVesselId = null,
    decision = null,
    isIdentifying = false,
    identifyRun = 0,
    identified = false,
    alphaSurface = null,
    suspects = [],
    onVesselSelect,
    onCoordsUpdate,
    onMapReady,
    layerVisibility,
}: MapViewProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    const layersInitializedRef = useRef(false);
    const clickHandlerRef = useRef<((e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => void) | null>(null);

    // Callout HTML marker references
    const originMarkerRef = useRef<maplibregl.Marker | null>(null);
    const winnerMarkerRef = useRef<maplibregl.Marker | null>(null);
    const abstainMarkerRef = useRef<maplibregl.Marker | null>(null);
    const forecastMarkerRef = useRef<maplibregl.Marker | null>(null);

    const [region, setRegion] = useState<RegionRecord | null>(null);
    const [spillId, setSpillId] = useState<number | null>(null);
    const [loadError, setLoadError] = useState(false);
    const aisAnimationRef = useRef<{
        animatedRunId: number | null;
        timerId: number | null;
        frameId: number | null;
    }>({ animatedRunId: null, timerId: null, frameId: null });
    const hasFlownRef = useRef(false);

    // Fetch region + spill metadata
    useEffect(() => {
        let cancelled = false;
        Promise.all([
            fetch(`${API_BASE_URL}/regions/`).then((response) => response.json() as Promise<RegionRecord[]>),
            fetch(`${API_BASE_URL}/spills/`).then((response) => response.json() as Promise<{ items: SpillRecord[] }>),
        ])
            .then(([regions, spills]) => {
                if (cancelled) return;
                setRegion(regions[0] ?? null);
                setSpillId(spills.items[0]?.id ?? 1);
            })
            .catch(() => {
                if (!cancelled) setLoadError(true);
            });
        return () => { cancelled = true; };
    }, []);

    // Initialize map once
    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: maritimeMapStyle,
            center: [75.35, 9.25],
            zoom: 7.6,
            attributionControl: { compact: true },
        });
        mapRef.current = map;
        onMapReady?.(map);

        // Mouse hover telemetry
        const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
            onCoordsUpdate?.({ lon: e.lngLat.lng, lat: e.lngLat.lat });
        };
        const handleMouseLeave = () => {
            onCoordsUpdate?.(null);
        };
        map.on("mousemove", handleMouseMove);
        map.on("mouseout", handleMouseLeave);

        // Container and window resize handling
        const resizeMap = () => map.resize();
        const ro = new ResizeObserver(resizeMap);
        if (containerRef.current) ro.observe(containerRef.current);
        window.addEventListener("resize", resizeMap);

        return () => {
            ro.disconnect();
            window.removeEventListener("resize", resizeMap);
            if (aisAnimationRef.current.timerId !== null) {
                window.clearTimeout(aisAnimationRef.current.timerId);
                aisAnimationRef.current.timerId = null;
            }
            if (aisAnimationRef.current.frameId !== null) {
                cancelAnimationFrame(aisAnimationRef.current.frameId);
                aisAnimationRef.current.frameId = null;
            }
            originMarkerRef.current?.remove();
            winnerMarkerRef.current?.remove();
            abstainMarkerRef.current?.remove();
            forecastMarkerRef.current?.remove();
            map.remove();
            mapRef.current = null;
            layersInitializedRef.current = false;
        };
    }, [onCoordsUpdate]);

    // Create all sources + layers exactly once after style loads
    const ensureLayers = useCallback(() => {
        const map = mapRef.current;
        if (!map || layersInitializedRef.current) return;

        // Add GeoJSON sources
        for (const id of ALL_SOURCE_IDS) {
            if (!map.getSource(id)) {
                map.addSource(id, {
                    type: "geojson",
                    data: id === "graticule" ? graticuleData : emptyCollection,
                });
            }
        }

        // Add static layers
        for (const { id, spec } of STATIC_LAYERS) {
            if (!map.getLayer(id)) {
                map.addLayer(spec);
            }
        }

        layersInitializedRef.current = true;
    }, []);

    // Switch between Map and Satellite cleanly
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !map.isStyleLoaded()) return;

        const isSat = activeLayer === "Satellite";
        if (map.getLayer("esri-satellite")) {
            map.setLayoutProperty("esri-satellite", "visibility", isSat ? "visible" : "none");
        }
        if (map.getLayer("esri-dark-gray")) {
            map.setLayoutProperty("esri-dark-gray", "visibility", isSat ? "none" : "visible");
        }
    }, [activeLayer]);

    // Update source data & dynamic markers
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !region) return;

        const drawData = () => {
            ensureLayers();

            const regionData = asFeatureCollection(region.geometry, { name: region.name });

            // Coordinates
            const spillCentroidLonLat: [number, number] = analysis
                ? [analysis.detection.centroid_latlon.lon, analysis.detection.centroid_latlon.lat]
                : [75.36, 9.12];

            // Authoritative backward-hindcast estimated origin coordinates:
            // map_hypothesis.origin_lon, map_hypothesis.origin_lat
            const map_hypothesis =
                analysis?.map_hypothesis ??
                (analysis?.backward_hindcast
                    ? {
                          origin_lon:
                              analysis.backward_hindcast.hypothesized_origin_lonlat?.lon ??
                              (Array.isArray((analysis.backward_hindcast as any).hypothesized_origin_lonlat)
                                  ? (analysis.backward_hindcast as any).hypothesized_origin_lonlat[0]
                                  : undefined) ??
                              (analysis.backward_hindcast as any).origin_lon,
                          origin_lat:
                              analysis.backward_hindcast.hypothesized_origin_lonlat?.lat ??
                              (Array.isArray((analysis.backward_hindcast as any).hypothesized_origin_lonlat)
                                  ? (analysis.backward_hindcast as any).hypothesized_origin_lonlat[1]
                                  : undefined) ??
                              (analysis.backward_hindcast as any).origin_lat,
                      }
                    : undefined);

            const hindcastOriginLonLat: [number, number] =
                map_hypothesis &&
                map_hypothesis.origin_lon !== undefined &&
                map_hypothesis.origin_lat !== undefined
                    ? [map_hypothesis.origin_lon, map_hypothesis.origin_lat]
                    : [76.1160, 9.3069];

            const forecastCentroidLonLat: [number, number] = analysis
                ? [analysis.forward_forecast_centroid_lonlat.lon, analysis.forward_forecast_centroid_lonlat.lat]
                : [75.85, 8.45];

            // 1. Spill Multi-contour data
            const polygonCoords = analysis?.detection.polygon_latlon?.length
                ? analysis.detection.polygon_latlon
                : [
                      [75.25, 9.05],
                      [75.45, 9.08],
                      [75.5, 9.22],
                      [75.35, 9.26],
                      [75.22, 9.15],
                  ] as [number, number][];

            const contourData = generateSpillContours(polygonCoords, spillCentroidLonLat);
            const centroidData = asFeatureCollection({ type: "Point", coordinates: spillCentroidLonLat }, {});

            // 2. Hindcast trajectory data (Origin -> Spill centroid)
            const hindcastTrajectoryData: FeatureCollection = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        geometry: {
                            type: "LineString",
                            coordinates: [hindcastOriginLonLat, spillCentroidLonLat],
                        },
                        properties: { name: "Hindcast Origin to Spill Trajectory" },
                    },
                ],
            };

            // 3. Forecast trajectory & envelope
            const forecastTrajectoryData: FeatureCollection = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        geometry: {
                            type: "LineString",
                            coordinates: [spillCentroidLonLat, forecastCentroidLonLat],
                        },
                        properties: {},
                    },
                ],
            };
            const forecastEnvelopeData: FeatureCollection = analysis?.uncertainty_envelope ?? emptyCollection;

            // 4. CAW Attribution Alpha Heatmap dataset
            let alphaPointsFeatures: any[] = [];

            if (identified && alphaSurface && alphaSurface.alpha?.length) {
                // Sourced from existing CAW AlphaSurfaceResponse
                // Mapping candidate vessel x t0 hypotheses to the incident spatial corridor
                const { vessel_ids, t0_hours, alpha } = alphaSurface;

                let maxA = 0;
                for (let r = 0; r < alpha.length; r++) {
                    for (let c = 0; c < alpha[r].length; c++) {
                        if (alpha[r][c] > maxA) maxA = alpha[r][c];
                    }
                }
                if (maxA <= 0) maxA = 1;

                const maxT0 = t0_hours[t0_hours.length - 1] || 96;

                for (let vIdx = 0; vIdx < vessel_ids.length; vIdx++) {
                    const vId = vessel_ids[vIdx];
                    const vTrack = aisTracks.find((t) => t.vesselId === vId);

                    for (let tIdx = 0; tIdx < t0_hours.length; tIdx++) {
                        const t0 = t0_hours[tIdx];
                        const val = alpha[vIdx]?.[tIdx] ?? 0;
                        if (val <= 0.005) continue; // filter negligible probabilities

                        const normWeight = Math.min(1, val / maxA);
                        const driftRatio = Math.min(1, Math.max(0, t0 / maxT0));

                        // Spatial anchor: corridor between spill centroid (t0=0) and hindcast origin (max t0)
                        const corridorLon = spillCentroidLonLat[0] + (hindcastOriginLonLat[0] - spillCentroidLonLat[0]) * driftRatio;
                        const corridorLat = spillCentroidLonLat[1] + (hindcastOriginLonLat[1] - spillCentroidLonLat[1]) * driftRatio;

                        let ptLon = corridorLon;
                        let ptLat = corridorLat;
                        if (vTrack && vTrack.points.length > 0) {
                            const p = vTrack.points[Math.min(vTrack.points.length - 1, Math.floor(driftRatio * vTrack.points.length))];
                            ptLon = corridorLon * 0.75 + p.longitude * 0.25;
                            ptLat = corridorLat * 0.75 + p.latitude * 0.25;
                        }

                        alphaPointsFeatures.push({
                            type: "Feature",
                            geometry: { type: "Point", coordinates: [ptLon, ptLat] },
                            properties: {
                                alpha: normWeight,
                                rawAlpha: val,
                                vesselId: vId,
                                t0: t0,
                            },
                        });
                    }
                }

                // Dense attribution concentration over the physical spill detection footprint
                const topScore = alphaSurface.alpha[0]
                    ? Math.max(...alphaSurface.alpha.map((row) => Math.max(...row)))
                    : 0.908;

                // Centroid anchor point
                alphaPointsFeatures.push({
                    type: "Feature",
                    geometry: { type: "Point", coordinates: [spillCentroidLonLat[0], spillCentroidLonLat[1]] },
                    properties: { alpha: 1.0, rawAlpha: topScore, isCore: true },
                });

                // Polygon perimeter and interior sample points
                polygonCoords.forEach(([lon, lat]) => {
                    alphaPointsFeatures.push({
                        type: "Feature",
                        geometry: { type: "Point", coordinates: [lon, lat] },
                        properties: { alpha: 0.85, rawAlpha: topScore * 0.85 },
                    });
                    alphaPointsFeatures.push({
                        type: "Feature",
                        geometry: {
                            type: "Point",
                            coordinates: [
                                spillCentroidLonLat[0] * 0.45 + lon * 0.55,
                                spillCentroidLonLat[1] * 0.45 + lat * 0.55,
                            ],
                        },
                        properties: { alpha: 0.92, rawAlpha: topScore * 0.92 },
                    });
                });
            }

            const attributionAlphaData: FeatureCollection = {
                type: "FeatureCollection",
                features: alphaPointsFeatures,
            };

            // 5. AIS tracks & directional markers
            const aisTrackData: FeatureCollection = {
                type: "FeatureCollection",
                features: aisTracks
                    .filter((track) => track.points.length > 1)
                    .map((track) => {
                        const suspect = suspects?.find((s) => s.vessel_id === track.vesselId);
                        const score = suspect?.overall_score ?? 0;
                        const normScore = score > 1 ? score / 100 : score;
                        const isHighScoring = normScore > 0.05;
                        const isHighlighted = track.vesselId === highlightedVesselId;

                        return {
                            type: "Feature",
                            geometry: {
                                type: "LineString",
                                coordinates: track.points.map((point) => [point.longitude, point.latitude]),
                            },
                            properties: {
                                vesselId: track.vesselId,
                                vesselName: track.vesselName,
                                isSuspect: Boolean(suspect),
                                isHighScoring,
                                isHighlighted,
                                score: normScore,
                            },
                        };
                    }),
            };

            const aisMarkerData: FeatureCollection = {
                type: "FeatureCollection",
                features: aisTracks
                    .filter((track) => track.points.length > 0)
                    .map((track) => {
                        const point = track.points[track.points.length - 1];
                        return {
                            type: "Feature",
                            geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
                            properties: {
                                vesselId: track.vesselId,
                                vesselName: track.vesselName,
                                vesselType: track.vesselType ?? "Cargo",
                                flag: track.flag ?? "Panama",
                                speedKnots: point.speed_knots ?? 14.2,
                                courseDegrees: point.course_degrees ?? 135,
                            },
                        };
                    }),
            };

            const setSource = (id: string, data: FeatureCollection) => {
                const source = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
                if (source) source.setData(data);
            };

            setSource("region", regionData);
            setSource("attribution-alpha", attributionAlphaData);
            setSource("spill-contours", contourData);
            setSource("spill-centroid", centroidData);
            setSource("hindcast-trajectory", hindcastTrajectoryData);
            setSource("forecast-trajectory", forecastTrajectoryData);
            setSource("forecast-envelope", forecastEnvelopeData);
            setSource("ais-vessel-tracks", aisTrackData);
            setSource("ais-vessel-markers", aisMarkerData);

            // Visibility control by investigation tab & layer toggles
            const showHindcast = investigationTab === "Overview" || investigationTab === "Hindcast";
            const showForecast = investigationTab === "Overview" || investigationTab === "Forecast";
            const showAis = investigationTab === "Overview" || investigationTab === "AIS Analysis" || investigationTab === "Suspects";

            // Graticule grid visibility
            if (map.getLayer("graticule-lines")) {
                map.setLayoutProperty("graticule-lines", "visibility", layerVisibility?.graticule !== false ? "visible" : "none");
            }

            // CAW Attribution Alpha Heatmap visibility
            if (map.getLayer("attribution-alpha-heatmap")) {
                const alphaVis =
                    identified &&
                    showHindcast &&
                    layerVisibility?.attributionAlpha !== false
                        ? "visible"
                        : "none";
                map.setLayoutProperty("attribution-alpha-heatmap", "visibility", alphaVis);
            }

            // Spill contours visibility
            if (map.getLayer("spill-contours-fill")) {
                const spillVis = layerVisibility?.spill !== false ? "visible" : "none";
                map.setLayoutProperty("spill-contours-fill", "visibility", spillVis);
                map.setLayoutProperty("spill-contours-line", "visibility", spillVis);
                map.setLayoutProperty("spill-centroid-glow", "visibility", spillVis);
            }

            // Hindcast trajectory visibility (visible on Overview & Hindcast immediately on load)
            if (map.getLayer("hindcast-trajectory-line")) {
                map.setLayoutProperty(
                    "hindcast-trajectory-line",
                    "visibility",
                    showHindcast && layerVisibility?.hindcast !== false ? "visible" : "none"
                );
            }

            // Forecast visibility
            if (map.getLayer("forecast-envelope-fill")) {
                const fcastVis = showForecast && layerVisibility?.forecast !== false ? "visible" : "none";
                map.setLayoutProperty("forecast-envelope-fill", "visibility", fcastVis);
                map.setLayoutProperty("forecast-envelope-outline", "visibility", fcastVis);
                map.setLayoutProperty("forecast-trajectory-line", "visibility", fcastVis);
            }

            // --- AIS Historical Candidate Tracks: Web -> Fade -> Winner Golden Trace Animation ---
            const showAisTracks = showAis && layerVisibility?.ais !== false;
            const aisTrackVis = showAisTracks ? "visible" : "none";

            if (map.getLayer("ais-vessel-tracks")) {
                map.setLayoutProperty("ais-vessel-tracks", "visibility", aisTrackVis);
            }
            if (map.getLayer("ais-vessel-tracks-winner")) {
                map.setLayoutProperty("ais-vessel-tracks-winner", "visibility", aisTrackVis);
            }
            if (map.getLayer("ais-vessel-tracks-glow")) {
                map.setLayoutProperty("ais-vessel-tracks-glow", "visibility", "none");
            }
            if (map.getLayer("ais-vessel-markers")) {
                map.setLayoutProperty("ais-vessel-markers", "visibility", "none");
            }

            const currentRun = identifyRun ?? 0;
            const isAbstain = Boolean(identified && (decision === "ABSTAIN" || winningVesselId === null));
            const isWinnerIdentified = Boolean(!isAbstain && cawActive && identified && winningVesselId !== null && winningVesselId !== undefined);

            const updateWinnerCallout = () => {
                if (!winnerMarkerRef.current) {
                    const el = document.createElement("div");
                    el.className = "pointer-events-none select-none flex items-center gap-2";
                    el.innerHTML = `
                        <div class="relative flex items-center justify-center">
                            <div class="absolute w-6 h-6 rounded-full bg-[#f59e0b]/35 animate-ping"></div>
                            <div class="w-3.5 h-3.5 rounded-full bg-[#f59e0b] border-2 border-white shadow-[0_0_10px_rgba(245,158,11,0.9)]"></div>
                        </div>
                        <div class="bg-[#050f1d]/95 border border-[#f59e0b]/60 rounded-md px-2.5 py-1 shadow-2xl backdrop-blur-md">
                            <div class="text-[9px] font-bold text-[#f59e0b] tracking-wider uppercase leading-tight">Winner Vessel</div>
                            <div class="text-[10px] font-mono font-semibold text-[#fef3c7] leading-tight">MMSI ${winningVesselId}</div>
                        </div>
                    `;
                    winnerMarkerRef.current = new maplibregl.Marker({
                        element: el,
                        anchor: "bottom-left",
                        offset: [12, -8],
                    })
                        .setLngLat(hindcastOriginLonLat)
                        .addTo(map);
                } else {
                    winnerMarkerRef.current.setLngLat(hindcastOriginLonLat);
                }
            };

            const updateAbstainCallout = () => {
                if (!abstainMarkerRef.current) {
                    const el = document.createElement("div");
                    el.className = "pointer-events-none select-none flex items-center gap-2";
                    el.innerHTML = `
                        <div class="relative flex items-center justify-center">
                            <div class="absolute w-5 h-5 rounded-full bg-[#94a3b8]/30 animate-ping"></div>
                            <div class="w-3 h-3 rounded-full bg-[#64748b] border-2 border-white shadow-[0_0_8px_rgba(148,163,184,0.7)]"></div>
                        </div>
                        <div class="bg-[#050f1d]/95 border border-[#64748b]/50 rounded-md px-2.5 py-1 shadow-2xl backdrop-blur-md">
                            <div class="text-[9px] font-bold text-[#e2e8f0] tracking-wider uppercase leading-tight">No confident match</div>
                            <div class="text-[8px] font-medium text-[#94a3b8] leading-tight">System abstained</div>
                        </div>
                    `;
                    abstainMarkerRef.current = new maplibregl.Marker({
                        element: el,
                        anchor: "bottom-left",
                        offset: [12, -8],
                    })
                        .setLngLat(hindcastOriginLonLat)
                        .addTo(map);
                } else {
                    abstainMarkerRef.current.setLngLat(hindcastOriginLonLat);
                }
            };

            if (isIdentifying) {
                // When identification begins / is loading: Cancel any ongoing timers or animation frames
                if (aisAnimationRef.current.timerId !== null) {
                    window.clearTimeout(aisAnimationRef.current.timerId);
                    aisAnimationRef.current.timerId = null;
                }
                if (aisAnimationRef.current.frameId !== null) {
                    cancelAnimationFrame(aisAnimationRef.current.frameId);
                    aisAnimationRef.current.frameId = null;
                }
                aisAnimationRef.current.animatedRunId = null;

                // Clear golden winner line, waypoints, winner callout, and abstain callout
                setSource("caw-approach-line", emptyCollection);
                setSource("caw-winner-marker", emptyCollection);
                if (map.getLayer("caw-winner-path")) {
                    map.setLayoutProperty("caw-winner-path", "visibility", "none");
                    map.setLayoutProperty("caw-winner-glow", "visibility", "none");
                }
                if (map.getLayer("caw-winner-waypoints")) {
                    map.setLayoutProperty("caw-winner-waypoints", "visibility", "none");
                }
                winnerMarkerRef.current?.remove();
                winnerMarkerRef.current = null;
                abstainMarkerRef.current?.remove();
                abstainMarkerRef.current = null;

                // Phase 1 (Web): Reset all 20 candidate tracks to equal opacity 1.0
                if (map.getLayer("ais-vessel-tracks")) {
                    map.setFilter("ais-vessel-tracks", ["has", "vesselId"]);
                    map.setPaintProperty("ais-vessel-tracks", "line-opacity", 1.0);
                }
                if (map.getLayer("ais-vessel-tracks-winner")) {
                    map.setFilter("ais-vessel-tracks-winner", ["==", ["get", "vesselId"], -1]);
                    map.setPaintProperty("ais-vessel-tracks-winner", "line-opacity", 1.0);
                }
            } else if (isWinnerIdentified) {
                // Once Custodes/CAW has resolved the winner (COMMIT or REFINE_GRID)
                abstainMarkerRef.current?.remove();
                abstainMarkerRef.current = null;

                const winningTrack = aisTracks.find((t) => t.vesselId === winningVesselId);
                const actualWaypoints = winningTrack && winningTrack.points.length > 0
                    ? winningTrack.points.map((p) => [p.longitude, p.latitude] as [number, number])
                    : [];
                const fullWinnerCoords: [number, number][] =
                    actualWaypoints.length > 0
                        ? [...actualWaypoints, hindcastOriginLonLat]
                        : [hindcastOriginLonLat];

                if (aisAnimationRef.current.animatedRunId !== currentRun) {
                    if (aisAnimationRef.current.timerId !== null) {
                        window.clearTimeout(aisAnimationRef.current.timerId);
                        aisAnimationRef.current.timerId = null;
                    }
                    if (aisAnimationRef.current.frameId !== null) {
                        cancelAnimationFrame(aisAnimationRef.current.frameId);
                        aisAnimationRef.current.frameId = null;
                    }

                    aisAnimationRef.current.animatedRunId = currentRun;

                    // Clear previous gold trace, waypoints, and callout
                    setSource("caw-approach-line", emptyCollection);
                    setSource("caw-winner-marker", emptyCollection);
                    if (map.getLayer("caw-winner-path")) {
                        map.setLayoutProperty("caw-winner-path", "visibility", "none");
                        map.setLayoutProperty("caw-winner-glow", "visibility", "none");
                    }
                    if (map.getLayer("caw-winner-waypoints")) {
                        map.setLayoutProperty("caw-winner-waypoints", "visibility", "none");
                    }
                    winnerMarkerRef.current?.remove();
                    winnerMarkerRef.current = null;

                    // Phase 1 (Web): Ensure winner track and losing tracks are initially equal at opacity 1.0
                    if (map.getLayer("ais-vessel-tracks-winner")) {
                        map.setFilter("ais-vessel-tracks-winner", ["==", ["get", "vesselId"], winningVesselId]);
                        map.setPaintProperty("ais-vessel-tracks-winner", "line-opacity", 1.0);
                    }
                    if (map.getLayer("ais-vessel-tracks")) {
                        map.setFilter("ais-vessel-tracks", ["!=", ["get", "vesselId"], winningVesselId]);
                        map.setPaintProperty("ais-vessel-tracks", "line-opacity", 1.0);
                    }

                    // Phase 1 -> Phase 2: Wait 200ms before starting fade
                    aisAnimationRef.current.timerId = window.setTimeout(() => {
                        aisAnimationRef.current.timerId = null;
                        const fadeDurationMs = 400;
                        const startFadeTime = performance.now();

                        // Phase 2: Smoothly fade losing 19 tracks from opacity 1.0 -> 0.08 over 400ms
                        const fadeStep = (fadeNow: number) => {
                            const fadeElapsed = fadeNow - startFadeTime;
                            const fadeProgress = Math.min(fadeElapsed / fadeDurationMs, 1);
                            const currentOpacity = 1.0 - fadeProgress * (1.0 - 0.08);

                            if (map.getLayer("ais-vessel-tracks")) {
                                map.setPaintProperty("ais-vessel-tracks", "line-opacity", currentOpacity);
                            }

                            if (fadeProgress < 1) {
                                aisAnimationRef.current.frameId = requestAnimationFrame(fadeStep);
                            } else {
                                if (map.getLayer("ais-vessel-tracks")) {
                                    map.setPaintProperty("ais-vessel-tracks", "line-opacity", 0.08);
                                }
                                aisAnimationRef.current.frameId = null;

                                // Phase 3: Golden Winner AIS Trace animation immediately after fade reaches 0.08
                                if (map.getLayer("caw-winner-path")) {
                                    map.setLayoutProperty("caw-winner-path", "visibility", "visible");
                                    map.setLayoutProperty("caw-winner-glow", "visibility", "visible");
                                }
                                if (map.getLayer("caw-winner-waypoints")) {
                                    map.setLayoutProperty("caw-winner-waypoints", "visibility", "visible");
                                }

                                const drawDurationMs = 800;
                                const startDrawTime = performance.now();

                                const drawStep = (drawNow: number) => {
                                    const drawElapsed = drawNow - startDrawTime;
                                    const drawProgress = Math.min(drawElapsed / drawDurationMs, 1);

                                    // Progressive slice along fullWinnerCoords
                                    const totalSegments = fullWinnerCoords.length - 1;
                                    let lineCoords: [number, number][] = [];
                                    let dotsCoords: [number, number][] = [];

                                    if (totalSegments <= 0) {
                                        lineCoords = fullWinnerCoords;
                                        dotsCoords = fullWinnerCoords;
                                    } else if (drawProgress >= 1) {
                                        lineCoords = fullWinnerCoords;
                                        dotsCoords = fullWinnerCoords;
                                    } else {
                                        const exactPos = drawProgress * totalSegments;
                                        const segIdx = Math.min(Math.floor(exactPos), totalSegments - 1);
                                        const segRemainder = exactPos - segIdx;
                                        const p0 = fullWinnerCoords[segIdx];
                                        const p1 = fullWinnerCoords[segIdx + 1];
                                        const tip: [number, number] = [
                                            p0[0] + (p1[0] - p0[0]) * segRemainder,
                                            p0[1] + (p1[1] - p0[1]) * segRemainder,
                                        ];
                                        lineCoords = [...fullWinnerCoords.slice(0, segIdx + 1), tip];
                                        dotsCoords = fullWinnerCoords.slice(0, segIdx + 1);
                                    }

                                    // Update line GeoJSON
                                    setSource("caw-approach-line", {
                                        type: "FeatureCollection",
                                        features: lineCoords.length >= 2 ? [
                                            {
                                                type: "Feature",
                                                geometry: { type: "LineString", coordinates: lineCoords },
                                                properties: {},
                                            },
                                        ] : [],
                                    });

                                    // Update waypoints GeoJSON
                                    setSource("caw-winner-marker", {
                                        type: "FeatureCollection",
                                        features: dotsCoords.map((pt) => ({
                                            type: "Feature",
                                            geometry: { type: "Point", coordinates: pt },
                                            properties: {},
                                        })),
                                    });

                                    if (drawProgress < 1) {
                                        aisAnimationRef.current.frameId = requestAnimationFrame(drawStep);
                                    } else {
                                        aisAnimationRef.current.frameId = null;
                                        updateWinnerCallout();
                                    }
                                };

                                aisAnimationRef.current.frameId = requestAnimationFrame(drawStep);
                            }
                        };

                        aisAnimationRef.current.frameId = requestAnimationFrame(fadeStep);
                    }, 200);
                } else if (aisAnimationRef.current.timerId === null && aisAnimationRef.current.frameId === null) {
                    // Animation already completed for this run: keep winner at 1.0, losers at 0.08, full gold path & dots, winner label
                    if (map.getLayer("ais-vessel-tracks-winner")) {
                        map.setFilter("ais-vessel-tracks-winner", ["==", ["get", "vesselId"], winningVesselId]);
                        map.setPaintProperty("ais-vessel-tracks-winner", "line-opacity", 1.0);
                    }
                    if (map.getLayer("ais-vessel-tracks")) {
                        map.setFilter("ais-vessel-tracks", ["!=", ["get", "vesselId"], winningVesselId]);
                        map.setPaintProperty("ais-vessel-tracks", "line-opacity", 0.08);
                    }
                    if (map.getLayer("caw-winner-path")) {
                        map.setLayoutProperty("caw-winner-path", "visibility", "visible");
                        map.setLayoutProperty("caw-winner-glow", "visibility", "visible");
                    }
                    if (map.getLayer("caw-winner-waypoints")) {
                        map.setLayoutProperty("caw-winner-waypoints", "visibility", "visible");
                    }
                    setSource("caw-approach-line", {
                        type: "FeatureCollection",
                        features: fullWinnerCoords.length >= 2 ? [
                            {
                                type: "Feature",
                                geometry: { type: "LineString", coordinates: fullWinnerCoords },
                                properties: {},
                            },
                        ] : [],
                    });
                    setSource("caw-winner-marker", {
                        type: "FeatureCollection",
                        features: fullWinnerCoords.map((pt) => ({
                            type: "Feature",
                            geometry: { type: "Point", coordinates: pt },
                            properties: {},
                        })),
                    });
                    updateWinnerCallout();
                }
            } else if (isAbstain) {
                // System abstained or top candidate is null:
                // No golden winner trace, no waypoint dots, no winner callout label.
                winnerMarkerRef.current?.remove();
                winnerMarkerRef.current = null;
                setSource("caw-approach-line", emptyCollection);
                setSource("caw-winner-marker", emptyCollection);
                if (map.getLayer("caw-winner-path")) {
                    map.setLayoutProperty("caw-winner-path", "visibility", "none");
                    map.setLayoutProperty("caw-winner-glow", "visibility", "none");
                }
                if (map.getLayer("caw-winner-waypoints")) {
                    map.setLayoutProperty("caw-winner-waypoints", "visibility", "none");
                }

                if (aisAnimationRef.current.animatedRunId !== currentRun) {
                    if (aisAnimationRef.current.timerId !== null) {
                        window.clearTimeout(aisAnimationRef.current.timerId);
                        aisAnimationRef.current.timerId = null;
                    }
                    if (aisAnimationRef.current.frameId !== null) {
                        cancelAnimationFrame(aisAnimationRef.current.frameId);
                        aisAnimationRef.current.frameId = null;
                    }

                    aisAnimationRef.current.animatedRunId = currentRun;
                    abstainMarkerRef.current?.remove();
                    abstainMarkerRef.current = null;

                    // Phase 1 (Web): Show all candidate tracks at opacity 1.0
                    if (map.getLayer("ais-vessel-tracks")) {
                        map.setFilter("ais-vessel-tracks", ["has", "vesselId"]);
                        map.setPaintProperty("ais-vessel-tracks", "line-opacity", 1.0);
                    }
                    if (map.getLayer("ais-vessel-tracks-winner")) {
                        map.setFilter("ais-vessel-tracks-winner", ["==", ["get", "vesselId"], -1]);
                    }

                    // Phase 1 -> Phase 2: Wait 200ms before starting fade
                    aisAnimationRef.current.timerId = window.setTimeout(() => {
                        aisAnimationRef.current.timerId = null;
                        const fadeDurationMs = 400;
                        const startFadeTime = performance.now();

                        // Phase 2: Smoothly fade all candidate tracks from opacity 1.0 -> 0.08 over 400ms
                        const fadeStep = (fadeNow: number) => {
                            const fadeElapsed = fadeNow - startFadeTime;
                            const fadeProgress = Math.min(fadeElapsed / fadeDurationMs, 1);
                            const currentOpacity = 1.0 - fadeProgress * (1.0 - 0.08);

                            if (map.getLayer("ais-vessel-tracks")) {
                                map.setPaintProperty("ais-vessel-tracks", "line-opacity", currentOpacity);
                            }

                            if (fadeProgress < 1) {
                                aisAnimationRef.current.frameId = requestAnimationFrame(fadeStep);
                            } else {
                                if (map.getLayer("ais-vessel-tracks")) {
                                    map.setPaintProperty("ais-vessel-tracks", "line-opacity", 0.08);
                                }
                                aisAnimationRef.current.frameId = null;
                                updateAbstainCallout();
                            }
                        };

                        aisAnimationRef.current.frameId = requestAnimationFrame(fadeStep);
                    }, 200);
                } else if (aisAnimationRef.current.timerId === null && aisAnimationRef.current.frameId === null) {
                    // Animation already completed for this run: keep candidate tracks at 0.08 & show abstain callout
                    if (map.getLayer("ais-vessel-tracks")) {
                        map.setFilter("ais-vessel-tracks", ["has", "vesselId"]);
                        map.setPaintProperty("ais-vessel-tracks", "line-opacity", 0.08);
                    }
                    if (map.getLayer("ais-vessel-tracks-winner")) {
                        map.setFilter("ais-vessel-tracks-winner", ["==", ["get", "vesselId"], -1]);
                    }
                    updateAbstainCallout();
                }
            } else {
                // Initial page state: No CAW identification result yet, all tracks equal at opacity 1.0
                if (aisAnimationRef.current.timerId !== null) {
                    window.clearTimeout(aisAnimationRef.current.timerId);
                    aisAnimationRef.current.timerId = null;
                }
                if (aisAnimationRef.current.frameId !== null) {
                    cancelAnimationFrame(aisAnimationRef.current.frameId);
                    aisAnimationRef.current.frameId = null;
                }
                aisAnimationRef.current.animatedRunId = null;

                setSource("caw-approach-line", emptyCollection);
                setSource("caw-winner-marker", emptyCollection);
                if (map.getLayer("caw-winner-path")) {
                    map.setLayoutProperty("caw-winner-path", "visibility", "none");
                    map.setLayoutProperty("caw-winner-glow", "visibility", "none");
                }
                if (map.getLayer("caw-winner-waypoints")) {
                    map.setLayoutProperty("caw-winner-waypoints", "visibility", "none");
                }
                winnerMarkerRef.current?.remove();
                winnerMarkerRef.current = null;
                abstainMarkerRef.current?.remove();
                abstainMarkerRef.current = null;

                if (map.getLayer("ais-vessel-tracks")) {
                    map.setFilter("ais-vessel-tracks", ["has", "vesselId"]);
                    map.setPaintProperty("ais-vessel-tracks", "line-opacity", 1.0);
                }
                if (map.getLayer("ais-vessel-tracks-winner")) {
                    map.setFilter("ais-vessel-tracks-winner", ["==", ["get", "vesselId"], -1]);
                    map.setPaintProperty("ais-vessel-tracks-winner", "line-opacity", 1.0);
                }
            }

            // --- HTML CALLOUT 1: Hindcast Origin Marker ---
            if (showHindcast && hindcastOriginLonLat) {
                if (!originMarkerRef.current) {
                    const el = document.createElement("div");
                    el.className = "pointer-events-none select-none flex items-center gap-2";
                    el.innerHTML = `
                        <div class="relative flex items-center justify-center">
                            <div class="absolute w-5 h-5 rounded-full bg-[#f97316]/35 animate-pulse"></div>
                            <div class="w-3 h-3 rounded-full bg-[#f97316] border-2 border-white shadow-[0_0_8px_rgba(249,115,22,0.85)]"></div>
                        </div>
                        <div class="bg-[#050f1d]/90 border border-[#f97316]/50 rounded px-2 py-0.5 shadow-lg backdrop-blur-sm">
                            <div class="text-[8.5px] font-bold text-[#f97316] leading-tight">Estimated Origin</div>
                            <div class="text-[8px] font-medium text-[#fdba74] leading-tight">Backward Hindcast</div>
                        </div>
                    `;
                    originMarkerRef.current = new maplibregl.Marker({
                        element: el,
                        anchor: "top-left",
                        offset: [12, 8],
                    })
                        .setLngLat(hindcastOriginLonLat)
                        .addTo(map);
                } else {
                    originMarkerRef.current.setLngLat(hindcastOriginLonLat);
                }
            } else {
                originMarkerRef.current?.remove();
                originMarkerRef.current = null;
            }

            // --- HTML CALLOUT 3: 24h Forecast Centroid Label ---
            if (showForecast && forecastCentroidLonLat) {
                if (!forecastMarkerRef.current) {
                    const el = document.createElement("div");
                    el.className = "pointer-events-none select-none flex items-center gap-2";
                    el.innerHTML = `
                        <div class="relative flex items-center justify-center">
                            <div class="absolute w-5 h-5 rounded-full bg-[#06b6d4]/35 animate-pulse"></div>
                            <div class="w-3 h-3 rounded-full bg-[#22d4ee] border-2 border-white shadow-[0_0_8px_rgba(34,211,238,0.85)]"></div>
                        </div>
                        <div class="bg-[#050f1d]/90 border border-[#06b6d4]/50 rounded px-2 py-0.5 shadow-lg backdrop-blur-sm">
                            <div class="text-[8.5px] font-bold text-[#22d4ee] leading-tight">24h Forecast</div>
                            <div class="text-[8px] font-medium text-[#a5f3fc] leading-tight">Centroid</div>
                        </div>
                    `;
                    forecastMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "left" })
                        .setLngLat(forecastCentroidLonLat)
                        .addTo(map);
                } else {
                    forecastMarkerRef.current.setLngLat(forecastCentroidLonLat);
                }
            } else {
                forecastMarkerRef.current?.remove();
                forecastMarkerRef.current = null;
            }

            // First identification camera animation (runs strictly once on first identification)
            if (isIdentifying && !hasFlownRef.current) {
                hasFlownRef.current = true;
                map.flyTo({
                    center: [spillCentroidLonLat[0], spillCentroidLonLat[1]],
                    zoom: 8.4,
                    duration: 700,
                });
            }
        };

        if (map.isStyleLoaded()) drawData();
        else map.once("load", drawData);
    }, [region, spillId, analysis, investigationTab, aisTracks, highlightedVesselId, cawActive, winningVesselId, decision, isIdentifying, identifyRun, identified, alphaSurface, suspects, layerVisibility, ensureLayers]);

    // Vessel click handler
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
            const content = document.createElement("div");
            content.className = "text-xs leading-5 p-1";
            content.innerHTML = `
                <div style="color:#f8fafc;font-weight:700;font-size:12px">${String(props.vesselName ?? `Vessel ${vesselId}`)}</div>
                <div style="color:#7ab8d0;font-size:10px">${String(props.vesselType ?? "Unknown")} · ${String(props.flag ?? "Unknown")}</div>
                <div style="color:#f59e0b;font-family:monospace;font-size:10px;margin-top:2px">MMSI ${vesselId} · ${String(props.speedKnots)} kn</div>
            `;
            new maplibregl.Popup({ closeButton: true, offset: 12 })
                .setLngLat(feature.geometry.coordinates as [number, number])
                .setDOMContent(content)
                .addTo(map);
        };

        if (!clickHandlerRef.current) {
            map.on("click", "ais-vessel-markers", handler);
            clickHandlerRef.current = handler;
        }
        map.on("mouseenter", "ais-vessel-markers", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "ais-vessel-markers", () => { map.getCanvas().style.cursor = ""; });
    }, [onVesselSelect]);

    return (
        <div className="absolute inset-0">
            <div className="absolute inset-0" ref={containerRef} />
            {loadError && (
                <div className="pointer-events-none absolute bottom-3 right-14 z-10 rounded border border-[#ef4444]/40 bg-[#030d17]/95 px-3 py-1.5 text-[10px] text-[#ef4444]">
                    API data unavailable · local maritime basemap active
                </div>
            )}
        </div>
    );
}

