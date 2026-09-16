import { useEffect, useRef, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection, Geometry } from "geojson";

import { API_BASE_URL } from "../../services/api";
import type { AisTrack, CustodesDecision, SpillAnalysis, SuspectCandidate, VesselTrackPoint } from "../../types/intelligence";
import { isSea, clipTrackToWater, clipTrackToWaterWithStats, validateWaterOnlyGeometry } from "../../utils/landMask";

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
    identifyRun?: number;
    hindcastRun?: number;
    forecastRun?: number;
    identified?: boolean;
    suspects?: SuspectCandidate[];
    onVesselSelect?: (vesselId: number) => void;
    onCoordsUpdate?: (coords: { lon: number; lat: number } | null) => void;
    onMapReady?: (map: MapLibreMap) => void;
    layerVisibility?: {
        spill?: boolean;
        hindcast?: boolean;
        forecast?: boolean;
        ais?: boolean;
        graticule?: boolean;
    };
    isIdentifying?: boolean;
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

// Deterministic asymmetric SAR-detected irregular oil slick profile (16 vertices).
// Calibrated to preserve exact centroid (cx=0, cy=0), non-circular organic boundary,
// natural lobes/tapers, and realistic ~19.77 km² footprint area matching the reference image.
const IRREGULAR_SLICK_OFFSETS: [number, number][] = [
    [-0.02449, 0.01995],  // NW tapered apex (pointing towards forecast drift corridor)
    [-0.01828, 0.02202],  // North flank step / notch
    [-0.01103, 0.02440],  // North protrusion lobe 1
    [-0.00326, 0.01943],  // North-NE depression / indentation
    [0.00761, 0.01787],   // NE shoulder lobe 2
    [0.01486, 0.01063],   // East-NE transition
    [0.02159, 0.00234],   // East taper section
    [0.02728, -0.01215],  // SE trailing tip (pointing towards hindcast origin)
    [0.02366, -0.02044],  // SE bottom hook lobe
    [0.01434, -0.01888],  // South-SE indentation
    [0.00450, -0.02251],  // South central belly (widest organic bulge)
    [-0.00637, -0.01992], // South-SW lobe
    [-0.01362, -0.01215], // SW cove / concave bay
    [-0.02035, -0.00542], // West flank lobe 3
    [-0.02242, 0.00441],  // West-NW waist
    [-0.02501, 0.01270],  // West approach to apex
];

// Generate natural multi-band irregular oil slick contour representation
function generateSpillContours(
    centroid: [number, number],
    physicalAreaKm2?: number
): FeatureCollection {
    const [cLon, cLat] = centroid;
    // Scale dynamically if incident has custom physical area, normalized to baseline 19.77 km²
    const baseArea = 19.77;
    const areaScale = physicalAreaKm2 && physicalAreaKm2 > 0 ? Math.sqrt(physicalAreaKm2 / baseArea) : 1.0;

    // Realistic SAR-detected irregular oil-slick footprint:
    // Level 2: Outer slick (translucent dark red/red-orange, subtle outline)
    // Level 1: Dense interior core (darker red, organically scaled, slightly more opaque)
    const contourLevels = [
        { level: 2, scale: 1.0, color: "#dc2626", stroke: "#ef4444", opacity: 0.25, strokeOpacity: 0.85 },
        { level: 1, scale: 0.58, color: "#991b1b", stroke: "#dc2626", opacity: 0.45, strokeOpacity: 0.60 },
    ];

    const features: any[] = [];
    for (const conf of contourLevels) {
        const ring = IRREGULAR_SLICK_OFFSETS.map(([dLon, dLat]) => [
            cLon + dLon * areaScale * conf.scale,
            cLat + dLat * areaScale * conf.scale,
        ]);
        if (ring.length > 0) {
            ring.push([...ring[0]]);
        }
        features.push({
            type: "Feature",
            geometry: {
                type: "Polygon",
                coordinates: [ring],
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

// Deterministic sparse sampling of winning waypoint circles for a tactical, uncluttered AIS display
function getSampledWaypointIndices(totalPoints: number, targetCount: number = 8): number[] {
    if (totalPoints <= 0) return [];
    if (totalPoints <= targetCount) {
        return Array.from({ length: totalPoints }, (_, i) => i);
    }
    const numIntervals = Math.min(targetCount - 1, totalPoints - 1);
    const indices: number[] = [];
    for (let i = 0; i <= numIntervals; i++) {
        const idx = Math.round((i * (totalPoints - 1)) / numIntervals);
        if (indices.length === 0 || indices[indices.length - 1] !== idx) {
            indices.push(idx);
        }
    }
    return indices;
}

// Calculate quadratic Bezier control point with alternating perpendicular curvature
function generateHookControlPoint(
    p0: [number, number],
    p2: [number, number],
    idx: number
): [number, number] {
    const dLon = p2[0] - p0[0];
    const dLat = p2[1] - p0[1];
    const dist = Math.hypot(dLon, dLat);
    if (dist < 1e-6) return p0;
    const nLon = -dLat / dist;
    const nLat = dLon / dist;
    // Alternate curvature direction and vary magnitude across vessels for natural curved arcs
    const curvatureSign = idx % 2 === 0 ? 1 : -1;
    const curvatureFactor = (0.18 + ((idx * 7) % 7) * 0.015) * curvatureSign;
    const mLon = (p0[0] + p2[0]) / 2;
    const mLat = (p0[1] + p2[1]) / 2;
    return [mLon + nLon * dist * curvatureFactor, mLat + nLat * dist * curvatureFactor];
}

// Sample quadratic Bezier curve from t=0 to t=tMax
function sampleBezierCurve(
    p0: [number, number],
    p1: [number, number],
    p2: [number, number],
    tMax: number,
    numSteps: number = 24
): [number, number][] {
    const clampedT = Math.max(0.001, Math.min(1, tMax));
    const steps = Math.max(3, Math.round(numSteps * clampedT));
    const pts: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * clampedT;
        const u = 1 - t;
        const lon = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0];
        const lat = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
        pts.push([lon, lat]);
    }
    return pts;
}

// Ease-in-out quadratic function for organic acceleration & deceleration
function easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Ease-in-out cubic function for cinematic forensic backtrack trajectory reveal
function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Ease-out cubic function for smooth settling and expanding pulses
function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
}

// Densify a water-clipped polyline for smooth progressive reveal and probe tracking
function densifyWaterPath(coords: [number, number][], numSamples: number = 100): [number, number][] {
    if (!coords || coords.length < 2) return coords ?? [];
    const segLengths: number[] = [];
    let totalLen = 0;
    for (let i = 0; i < coords.length - 1; i++) {
        const d = Math.hypot(coords[i + 1][0] - coords[i][0], coords[i + 1][1] - coords[i][1]);
        segLengths.push(d);
        totalLen += d;
    }
    if (totalLen === 0) return coords;

    const result: [number, number][] = [coords[0]];
    for (let s = 1; s < numSamples; s++) {
        const targetDist = (s / numSamples) * totalLen;
        let accum = 0;
        for (let i = 0; i < segLengths.length; i++) {
            if (accum + segLengths[i] >= targetDist || i === segLengths.length - 1) {
                const segFrac = segLengths[i] > 0 ? (targetDist - accum) / segLengths[i] : 0;
                const p1 = coords[i];
                const p2 = coords[i + 1];
                result.push([
                    p1[0] + segFrac * (p2[0] - p1[0]),
                    p1[1] + segFrac * (p2[1] - p1[1]),
                ]);
                break;
            }
            accum += segLengths[i];
        }
    }
    // Strictly anchor to exact terminal coordinate (authoritative origin or forecast endpoint)
    result.push(coords[coords.length - 1]);
    return result;
}

// Deterministic 2-cycle back-and-forth oscillation weight in [0, 1]
// tau in [0, 1] maps to 2 full cycles (backward -> forward -> backward -> forward)
function getTwoCycleWeight(tau: number): number {
    if (tau <= 0 || tau >= 1) return 0;
    const cyclePos = (tau * 4) % 2; // in [0, 2)
    return cyclePos < 1 ? easeInOutQuad(cyclePos) : easeInOutQuad(2 - cyclePos);
}

// Calculate interpolated probe waypoint coordinate along vessel's historical AIS trajectory
function getProbeCoordinate(
    points: VesselTrackPoint[],
    backwardFraction: number
): [number, number] {
    const totalPoints = points.length;
    if (totalPoints <= 0) return [0, 0];
    if (totalPoints === 1 || backwardFraction <= 0) {
        const p = points[totalPoints - 1];
        return [p.longitude, p.latitude];
    }

    const maxIndex = totalPoints - 1;
    const targetIdx = Math.max(0, maxIndex - backwardFraction * maxIndex);
    const baseIdx = Math.max(0, Math.min(totalPoints - 2, Math.floor(targetIdx)));
    const frac = targetIdx - baseIdx;

    const pA = points[baseIdx];
    const pB = points[baseIdx + 1];
    const lon = pA.longitude + frac * (pB.longitude - pA.longitude);
    const lat = pA.latitude + frac * (pB.latitude - pA.latitude);
    return [lon, lat];
}

// Smooth visual interpolation of AIS waypoints for high-fidelity maritime tracks
function getSmoothedAisCoordinates(points: VesselTrackPoint[], subSteps: number = 3): [number, number][] {
    if (points.length <= 1) {
        return points.map((p) => [p.longitude, p.latitude]);
    }
    const coords: [number, number][] = [];
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i];
        const p1 = points[i + 1];
        coords.push([p0.longitude, p0.latitude]);
        for (let s = 1; s < subSteps; s++) {
            const f = s / subSteps;
            const lon = p0.longitude + f * (p1.longitude - p0.longitude);
            const lat = p0.latitude + f * (p1.latitude - p0.latitude);
            coords.push([lon, lat]);
        }
    }
    const last = points[points.length - 1];
    coords.push([last.longitude, last.latitude]);
    return coords;
}

// Build winner attribution path starting at hindcast origin and following vessel's historical trajectory
function buildWinnerAttributionPath(
    origin: [number, number],
    points: VesselTrackPoint[]
): [number, number][] {
    if (!points || points.length === 0) return [origin, origin];
    if (points.length === 1) return [origin, [points[0].longitude, points[0].latitude]];

    // Find the historical waypoint closest to origin
    let closestIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < points.length; i++) {
        const dLon = points[i].longitude - origin[0];
        const dLat = points[i].latitude - origin[1];
        const dist = Math.hypot(dLon, dLat);
        if (dist < minDist) {
            minDist = dist;
            closestIdx = i;
        }
    }

    // Connect from origin to closest historical waypoint, then trace forward to vessel latest fix
    const trackSlice = closestIdx < points.length - 1
        ? points.slice(closestIdx)
        : points.slice(Math.max(0, points.length - 5));

    const smoothedTrack = getSmoothedAisCoordinates(trackSlice, 3);
    const fullPath: [number, number][] = [origin, ...smoothedTrack];
    return fullPath.length >= 2 ? fullPath : [origin, [points[points.length - 1].longitude, points[points.length - 1].latitude]];
}

// Sample exactly targetCount waypoints evenly spaced along coordinate path
function sampleWaypointsAlongPath(
    coords: [number, number][],
    targetCount: number = 8
): [number, number][] {
    if (coords.length <= 1 || targetCount <= 0) return [];

    const segDists: number[] = [];
    let totalDist = 0;
    for (let i = 0; i < coords.length - 1; i++) {
        const d = Math.hypot(coords[i + 1][0] - coords[i][0], coords[i + 1][1] - coords[i][1]);
        segDists.push(d);
        totalDist += d;
    }

    if (totalDist <= 1e-6) {
        return Array(targetCount).fill(coords[coords.length - 1]);
    }

    const waypoints: [number, number][] = [];
    for (let k = 1; k <= targetCount; k++) {
        const targetDist = (k / targetCount) * totalDist;
        let accum = 0;
        let found = false;
        for (let i = 0; i < segDists.length; i++) {
            const d = segDists[i];
            if (accum + d >= targetDist || i === segDists.length - 1) {
                const remain = targetDist - accum;
                const frac = d > 0 ? Math.min(1, Math.max(0, remain / d)) : 0;
                waypoints.push([
                    coords[i][0] + frac * (coords[i + 1][0] - coords[i][0]),
                    coords[i][1] + frac * (coords[i + 1][1] - coords[i][1]),
                ]);
                found = true;
                break;
            }
            accum += d;
        }
        if (!found) {
            waypoints.push(coords[coords.length - 1]);
        }
    }
    return waypoints;
}

// Progressive distance slicing along a coordinate path
function getProgressivePathAndWaypoints(
    fullCoords: [number, number][],
    sampleWaypoints: [number, number][],
    prog: number
): { coords: [number, number][]; dots: [number, number][] } {
    if (fullCoords.length < 2) {
        return { coords: fullCoords, dots: [] };
    }
    const clampedProg = Math.max(0, Math.min(1, prog));
    if (clampedProg >= 1) {
        return { coords: fullCoords, dots: sampleWaypoints };
    }

    const segDists: number[] = [];
    let totalDist = 0;
    for (let i = 0; i < fullCoords.length - 1; i++) {
        const d = Math.hypot(
            fullCoords[i + 1][0] - fullCoords[i][0],
            fullCoords[i + 1][1] - fullCoords[i][1]
        );
        segDists.push(d);
        totalDist += d;
    }

    // Ensure at least 2 points even at prog = 0 so LineString is valid GeoJSON
    const minProg = totalDist > 0 ? Math.min(0.005, 1 / fullCoords.length) : 0;
    const effectiveProg = Math.max(clampedProg, minProg);
    const targetDist = effectiveProg * totalDist;

    let accum = 0;
    const partialCoords: [number, number][] = [fullCoords[0]];

    for (let i = 0; i < segDists.length; i++) {
        const d = segDists[i];
        if (accum + d <= targetDist) {
            accum += d;
            partialCoords.push(fullCoords[i + 1]);
        } else {
            const remain = targetDist - accum;
            const frac = d > 0 ? remain / d : 0;
            const tipLon = fullCoords[i][0] + frac * (fullCoords[i + 1][0] - fullCoords[i][0]);
            const tipLat = fullCoords[i][1] + frac * (fullCoords[i + 1][1] - fullCoords[i][1]);
            partialCoords.push([tipLon, tipLat]);
            break;
        }
    }

    if (partialCoords.length < 2 && fullCoords.length >= 2) {
        partialCoords.push(fullCoords[1]);
    }

    const visibleDots = sampleWaypoints.filter((_, idx) => (idx + 1) / sampleWaypoints.length <= clampedProg);
    return { coords: partialCoords, dots: visibleDots };
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

    // SPILL DETECTION FOOTPRINT (Primary static map feature: restrained fill & subtle outline)
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
                "line-width": ["case", ["==", ["get", "level"], 2], 1.4, 0.9],
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
                "line-width": 1.7,
                "line-opacity": 0.65,
                "line-dasharray": [4, 4],
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

    // DEDICATED HINDCAST BACKTRACKING ANIMATION LAYERS
    {
        id: "detection-target-lock",
        spec: {
            id: "detection-target-lock",
            type: "circle",
            source: "detection-target-lock",
            paint: {
                "circle-color": "transparent",
                "circle-radius": ["coalesce", ["get", "radius"], 10],
                "circle-stroke-color": "#00d4ff",
                "circle-stroke-width": 1.8,
                "circle-stroke-opacity": ["coalesce", ["get", "opacity"], 0.85],
            },
        },
    },
    {
        id: "hindcast-backtrack-glow",
        spec: {
            id: "hindcast-backtrack-glow",
            type: "line",
            source: "hindcast-backtrack-trace",
            paint: {
                "line-color": "#00d4ff",
                "line-width": 6.0,
                "line-blur": 3.5,
                "line-opacity": ["coalesce", ["get", "opacity"], 0.35],
            },
            layout: {
                "line-join": "round",
                "line-cap": "round",
            },
        },
    },
    {
        id: "hindcast-backtrack-trace",
        spec: {
            id: "hindcast-backtrack-trace",
            type: "line",
            source: "hindcast-backtrack-trace",
            paint: {
                "line-color": "#38bdf8",
                "line-width": 2.4,
                "line-opacity": ["coalesce", ["get", "opacity"], 0.95],
                "line-dasharray": [4, 3],
            },
            layout: {
                "line-join": "round",
                "line-cap": "round",
            },
        },
    },
    {
        id: "hindcast-backtrack-trail",
        spec: {
            id: "hindcast-backtrack-trail",
            type: "line",
            source: "hindcast-backtrack-trail",
            paint: {
                "line-color": "#67e8f9",
                "line-width": 3.8,
                "line-opacity": 0.85,
                "line-blur": 1.5,
            },
            layout: {
                "line-join": "round",
                "line-cap": "round",
            },
        },
    },
    {
        id: "hindcast-backtrack-probe",
        spec: {
            id: "hindcast-backtrack-probe",
            type: "circle",
            source: "hindcast-backtrack-probe",
            paint: {
                "circle-color": "#ffffff",
                "circle-radius": 4.5,
                "circle-stroke-color": "#00d4ff",
                "circle-stroke-width": 2.5,
                "circle-opacity": ["coalesce", ["get", "opacity"], 1.0],
                "circle-stroke-opacity": ["coalesce", ["get", "opacity"], 1.0],
            },
        },
    },
    {
        id: "hindcast-origin-pulse",
        spec: {
            id: "hindcast-origin-pulse",
            type: "circle",
            source: "hindcast-origin-pulse",
            paint: {
                "circle-color": "transparent",
                "circle-radius": ["coalesce", ["get", "radius"], 12],
                "circle-stroke-color": "#f59e0b",
                "circle-stroke-width": 2.0,
                "circle-stroke-opacity": ["coalesce", ["get", "opacity"], 0.8],
            },
        },
    },

    // CAW INVESTIGATION HOOKS (Phase 2 & 3: Curved grey attribution hooks probing vessel trajectories)
    {
        id: "caw-investigation-hooks",
        spec: {
            id: "caw-investigation-hooks",
            type: "line",
            source: "caw-investigation-hooks",
            paint: {
                "line-color": "#94a3b8",
                "line-width": 2.0,
                "line-opacity": ["coalesce", ["get", "opacity"], 0.7],
            },
            layout: {
                "line-join": "round",
                "line-cap": "round",
            },
        },
    },

    // CAW WINNER GOLDEN AIS TRAJECTORY (Layer Order #8 - ABOVE hooks and AIS tracks)
    {
        id: "caw-winner-ais-track-glow",
        spec: {
            id: "caw-winner-ais-track-glow",
            type: "line",
            source: "caw-winner-ais-track",
            paint: {
                "line-color": "#F59E0B",
                "line-width": 7.0,
                "line-opacity": 0.25,
                "line-blur": 2.5,
            },
            layout: {
                "line-join": "round",
                "line-cap": "round",
            },
        },
    },
    {
        id: "caw-winner-ais-track-line",
        spec: {
            id: "caw-winner-ais-track-line",
            type: "line",
            source: "caw-winner-ais-track",
            paint: {
                "line-color": "#F59E0B",
                "line-width": 3.5,
                "line-opacity": 0.98,
            },
            layout: {
                "line-join": "round",
                "line-cap": "round",
            },
        },
    },
    // CAW WINNER ORIGIN LINK (dashed link connecting hindcast origin to closest historical AIS waypoint)
    {
        id: "caw-winner-origin-link",
        spec: {
            id: "caw-winner-origin-link",
            type: "line",
            source: "caw-winner-origin-link",
            paint: {
                "line-color": "#f97316",
                "line-width": 2.0,
                "line-dasharray": [3, 2],
                "line-opacity": 0.85,
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
                "circle-radius": 2.8,
                "circle-opacity": 1.0,
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 1.0,
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
                "circle-radius": 3.5,
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 1.2,
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
                "circle-color": "#3b82f6",
                "circle-radius": 3.8,
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 1.2,
                "circle-opacity": 1.0,
            },
        },
    },

    // DEDICATED FORECAST FORWARD SIMULATION ANIMATION LAYERS
    {
        id: "forecast-target-lock",
        spec: {
            id: "forecast-target-lock",
            type: "circle",
            source: "forecast-target-lock",
            paint: {
                "circle-color": "transparent",
                "circle-radius": ["coalesce", ["get", "radius"], 10],
                "circle-stroke-color": "#06b6d4",
                "circle-stroke-width": 1.8,
                "circle-stroke-opacity": ["coalesce", ["get", "opacity"], 0.85],
            },
        },
    },
    {
        id: "forecast-animation-envelope-fill",
        spec: {
            id: "forecast-animation-envelope-fill",
            type: "fill",
            source: "forecast-animation-envelope",
            paint: {
                "fill-color": "#06b6d4",
                "fill-opacity": ["coalesce", ["get", "opacity"], 0.12],
            },
        },
    },
    {
        id: "forecast-animation-envelope-outline",
        spec: {
            id: "forecast-animation-envelope-outline",
            type: "line",
            source: "forecast-animation-envelope",
            paint: {
                "line-color": "#06b6d4",
                "line-width": 1.5,
                "line-opacity": ["coalesce", ["get", "opacity"], 0.8],
                "line-dasharray": [3, 2],
            },
        },
    },
    {
        id: "forecast-animation-glow",
        spec: {
            id: "forecast-animation-glow",
            type: "line",
            source: "forecast-animation-trace",
            paint: {
                "line-color": "#06b6d4",
                "line-width": 6.0,
                "line-blur": 3.0,
                "line-opacity": ["coalesce", ["get", "opacity"], 0.35],
            },
            layout: {
                "line-join": "round",
                "line-cap": "round",
            },
        },
    },
    {
        id: "forecast-animation-trace",
        spec: {
            id: "forecast-animation-trace",
            type: "line",
            source: "forecast-animation-trace",
            paint: {
                "line-color": "#22d4ee",
                "line-width": 2.6,
                "line-opacity": ["coalesce", ["get", "opacity"], 0.95],
            },
            layout: {
                "line-join": "round",
                "line-cap": "round",
            },
        },
    },
    {
        id: "forecast-animation-trail",
        spec: {
            id: "forecast-animation-trail",
            type: "line",
            source: "forecast-animation-trail",
            paint: {
                "line-color": "#67e8f9",
                "line-width": 3.8,
                "line-opacity": 0.85,
                "line-blur": 1.5,
            },
            layout: {
                "line-join": "round",
                "line-cap": "round",
            },
        },
    },
    {
        id: "forecast-animation-probe",
        spec: {
            id: "forecast-animation-probe",
            type: "circle",
            source: "forecast-animation-probe",
            paint: {
                "circle-color": "#ffffff",
                "circle-radius": 4.5,
                "circle-stroke-color": "#06b6d4",
                "circle-stroke-width": 2.5,
                "circle-opacity": ["coalesce", ["get", "opacity"], 1.0],
                "circle-stroke-opacity": ["coalesce", ["get", "opacity"], 1.0],
            },
        },
    },
    {
        id: "forecast-animation-endpoint",
        spec: {
            id: "forecast-animation-endpoint",
            type: "circle",
            source: "forecast-animation-endpoint",
            paint: {
                "circle-color": "transparent",
                "circle-radius": ["coalesce", ["get", "radius"], 10],
                "circle-stroke-color": "#22d4ee",
                "circle-stroke-width": 2.0,
                "circle-stroke-opacity": ["coalesce", ["get", "opacity"], 0.9],
            },
        },
    },
];

const ALL_SOURCE_IDS = [
    "graticule",
    "region",
    "spill-contours",
    "spill-centroid",
    "hindcast-trajectory",
    "hindcast-backtrack-trace",
    "hindcast-backtrack-trail",
    "hindcast-backtrack-probe",
    "hindcast-origin-pulse",
    "detection-target-lock",
    "forecast-trajectory",
    "forecast-envelope",
    "forecast-target-lock",
    "forecast-animation-trace",
    "forecast-animation-trail",
    "forecast-animation-probe",
    "forecast-animation-endpoint",
    "forecast-animation-envelope",
    "ais-vessel-tracks",
    "ais-vessel-markers",
    "caw-investigation-hooks",
    "caw-winner-ais-track",
    "caw-winner-origin-link",
    "caw-winner-trajectory",
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
    hindcastRun = 0,
    forecastRun = 0,
    identified = false,
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
    const hindcastTelemetryMarkerRef = useRef<maplibregl.Marker | null>(null);
    const forecastTelemetryMarkerRef = useRef<maplibregl.Marker | null>(null);
    const forecastTimeMarkersRef = useRef<maplibregl.Marker[]>([]);

    const [region, setRegion] = useState<RegionRecord | null>(null);
    const [spillId, setSpillId] = useState<number | null>(null);
    const [loadError, setLoadError] = useState(false);
    const aisAnimationRef = useRef<{
        animatedRunId: number | null;
        timerId: number | null;
        frameId: number | null;
    }>({ animatedRunId: null, timerId: null, frameId: null });
    const hindcastAnimationRef = useRef<{
        frameId: number | null;
        currentTab: string | null;
        animatedRunId: number | null;
        completed: boolean;
    }>({ frameId: null, currentTab: null, animatedRunId: null, completed: false });
    const forecastAnimationRef = useRef<{
        frameId: number | null;
        currentTab: string | null;
        animatedRunId: number | null;
        completed: boolean;
    }>({ frameId: null, currentTab: null, animatedRunId: null, completed: false });
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
            if (hindcastAnimationRef.current.frameId !== null) {
                cancelAnimationFrame(hindcastAnimationRef.current.frameId);
                hindcastAnimationRef.current.frameId = null;
            }
            if (forecastAnimationRef.current.frameId !== null) {
                cancelAnimationFrame(forecastAnimationRef.current.frameId);
                forecastAnimationRef.current.frameId = null;
            }
            originMarkerRef.current?.remove();
            winnerMarkerRef.current?.remove();
            abstainMarkerRef.current?.remove();
            forecastMarkerRef.current?.remove();
            hindcastTelemetryMarkerRef.current?.remove();
            forecastTelemetryMarkerRef.current?.remove();
            forecastTimeMarkersRef.current.forEach((m) => m.remove());
            forecastTimeMarkersRef.current = [];
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
                : [75.7667, 9.5000];

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
                    : [76.11601396304701, 9.306876624999012];

            console.log("HINDCAST ORIGIN", {
                lon: hindcastOriginLonLat[0],
                lat: hindcastOriginLonLat[1],
            });

            const forecastCentroidLonLat: [number, number] = analysis
                ? [analysis.forward_forecast_centroid_lonlat.lon, analysis.forward_forecast_centroid_lonlat.lat]
                : [75.85, 8.45];

            // 1. Spill Natural Irregular Footprint data (Preserves authoritative centroid & area)
            const contourData = generateSpillContours(
                spillCentroidLonLat,
                analysis?.detection.physical_area_km2
            );
            const centroidData = asFeatureCollection({ type: "Point", coordinates: spillCentroidLonLat }, {});

            // 2. Hindcast trajectory data (Origin -> Spill centroid)
            const hindcastWaterSegs = clipTrackToWater([hindcastOriginLonLat, spillCentroidLonLat]);
            const hindcastTrajectoryData: FeatureCollection = {
                type: "FeatureCollection",
                features: hindcastWaterSegs.map((coords) => ({
                    type: "Feature",
                    geometry: {
                        type: "LineString",
                        coordinates: coords,
                    },
                    properties: { name: "Hindcast Origin to Spill Trajectory" },
                })),
            };

            // 3. Forecast trajectory & envelope
            const forecastWaterSegs = clipTrackToWater([spillCentroidLonLat, forecastCentroidLonLat]);
            const forecastTrajectoryData: FeatureCollection = {
                type: "FeatureCollection",
                features: forecastWaterSegs.map((coords) => ({
                    type: "Feature",
                    geometry: {
                        type: "LineString",
                        coordinates: coords,
                    },
                    properties: {},
                })),
            };
            const forecastEnvelopeData: FeatureCollection = analysis?.uncertainty_envelope
                ? (analysis.uncertainty_envelope.type === "FeatureCollection"
                    ? (analysis.uncertainty_envelope as FeatureCollection)
                    : asFeatureCollection(analysis.uncertainty_envelope as any, {}))
                : emptyCollection;

            // 4. AIS tracks & directional markers
            const aisTrackData: FeatureCollection = {
                type: "FeatureCollection",
                features: aisTracks
                    .filter((track) => track.points.length > 1)
                    .flatMap((track) => {
                        const suspect = suspects?.find((s) => s.vessel_id === track.vesselId);
                        const score = suspect?.overall_score ?? 0;
                        const normScore = score > 1 ? score / 100 : score;
                        const isHighScoring = normScore > 0.05;
                        const isHighlighted = track.vesselId === highlightedVesselId;

                        const rawSmoothed = getSmoothedAisCoordinates(track.points);
                        const { waterSegments, rawPointCount, renderedSegmentCount, removedLandSegments } = clipTrackToWaterWithStats(rawSmoothed);

                        console.log("LAND MASK", {
                            trackId: track.vesselId,
                            rawPointCount,
                            renderedSegmentCount,
                            removedLandSegments,
                        });

                        const clippedPointCount = waterSegments.reduce((sum, seg) => sum + seg.length, 0);
                        const firstRenderedPoint = waterSegments[0]?.[0] ?? null;
                        const lastRenderedPoint = waterSegments[waterSegments.length - 1]?.[waterSegments[waterSegments.length - 1]?.length - 1] ?? null;

                        console.log("AIS DISPLAY CHECK", {
                            trackId: track.vesselId,
                            rawPointCount,
                            clippedPointCount,
                            segmentCount: renderedSegmentCount,
                            firstRenderedPoint,
                            lastRenderedPoint,
                        });

                        return waterSegments.map((segment) => ({
                            type: "Feature" as const,
                            geometry: {
                                type: "LineString" as const,
                                coordinates: segment,
                            },
                            properties: {
                                vesselId: track.vesselId,
                                vesselName: track.vesselName,
                                isSuspect: Boolean(suspect),
                                isHighScoring,
                                isHighlighted,
                                score: normScore,
                            },
                        }));
                    }),
            };

            const aisMarkerData: FeatureCollection = {
                type: "FeatureCollection",
                features: aisTracks
                    .filter((track) => track.points.length > 0)
                    .flatMap((track) => {
                        const rawSmoothed = getSmoothedAisCoordinates(track.points);
                        const waterSegments = clipTrackToWater(rawSmoothed);
                        if (waterSegments.length === 0) return [];
                        const lastSeg = waterSegments[waterSegments.length - 1];
                        const lastPt = lastSeg[lastSeg.length - 1];
                        const point = track.points[track.points.length - 1];
                        return [
                            {
                                type: "Feature",
                                geometry: { type: "Point", coordinates: lastPt },
                                properties: {
                                    vesselId: track.vesselId,
                                    vesselName: track.vesselName,
                                    vesselType: track.vesselType ?? "Cargo",
                                    flag: track.flag ?? "Panama",
                                    speedKnots: point.speed_knots ?? 14.2,
                                    courseDegrees: point.course_degrees ?? 135,
                                },
                            },
                        ];
                    }),
            };

            // Phase 2: Progressive growth from origin to latest positions
            const generateGrowingHookFeatures = (growthProgress: number): FeatureCollection => {
                const validTracks = aisTracks.filter((track) => track.points.length > 0);
                const features: Feature[] = validTracks.flatMap((track, idx) => {
                    const targetPt = track.points[track.points.length - 1];
                    const p0 = hindcastOriginLonLat;
                    const p2: [number, number] = [targetPt.longitude, targetPt.latitude];
                    const p1 = generateHookControlPoint(p0, p2, idx);
                    const coords = sampleBezierCurve(p0, p1, p2, growthProgress);
                    const waterSegments = clipTrackToWater(coords);
                    return waterSegments.map((segment) => ({
                        type: "Feature",
                        geometry: {
                            type: "LineString",
                            coordinates: segment,
                        },
                        properties: {
                            vesselId: track.vesselId,
                            vesselName: track.vesselName,
                            opacity: 0.7,
                        },
                    }));
                });
                return { type: "FeatureCollection", features };
            };

            // Phase 3: Trajectory probing along historical AIS waypoints (2 back-and-forth cycles)
            const generateProbingHookFeatures = (p3Progress: number): FeatureCollection => {
                const validTracks = aisTracks.filter((track) => track.points.length > 0);
                const features: Feature[] = validTracks.flatMap((track, idx) => {
                    const isWinner = track.vesselId === winningVesselId;
                    // Winner probes deeper into historical track (~65%), normal candidates probe ~38-48%
                    const depthFraction = isWinner ? 0.65 : (0.38 + ((idx * 3) % 5) * 0.025);

                    // Deterministic stagger: 0–150ms offset range
                    const staggerMs = (idx * 37) % 150;
                    const vesselEffectiveDuration = Math.max(1, 800 - staggerMs);
                    const vesselElapsed = p3Progress * 800 - staggerMs;
                    const tau = Math.max(0, Math.min(1, vesselElapsed / vesselEffectiveDuration));
                    const w = getTwoCycleWeight(tau);

                    const probeCoord = getProbeCoordinate(track.points, w * depthFraction);
                    const p0 = hindcastOriginLonLat;
                    const p2 = probeCoord;
                    const p1 = generateHookControlPoint(p0, p2, idx);
                    const coords = sampleBezierCurve(p0, p1, p2, 1.0);
                    const waterSegments = clipTrackToWater(coords);

                    // Fade low-alpha candidates from 0.7 -> ~0.15; strong candidates stay near ~0.7
                    const suspect = suspects?.find((s) => s.vessel_id === track.vesselId);
                    const score = suspect?.overall_score ?? 0;
                    const normScore = score > 1 ? score / 100 : score;
                    const isLowAlpha = normScore < 0.01;
                    const targetOpacity = isLowAlpha ? 0.15 : (0.60 + Math.min(normScore, 1) * 0.10);
                    const hookOpacity = 0.7 - p3Progress * (0.7 - targetOpacity);

                    return waterSegments.map((segment) => ({
                        type: "Feature",
                        geometry: {
                            type: "LineString",
                            coordinates: segment,
                        },
                        properties: {
                            vesselId: track.vesselId,
                            vesselName: track.vesselName,
                            opacity: hookOpacity,
                        },
                    }));
                });
                return { type: "FeatureCollection", features };
            };

            const setSource = (id: string, data: FeatureCollection) => {
                const source = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
                if (!source) return;

                if ([
                    "ais-vessel-tracks",
                    "caw-investigation-hooks",
                    "caw-winner-ais-track",
                    "caw-winner-origin-link",
                    "forecast-trajectory",
                    "hindcast-trajectory",
                ].includes(id)) {
                    data.features.forEach((feat, idx) => {
                        if (!validateWaterOnlyGeometry(feat.geometry as any)) {
                            console.warn("LAND MASK VIOLATION", {
                                sourceId: id,
                                featureIndex: idx,
                            });
                        }
                    });

                    console.log("RENDER GEOMETRY", {
                        sourceId: id,
                        layerType: "line",
                        featureCount: data.features.length,
                        geometryTypes: [...new Set(data.features.map((f) => f.geometry.type))],
                        sampleCoordinates: data.features[0]?.geometry && "coordinates" in data.features[0].geometry
                            ? (data.features[0].geometry as any).coordinates?.slice?.(0, 2)
                            : null,
                    });
                }

                source.setData(data);
            };

            setSource("region", regionData);
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

            // Spill contours visibility
            if (map.getLayer("spill-contours-fill")) {
                const spillVis = layerVisibility?.spill !== false ? "visible" : "none";
                map.setLayoutProperty("spill-contours-fill", "visibility", spillVis);
                map.setLayoutProperty("spill-contours-line", "visibility", spillVis);
                map.setLayoutProperty("spill-centroid-glow", "visibility", spillVis);
            }

            // Hindcast trajectory visibility: static line on Overview; dedicated dynamic backtrack on Hindcast
            if (map.getLayer("hindcast-trajectory-line")) {
                map.setLayoutProperty(
                    "hindcast-trajectory-line",
                    "visibility",
                    investigationTab === "Overview" && layerVisibility?.hindcast !== false ? "visible" : "none"
                );
            }

            // Forecast visibility: static line/envelope on Overview; dedicated dynamic forward simulation on Forecast tab
            if (map.getLayer("forecast-envelope-fill")) {
                const fcastVis = investigationTab === "Overview" && layerVisibility?.forecast !== false ? "visible" : "none";
                map.setLayoutProperty("forecast-envelope-fill", "visibility", fcastVis);
                map.setLayoutProperty("forecast-envelope-outline", "visibility", fcastVis);
                map.setLayoutProperty("forecast-trajectory-line", "visibility", fcastVis);
            }

            // --- AIS Identification Animation: Phase 1, Phase 2 & Phase 3 ---
            const showAisTracks = showAis && layerVisibility?.ais !== false;
            const aisTrackVis = showAisTracks ? "visible" : "none";
            const currentRun = identifyRun ?? 0;

            if (map.getLayer("ais-vessel-tracks-winner")) {
                map.setLayoutProperty("ais-vessel-tracks-winner", "visibility", "none");
            }
            if (map.getLayer("ais-vessel-tracks-glow")) {
                map.setLayoutProperty("ais-vessel-tracks-glow", "visibility", "none");
            }

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

            const updateWinnerCallout = (targetLonLat: [number, number], mmsi: number) => {
                if (!winnerMarkerRef.current) {
                    const el = document.createElement("div");
                    el.className = "pointer-events-none select-none relative";
                    el.style.opacity = "0";
                    el.style.transition = "opacity 180ms ease-out";
                    el.style.width = "0px";
                    el.style.height = "0px";
                    el.innerHTML = `
                        <div style="position: absolute; left: 0px; top: 0px; transform: translate(-50%, -50%);" class="flex items-center justify-center w-6 h-6 pointer-events-none">
                            <div class="absolute inset-0 rounded-full border-2 border-[#f59e0b]/70 animate-ping opacity-75"></div>
                            <div class="w-3.5 h-3.5 rounded-full bg-[#f59e0b] border-2 border-white shadow-[0_0_10px_rgba(245,158,11,0.95)]"></div>
                        </div>
                        <div style="position: absolute; left: 16px; top: 0px; transform: translateY(-50%); white-space: nowrap;" class="bg-[#050f1d]/95 border border-[#f59e0b]/60 rounded-md px-2.5 py-1 shadow-2xl backdrop-blur-md pointer-events-none">
                            <div class="text-[9px] font-bold text-[#f59e0b] tracking-wider uppercase leading-tight">Winner Vessel</div>
                            <div class="text-[10px] font-mono font-semibold text-[#fef3c7] leading-tight">MMSI ${mmsi}</div>
                        </div>
                    `;
                    winnerMarkerRef.current = new maplibregl.Marker({
                        element: el,
                        anchor: "center",
                    })
                        .setLngLat(targetLonLat)
                        .addTo(map);

                    requestAnimationFrame(() => {
                        el.style.opacity = "1";
                    });
                } else {
                    winnerMarkerRef.current.setLngLat(targetLonLat);
                    const el = winnerMarkerRef.current.getElement();
                    if (el) el.style.opacity = "1";
                }
            };

            const updateWinnerTrajectorySource = (waterSegments: [number, number][] | [number, number][][]) => {
                let segments: [number, number][][];
                if (!waterSegments || waterSegments.length === 0) {
                    segments = [];
                } else if (typeof waterSegments[0][0] === "number") {
                    segments = [waterSegments as [number, number][]];
                } else {
                    segments = waterSegments as [number, number][][];
                }
                console.log("WINNER SOURCE UPDATE", {
                    exists: !!map.getSource("caw-winner-ais-track"),
                    segmentCount: segments.length,
                    totalCoordinates: segments.reduce((sum, s) => sum + s.length, 0),
                });
                setSource("caw-winner-ais-track", {
                    type: "FeatureCollection",
                    features: segments.map((coords) => ({
                        type: "Feature",
                        geometry: {
                            type: "LineString",
                            coordinates: coords,
                        },
                        properties: {},
                    })),
                });
            };

            const updateWinnerOriginLinkSource = (coordinates: [number, number][]) => {
                const waterSegments = coordinates.length >= 2 ? clipTrackToWater(coordinates) : [];
                setSource("caw-winner-origin-link", {
                    type: "FeatureCollection",
                    features: waterSegments.map((coords) => ({
                        type: "Feature",
                        geometry: {
                            type: "LineString",
                            coordinates: coords,
                        },
                        properties: {},
                    })),
                });
            };

            const setWinnerTrajectoryVisibility = (visible: boolean, color: string = "#F59E0B") => {
                const vis = visible ? "visible" : "none";
                if (map.getLayer("caw-winner-ais-track-line")) {
                    map.setLayoutProperty("caw-winner-ais-track-line", "visibility", vis);
                    map.setPaintProperty("caw-winner-ais-track-line", "line-color", color);
                    map.setPaintProperty("caw-winner-ais-track-line", "line-opacity", visible ? 0.98 : 0);
                }
                if (map.getLayer("caw-winner-ais-track-glow")) {
                    map.setLayoutProperty("caw-winner-ais-track-glow", "visibility", vis);
                    map.setPaintProperty("caw-winner-ais-track-glow", "line-color", color);
                    map.setPaintProperty("caw-winner-ais-track-glow", "line-opacity", visible ? 0.25 : 0);
                }
                if (map.getLayer("caw-winner-origin-link")) {
                    map.setLayoutProperty("caw-winner-origin-link", "visibility", vis);
                }
            };

            if (isIdentifying) {
                // Identification request in flight: cancel running animation & reset state
                if (aisAnimationRef.current.timerId !== null) {
                    window.clearTimeout(aisAnimationRef.current.timerId);
                    aisAnimationRef.current.timerId = null;
                }
                if (aisAnimationRef.current.frameId !== null) {
                    cancelAnimationFrame(aisAnimationRef.current.frameId);
                    aisAnimationRef.current.frameId = null;
                }
                aisAnimationRef.current.animatedRunId = null;

                // Clear previous overlays & investigation hooks
                setSource("caw-winner-ais-track", emptyCollection);
                setSource("caw-winner-origin-link", emptyCollection);
                setSource("caw-winner-trajectory", emptyCollection);
                setSource("caw-winner-marker", emptyCollection);
                setSource("caw-investigation-hooks", emptyCollection);
                if (map.getLayer("caw-investigation-hooks")) {
                    map.setLayoutProperty("caw-investigation-hooks", "visibility", "none");
                }
                setWinnerTrajectoryVisibility(false);
                if (map.getLayer("caw-winner-waypoints")) {
                    map.setLayoutProperty("caw-winner-waypoints", "visibility", "none");
                    map.setPaintProperty("caw-winner-waypoints", "circle-radius", 2.8);
                }
                winnerMarkerRef.current?.remove();
                winnerMarkerRef.current = null;
                abstainMarkerRef.current?.remove();
                abstainMarkerRef.current = null;

                if (map.getLayer("ais-vessel-tracks")) {
                    map.setLayoutProperty("ais-vessel-tracks", "visibility", "none");
                    map.setPaintProperty("ais-vessel-tracks", "line-opacity", 0);
                }
                if (map.getLayer("ais-vessel-markers")) {
                    map.setLayoutProperty("ais-vessel-markers", "visibility", "none");
                    map.setPaintProperty("ais-vessel-markers", "circle-opacity", 0);
                    map.setPaintProperty("ais-vessel-markers", "circle-stroke-opacity", 0);
                }
            } else if (identified) {
                const currentRun = identifyRun ?? 0;
                const isNewRun = aisAnimationRef.current.animatedRunId !== currentRun;

                const validTracks = aisTracks.filter((track) => track.points.length > 0);
                const winningTrack = aisTracks.find((track) => track.vesselId === winningVesselId) ?? validTracks[0];
                const winningLastFix = winningTrack?.points[winningTrack.points.length - 1];
                const p0 = hindcastOriginLonLat;
                const goldColor = decision === "REFINE_GRID" ? "#eab308" : "#F59E0B";

                if (isNewRun) {
                    // New identification run: cancel any existing animation
                    if (aisAnimationRef.current.timerId !== null) {
                        window.clearTimeout(aisAnimationRef.current.timerId);
                        aisAnimationRef.current.timerId = null;
                    }
                    if (aisAnimationRef.current.frameId !== null) {
                        cancelAnimationFrame(aisAnimationRef.current.frameId);
                        aisAnimationRef.current.frameId = null;
                    }

                    aisAnimationRef.current.animatedRunId = currentRun;

                    // Clear overlays initially for new run
                    setSource("caw-winner-ais-track", emptyCollection);
                    setSource("caw-winner-origin-link", emptyCollection);
                    setSource("caw-winner-trajectory", emptyCollection);
                    setSource("caw-winner-marker", emptyCollection);
                    setSource("caw-investigation-hooks", emptyCollection);
                    setWinnerTrajectoryVisibility(false);
                    if (map.getLayer("caw-winner-waypoints")) {
                        map.setLayoutProperty("caw-winner-waypoints", "visibility", "none");
                        map.setPaintProperty("caw-winner-waypoints", "circle-radius", 2.8);
                    }
                    winnerMarkerRef.current?.remove();
                    winnerMarkerRef.current = null;
                    abstainMarkerRef.current?.remove();
                    abstainMarkerRef.current = null;

                    if (map.getLayer("caw-investigation-hooks")) {
                        map.setLayoutProperty("caw-investigation-hooks", "visibility", aisTrackVis);
                    }

                    // Ensure both layers are visible and include all 20 vessels
                    if (map.getLayer("ais-vessel-tracks")) {
                        map.setLayoutProperty("ais-vessel-tracks", "visibility", aisTrackVis);
                        map.setFilter("ais-vessel-tracks", ["has", "vesselId"]);
                        map.setPaintProperty("ais-vessel-tracks", "line-opacity", 0);
                    }
                    if (map.getLayer("ais-vessel-markers")) {
                        map.setLayoutProperty("ais-vessel-markers", "visibility", aisTrackVis);
                        map.setPaintProperty("ais-vessel-markers", "circle-opacity", 0);
                        map.setPaintProperty("ais-vessel-markers", "circle-stroke-opacity", 0);
                    }

                    // Reset hooks source before starting
                    setSource("caw-investigation-hooks", emptyCollection);

                    // Phase 1 (T=0 to T=300ms): Smoothly fade in all 20 vessel trajectories & markers from opacity 0 -> 1
                    const fadeDurationMs = 300;
                    const startFadeTime = performance.now();

                    const fadeStep = (fadeNow: number) => {
                        const fadeElapsed = fadeNow - startFadeTime;
                        const progress = Math.min(fadeElapsed / fadeDurationMs, 1);

                        if (map.getLayer("ais-vessel-tracks")) {
                            map.setPaintProperty("ais-vessel-tracks", "line-opacity", progress * 0.6);
                        }
                        if (map.getLayer("ais-vessel-markers")) {
                            map.setPaintProperty("ais-vessel-markers", "circle-opacity", progress * 1.0);
                            map.setPaintProperty("ais-vessel-markers", "circle-stroke-opacity", progress * 0.85);
                        }

                        if (progress < 1) {
                            aisAnimationRef.current.frameId = requestAnimationFrame(fadeStep);
                        } else {
                            // Phase 1 complete: Lock opacities and launch Phase 2 (20 curved grey investigation hooks grow from origin)
                            if (map.getLayer("ais-vessel-tracks")) {
                                map.setPaintProperty("ais-vessel-tracks", "line-opacity", 0.6);
                            }
                            if (map.getLayer("ais-vessel-markers")) {
                                map.setPaintProperty("ais-vessel-markers", "circle-opacity", 1.0);
                                map.setPaintProperty("ais-vessel-markers", "circle-stroke-opacity", 0.85);
                            }

                            // Phase 2 (T=300ms to T=600ms): Grow 20 curved grey hooks from origin to vessels over ~300ms
                            const hookDurationMs = 300;
                            const startHookTime = performance.now();

                            const hookStep = (hookNow: number) => {
                                const hookElapsed = hookNow - startHookTime;
                                const hookProgress = Math.min(hookElapsed / hookDurationMs, 1);

                                setSource("caw-investigation-hooks", generateGrowingHookFeatures(hookProgress));

                                if (hookProgress < 1) {
                                    aisAnimationRef.current.frameId = requestAnimationFrame(hookStep);
                                } else {
                                    // Phase 2 complete: Launch Phase 3 (20 curved grey hooks probe vessel trajectories over ~800ms)
                                    const probeDurationMs = 800;
                                    const startProbeTime = performance.now();

                                    const probeStep = (probeNow: number) => {
                                        const probeElapsed = probeNow - startProbeTime;
                                        const p3Progress = Math.min(probeElapsed / probeDurationMs, 1);

                                        setSource("caw-investigation-hooks", generateProbingHookFeatures(p3Progress));

                                        if (p3Progress < 1) {
                                            aisAnimationRef.current.frameId = requestAnimationFrame(probeStep);
                                        } else {
                                            // Phase 3 complete! Settle all hooks at latest positions
                                            if (decision === "ABSTAIN" || !winningLastFix) {
                                                // ABSTAIN: Skip Phase 4 & 5. Fade all 20 hooks to ~0.08 over 400ms, then show neutral abstention marker
                                                const abstainDuration = 400;
                                                const startAbstainTime = performance.now();

                                                const abstainStep = (abstainNow: number) => {
                                                    const aElapsed = abstainNow - startAbstainTime;
                                                    const aProg = Math.min(aElapsed / abstainDuration, 1);
                                                    const aEase = easeInOutQuad(aProg);

                                                    const features: Feature[] = validTracks.flatMap((track, idx) => {
                                                        const targetPt = track.points[track.points.length - 1];
                                                        const p2: [number, number] = [targetPt.longitude, targetPt.latitude];
                                                        const p1 = generateHookControlPoint(p0, p2, idx);
                                                        const coords = sampleBezierCurve(p0, p1, p2, 1.0);
                                                        const waterSegments = clipTrackToWater(coords);
                                                        const suspect = suspects?.find((s) => s.vessel_id === track.vesselId);
                                                        const score = suspect?.overall_score ?? 0;
                                                        const normScore = score > 1 ? score / 100 : score;
                                                        const startOpacity = normScore < 0.01 ? 0.15 : 0.7;
                                                        const opacity = startOpacity - aEase * (startOpacity - 0.08);

                                                        return waterSegments.map((segment) => ({
                                                            type: "Feature",
                                                            geometry: { type: "LineString", coordinates: segment },
                                                            properties: { vesselId: track.vesselId, vesselName: track.vesselName, opacity },
                                                        }));
                                                    });

                                                    setSource("caw-investigation-hooks", { type: "FeatureCollection", features });

                                                    if (aProg < 1) {
                                                        aisAnimationRef.current.frameId = requestAnimationFrame(abstainStep);
                                                    } else {
                                                        aisAnimationRef.current.frameId = null;
                                                        updateAbstainCallout();
                                                    }
                                                };

                                                aisAnimationRef.current.frameId = requestAnimationFrame(abstainStep);
                                            } else {
                                                // COMMIT or REFINE_GRID: Launch Phase 4 (Convergence ~550ms)
                                                const p4DurationMs = 550;
                                                const startP4Time = performance.now();

                                                const p4Step = (p4Now: number) => {
                                                    const p4Elapsed = p4Now - startP4Time;
                                                    const p4Prog = Math.min(p4Elapsed / p4DurationMs, 1);
                                                    const p4Ease = easeInOutQuad(p4Prog);

                                                    const features: Feature[] = validTracks.flatMap((track, idx) => {
                                                        const isWin = track.vesselId === winningTrack.vesselId;
                                                        const targetPt = track.points[track.points.length - 1];
                                                        const p2: [number, number] = [targetPt.longitude, targetPt.latitude];

                                                        if (isWin) {
                                                            const naturalP1 = generateHookControlPoint(p0, p2, idx);
                                                            const mid: [number, number] = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2];
                                                            const currentP1: [number, number] = [
                                                                naturalP1[0] + p4Ease * (mid[0] - naturalP1[0]),
                                                                naturalP1[1] + p4Ease * (mid[1] - naturalP1[1]),
                                                            ];
                                                            const coords = sampleBezierCurve(p0, currentP1, p2, 1.0);
                                                            const waterSegments = clipTrackToWater(coords);
                                                            const opacity = 0.70 + p4Ease * 0.25;

                                                            return waterSegments.map((segment) => ({
                                                                type: "Feature",
                                                                geometry: { type: "LineString", coordinates: segment },
                                                                properties: { vesselId: track.vesselId, vesselName: track.vesselName, opacity },
                                                            }));
                                                        } else {
                                                            const suspect = suspects?.find((s) => s.vessel_id === track.vesselId);
                                                            const score = suspect?.overall_score ?? 0;
                                                            const normScore = score > 1 ? score / 100 : score;
                                                            const isLowAlpha = normScore < 0.01;
                                                            const startOp = isLowAlpha ? 0.15 : (0.60 + Math.min(normScore, 1) * 0.10);
                                                            const currentOp = Math.max(0.08, startOp - p4Ease * (startOp - 0.08));

                                                            const p1 = generateHookControlPoint(p0, p2, idx);
                                                            const coords = sampleBezierCurve(p0, p1, p2, 1.0);
                                                            const waterSegments = clipTrackToWater(coords);
                                                            return waterSegments.map((segment) => ({
                                                                type: "Feature",
                                                                geometry: { type: "LineString", coordinates: segment },
                                                                properties: { vesselId: track.vesselId, vesselName: track.vesselName, opacity: currentOp },
                                                            }));
                                                        }
                                                    });

                                                    setSource("caw-investigation-hooks", { type: "FeatureCollection", features });

                                                    if (p4Prog < 1) {
                                                        aisAnimationRef.current.frameId = requestAnimationFrame(p4Step);
                                                    } else {
                                                        // Phase 4 complete! Launch Phase 5 (Gold Lock-In)
                                                        const nonWinningFeatures: Feature[] = validTracks
                                                            .filter((track) => track.vesselId !== winningTrack.vesselId)
                                                            .flatMap((track, idx) => {
                                                                const targetPt = track.points[track.points.length - 1];
                                                                const p2: [number, number] = [targetPt.longitude, targetPt.latitude];
                                                                const p1 = generateHookControlPoint(p0, p2, idx);
                                                                const coords = sampleBezierCurve(p0, p1, p2, 1.0);
                                                                const waterSegments = clipTrackToWater(coords);
                                                                return waterSegments.map((segment) => ({
                                                                    type: "Feature" as const,
                                                                    geometry: { type: "LineString" as const, coordinates: segment },
                                                                    properties: { vesselId: track.vesselId, vesselName: track.vesselName, opacity: 0.08 },
                                                                }));
                                                            });
                                                        setSource("caw-investigation-hooks", { type: "FeatureCollection", features: nonWinningFeatures });

                                                        // 1. Winning vessel AIS track matching existing blue track clipped to water
                                                        const existingWinnerTrackCoordinates = getSmoothedAisCoordinates(winningTrack.points);
                                                        const { waterSegments: winnerWaterSegments, rawPointCount, renderedSegmentCount, removedLandSegments } = clipTrackToWaterWithStats(existingWinnerTrackCoordinates);
                                                        const winnerMmsi = winningTrack.vesselId;

                                                        console.log("WINNER LAND MASK", {
                                                            winnerMmsi,
                                                            rawPointCount,
                                                            renderedSegmentCount,
                                                            removedLandSegments,
                                                        });

                                                        const winnerCoordinates = winnerWaterSegments.length > 0
                                                            ? winnerWaterSegments[winnerWaterSegments.length - 1]
                                                            : existingWinnerTrackCoordinates;
                                                        const winnerEndpoint = winningTrack.points[winningTrack.points.length - 1];
                                                        const winnerDisplayLonLat: [number, number] = [winnerEndpoint.longitude, winnerEndpoint.latitude];

                                                        console.log("WINNER DISPLAY COORDINATE", {
                                                            winnerMmsi,
                                                            marker: winnerEndpoint,
                                                            trajectoryEnd: winnerCoordinates[winnerCoordinates.length - 1],
                                                        });

                                                        console.log("WINNER AIS TRACK", {
                                                            winnerMmsi,
                                                            trackPointCount: winningTrack?.points?.length,
                                                            firstPoint: winningTrack?.points?.[0],
                                                            lastPoint: winningTrack?.points?.[winningTrack.points.length - 1],
                                                        });
                                                        console.log("WINNER GOLD GEOMETRY", {
                                                            coordinateCount: winnerCoordinates.length,
                                                            first: winnerCoordinates[0],
                                                            last: winnerCoordinates[winnerCoordinates.length - 1],
                                                        });

                                                        let closestPt: [number, number] = winnerCoordinates[0] ?? [winningTrack.points[0].longitude, winningTrack.points[0].latitude];
                                                        let minDist = Infinity;
                                                        for (const p of winnerCoordinates) {
                                                            const d = Math.hypot(p[0] - p0[0], p[1] - p0[1]);
                                                            if (d < minDist) {
                                                                minDist = d;
                                                                closestPt = p;
                                                            }
                                                        }
                                                        const originLinkCoords: [number, number][] = [p0, closestPt];
                                                        updateWinnerOriginLinkSource(originLinkCoords);

                                                        const sampleWaypoints = sampleWaypointsAlongPath(winnerCoordinates, 8).filter((c) => isSea(c[1], c[0]));

                                                        // 2. Put winner line into caw-winner-ais-track and animate gold transition (~220ms)
                                                        updateWinnerTrajectorySource(winnerWaterSegments);
                                                        setWinnerTrajectoryVisibility(true, "#94a3b8");

                                                        const goldTransDuration = 220;
                                                        const startGoldTrans = performance.now();
                                                        const targetRGB = decision === "REFINE_GRID" ? [234, 179, 8] : [245, 158, 11];

                                                        const goldTransStep = (transNow: number) => {
                                                            const transElapsed = transNow - startGoldTrans;
                                                            const transProg = Math.min(transElapsed / goldTransDuration, 1);
                                                            const transEase = easeInOutQuad(transProg);

                                                            const r = Math.round(148 + transEase * (targetRGB[0] - 148));
                                                            const g = Math.round(163 + transEase * (targetRGB[1] - 163));
                                                            const b = Math.round(184 + transEase * (targetRGB[2] - 184));
                                                            const c = `rgb(${r}, ${g}, ${b})`;

                                                            setWinnerTrajectoryVisibility(true, c);

                                                            if (transProg < 1) {
                                                                aisAnimationRef.current.frameId = requestAnimationFrame(goldTransStep);
                                                            } else {
                                                                // Lock final gold color on layers
                                                                setWinnerTrajectoryVisibility(true, goldColor);
                                                                if (map.getLayer("caw-winner-waypoints")) {
                                                                    map.setLayoutProperty("caw-winner-waypoints", "visibility", "visible");
                                                                    map.setPaintProperty("caw-winner-waypoints", "circle-color", goldColor);
                                                                }

                                                                // 3. Winner Path Progressive Draw-On over ~850ms along historical trajectory
                                                                const drawDurationMs = 850;
                                                                const startDrawTime = performance.now();

                                                                const drawStep = (drawNow: number) => {
                                                                    const drawElapsed = drawNow - startDrawTime;
                                                                    const drawProg = Math.min(drawElapsed / drawDurationMs, 1);
                                                                    const drawEase = easeInOutQuad(drawProg);

                                                                    const { coords: currentPath, dots: currentDots } = getProgressivePathAndWaypoints(
                                                                        winnerCoordinates,
                                                                        sampleWaypoints,
                                                                        drawEase
                                                                    );

                                                                    updateWinnerTrajectorySource(currentPath);

                                                                    setSource("caw-winner-marker", {
                                                                        type: "FeatureCollection",
                                                                        features: currentDots.map((coord) => ({
                                                                            type: "Feature" as const,
                                                                            geometry: { type: "Point" as const, coordinates: coord },
                                                                            properties: {},
                                                                        })),
                                                                    });

                                                                    // Part 5: Winner lock-on pulse in final ~180ms of draw-on (drawProg >= 0.8)
                                                                    if (map.getLayer("caw-winner-waypoints")) {
                                                                        if (drawProg >= 0.8) {
                                                                            const lockProg = (drawProg - 0.8) / 0.2;
                                                                            const pulseRadius = 2.8 + 2.0 * Math.sin(Math.PI * lockProg);
                                                                            map.setPaintProperty("caw-winner-waypoints", "circle-radius", pulseRadius);
                                                                        } else {
                                                                            map.setPaintProperty("caw-winner-waypoints", "circle-radius", 2.8);
                                                                        }
                                                                    }

                                                                    if (drawProg < 1) {
                                                                        aisAnimationRef.current.frameId = requestAnimationFrame(drawStep);
                                                                    } else {
                                                                        if (map.getLayer("caw-winner-waypoints")) {
                                                                            map.setPaintProperty("caw-winner-waypoints", "circle-radius", 2.8);
                                                                        }

                                                                        // Settle final source data
                                                                        updateWinnerTrajectorySource(winnerWaterSegments);
                                                                        setSource("caw-winner-marker", {
                                                                            type: "FeatureCollection",
                                                                            features: sampleWaypoints.map((coord) => ({
                                                                                type: "Feature",
                                                                                geometry: { type: "Point", coordinates: coord },
                                                                                properties: {},
                                                                            })),
                                                                        });

                                                                        // Reveal Winner Label strictly AFTER draw completes
                                                                        updateWinnerCallout(winnerDisplayLonLat, winningTrack.vesselId);
                                                                        aisAnimationRef.current.frameId = null;
                                                                    }
                                                                };

                                                                aisAnimationRef.current.frameId = requestAnimationFrame(drawStep);
                                                            }
                                                        };

                                                        aisAnimationRef.current.frameId = requestAnimationFrame(goldTransStep);
                                                    }
                                                };

                                                aisAnimationRef.current.frameId = requestAnimationFrame(p4Step);
                                            }
                                        }
                                    };

                                    aisAnimationRef.current.frameId = requestAnimationFrame(probeStep);
                                }
                            };

                            aisAnimationRef.current.frameId = requestAnimationFrame(hookStep);
                        }
                    };

                    aisAnimationRef.current.frameId = requestAnimationFrame(fadeStep);
                } else if (aisAnimationRef.current.frameId === null) {
                    // Animation already completed for this run: ensure static winner trajectory and waypoints remain displayed!
                    if (map.getLayer("ais-vessel-tracks")) {
                        map.setLayoutProperty("ais-vessel-tracks", "visibility", aisTrackVis);
                        map.setFilter("ais-vessel-tracks", ["has", "vesselId"]);
                        map.setPaintProperty("ais-vessel-tracks", "line-opacity", 0.65);
                    }
                    if (map.getLayer("ais-vessel-markers")) {
                        map.setLayoutProperty("ais-vessel-markers", "visibility", aisTrackVis);
                        map.setPaintProperty("ais-vessel-markers", "circle-opacity", 1.0);
                        map.setPaintProperty("ais-vessel-markers", "circle-stroke-opacity", 0.85);
                    }

                    if (decision === "ABSTAIN" || !winningLastFix) {
                        const features: Feature[] = validTracks.flatMap((track, idx) => {
                            const targetPt = track.points[track.points.length - 1];
                            const p2: [number, number] = [targetPt.longitude, targetPt.latitude];
                            const p1 = generateHookControlPoint(p0, p2, idx);
                            const coords = sampleBezierCurve(p0, p1, p2, 1.0);
                            const waterSegments = clipTrackToWater(coords);
                            return waterSegments.map((segment) => ({
                                type: "Feature",
                                geometry: { type: "LineString", coordinates: segment },
                                properties: { vesselId: track.vesselId, vesselName: track.vesselName, opacity: 0.08 },
                            }));
                        });
                        setSource("caw-investigation-hooks", { type: "FeatureCollection", features });
                        setSource("caw-winner-ais-track", emptyCollection);
                        setSource("caw-winner-origin-link", emptyCollection);
                        setSource("caw-winner-trajectory", emptyCollection);
                        setSource("caw-winner-marker", emptyCollection);
                        setWinnerTrajectoryVisibility(false);
                        if (map.getLayer("caw-winner-waypoints")) {
                            map.setLayoutProperty("caw-winner-waypoints", "visibility", "none");
                        }
                        if (winnerMarkerRef.current) {
                            (winnerMarkerRef.current as maplibregl.Marker).remove();
                            winnerMarkerRef.current = null;
                        }
                        updateAbstainCallout();
                    } else {
                        const existingWinnerTrackCoordinates = getSmoothedAisCoordinates(winningTrack.points);
                        const { waterSegments: winnerWaterSegments, rawPointCount, renderedSegmentCount, removedLandSegments } = clipTrackToWaterWithStats(existingWinnerTrackCoordinates);
                        const winnerMmsi = winningTrack.vesselId;

                        console.log("WINNER LAND MASK", {
                            winnerMmsi,
                            rawPointCount,
                            renderedSegmentCount,
                            removedLandSegments,
                        });

                        const winnerCoordinates = winnerWaterSegments.length > 0
                            ? winnerWaterSegments[winnerWaterSegments.length - 1]
                            : existingWinnerTrackCoordinates;
                        const winnerEndpoint = winningTrack.points[winningTrack.points.length - 1];
                        const winnerDisplayLonLat: [number, number] = [winnerEndpoint.longitude, winnerEndpoint.latitude];

                        console.log("WINNER DISPLAY COORDINATE", {
                            winnerMmsi,
                            marker: winnerEndpoint,
                            trajectoryEnd: winnerCoordinates[winnerCoordinates.length - 1],
                        });

                        console.log("WINNER AIS TRACK", {
                            winnerMmsi,
                            trackPointCount: winningTrack?.points?.length,
                            firstPoint: winningTrack?.points?.[0],
                            lastPoint: winningTrack?.points?.[winningTrack.points.length - 1],
                        });
                        console.log("WINNER GOLD GEOMETRY", {
                            coordinateCount: winnerCoordinates.length,
                            first: winnerCoordinates[0],
                            last: winnerCoordinates[winnerCoordinates.length - 1],
                        });

                        let closestPt: [number, number] = winnerCoordinates[0] ?? [winningTrack.points[0].longitude, winningTrack.points[0].latitude];
                        let minDist = Infinity;
                        for (const p of winnerCoordinates) {
                            const d = Math.hypot(p[0] - p0[0], p[1] - p0[1]);
                            if (d < minDist) {
                                minDist = d;
                                closestPt = p;
                            }
                        }
                        const originLinkCoords: [number, number][] = [p0, closestPt];
                        updateWinnerOriginLinkSource(originLinkCoords);

                        const sampleWaypoints = sampleWaypointsAlongPath(winnerCoordinates, 8).filter((c) => isSea(c[1], c[0]));

                        // 19 non-winning hooks at opacity 0.08
                        const nonWinningFeatures: Feature[] = validTracks
                            .filter((track) => track.vesselId !== winningTrack.vesselId)
                            .flatMap((track, idx) => {
                                const targetPt = track.points[track.points.length - 1];
                                const p2: [number, number] = [targetPt.longitude, targetPt.latitude];
                                const p1 = generateHookControlPoint(p0, p2, idx);
                                const coords = sampleBezierCurve(p0, p1, p2, 1.0);
                                const waterSegments = clipTrackToWater(coords);
                                return waterSegments.map((segment) => ({
                                    type: "Feature" as const,
                                    geometry: { type: "LineString" as const, coordinates: segment },
                                    properties: { vesselId: track.vesselId, vesselName: track.vesselName, opacity: 0.08 },
                                }));
                            });
                        setSource("caw-investigation-hooks", { type: "FeatureCollection", features: nonWinningFeatures });
                        if (map.getLayer("caw-investigation-hooks")) {
                            map.setLayoutProperty("caw-investigation-hooks", "visibility", aisTrackVis);
                        }

                        // Full gold winner trajectory following historical waypoints
                        updateWinnerTrajectorySource(winnerWaterSegments);
                        setWinnerTrajectoryVisibility(true, goldColor);

                        // Exactly 8 waypoint dots along the trajectory
                        setSource("caw-winner-marker", {
                            type: "FeatureCollection",
                            features: sampleWaypoints.map((coord) => ({
                                type: "Feature",
                                geometry: { type: "Point", coordinates: coord },
                                properties: {},
                            })),
                        });
                        if (map.getLayer("caw-winner-waypoints")) {
                            map.setLayoutProperty("caw-winner-waypoints", "visibility", "visible");
                            map.setPaintProperty("caw-winner-waypoints", "circle-color", goldColor);
                            map.setPaintProperty("caw-winner-waypoints", "circle-radius", 2.8);
                        }

                        if (abstainMarkerRef.current) {
                            (abstainMarkerRef.current as maplibregl.Marker).remove();
                            abstainMarkerRef.current = null;
                        }
                        updateWinnerCallout(winnerDisplayLonLat, winningTrack.vesselId);
                    }
                }
            } else {
                // Initial standby state before IDENTIFY SUSPECTS: candidate tracks & markers remain hidden
                if (aisAnimationRef.current.timerId !== null) {
                    window.clearTimeout(aisAnimationRef.current.timerId);
                    aisAnimationRef.current.timerId = null;
                }
                if (aisAnimationRef.current.frameId !== null) {
                    cancelAnimationFrame(aisAnimationRef.current.frameId);
                    aisAnimationRef.current.frameId = null;
                }
                aisAnimationRef.current.animatedRunId = null;

                setSource("caw-winner-ais-track", emptyCollection);
                setSource("caw-winner-origin-link", emptyCollection);
                setSource("caw-winner-trajectory", emptyCollection);
                setSource("caw-winner-marker", emptyCollection);
                setSource("caw-investigation-hooks", emptyCollection);
                if (map.getLayer("caw-investigation-hooks")) {
                    map.setLayoutProperty("caw-investigation-hooks", "visibility", "none");
                }
                setWinnerTrajectoryVisibility(false);
                if (map.getLayer("caw-winner-waypoints")) {
                    map.setLayoutProperty("caw-winner-waypoints", "visibility", "none");
                    map.setPaintProperty("caw-winner-waypoints", "circle-radius", 2.8);
                }
                winnerMarkerRef.current?.remove();
                winnerMarkerRef.current = null;
                abstainMarkerRef.current?.remove();
                abstainMarkerRef.current = null;

                if (map.getLayer("ais-vessel-tracks")) {
                    map.setLayoutProperty("ais-vessel-tracks", "visibility", "none");
                    map.setPaintProperty("ais-vessel-tracks", "line-opacity", 0);
                }
                if (map.getLayer("ais-vessel-markers")) {
                    map.setLayoutProperty("ais-vessel-markers", "visibility", "none");
                    map.setPaintProperty("ais-vessel-markers", "circle-opacity", 0);
                    map.setPaintProperty("ais-vessel-markers", "circle-stroke-opacity", 0);
                }
            }

            // --- HINDCAST / BACKTRACKING FORENSIC ANIMATION ---
            const backtrackSources = [
                "detection-target-lock",
                "hindcast-backtrack-trace",
                "hindcast-backtrack-trail",
                "hindcast-backtrack-probe",
                "hindcast-origin-pulse",
            ] as const;

            const updateBacktrackTelemetry = (
                pos: [number, number],
                title: string,
                sub: string,
                opacity: number = 1
            ) => {
                if (!hindcastTelemetryMarkerRef.current) {
                    const el = document.createElement("div");
                    el.className = "pointer-events-none select-none relative";
                    el.style.transition = "opacity 100ms ease-out";
                    el.innerHTML = `
                        <div style="transform: translate(-50%, -135%); white-space: nowrap;" class="bg-[#051326]/95 border border-[#38bdf8]/70 rounded-md px-2.5 py-1 shadow-2xl backdrop-blur-md flex flex-col items-center gap-0.5">
                            <div class="telemetry-badge-title text-[9px] font-mono font-bold text-[#38bdf8] uppercase tracking-wider leading-tight"></div>
                            <div class="telemetry-badge-sub text-[8px] font-mono text-[#94a3b8] leading-tight"></div>
                        </div>
                    `;
                    hindcastTelemetryMarkerRef.current = new maplibregl.Marker({
                        element: el,
                        anchor: "center",
                    })
                        .setLngLat(pos)
                        .addTo(map);
                }
                const el = hindcastTelemetryMarkerRef.current.getElement();
                el.style.opacity = String(opacity);
                const titleEl = el.querySelector(".telemetry-badge-title");
                if (titleEl) titleEl.textContent = title;
                const subEl = el.querySelector(".telemetry-badge-sub");
                if (subEl) subEl.textContent = sub;
                hindcastTelemetryMarkerRef.current.setLngLat(pos);
            };

            const isHindcastTab = investigationTab === "Hindcast";
            const hindcastAllowed = isHindcastTab && layerVisibility?.hindcast !== false;

            if (!hindcastAllowed) {
                // Cancel running animation
                if (hindcastAnimationRef.current.frameId !== null) {
                    cancelAnimationFrame(hindcastAnimationRef.current.frameId);
                    hindcastAnimationRef.current.frameId = null;
                }
                hindcastAnimationRef.current.currentTab = investigationTab;
                hindcastAnimationRef.current.animatedRunId = null;
                hindcastAnimationRef.current.completed = false;

                if (hindcastTelemetryMarkerRef.current) {
                    hindcastTelemetryMarkerRef.current.remove();
                    hindcastTelemetryMarkerRef.current = null;
                }

                for (const sId of backtrackSources) {
                    setSource(sId, emptyCollection);
                }
            } else {
                // Calculate authoritative water-clipped backtrack path (Spill Centroid -> Hindcast Origin)
                const backtrackWaterSegs = clipTrackToWater([spillCentroidLonLat, hindcastOriginLonLat]);
                const rawWaterCoords =
                    backtrackWaterSegs[0] && backtrackWaterSegs[0].length >= 2
                        ? backtrackWaterSegs[0]
                        : [spillCentroidLonLat, hindcastOriginLonLat];
                const backtrackCoords = densifyWaterPath(rawWaterCoords, 80);
                const totalPts = backtrackCoords.length;
                const t0Hours = analysis?.backward_hindcast?.hypothesized_t0_hours_before_detection ?? 72.0;

                const needsHindcastAnimation =
                    hindcastAnimationRef.current.currentTab !== "Hindcast" ||
                    hindcastAnimationRef.current.animatedRunId !== hindcastRun;

                if (!needsHindcastAnimation && hindcastAnimationRef.current.completed) {
                    // Already animated; keep steady-state static backtrack trace
                    setSource("hindcast-backtrack-trace", {
                        type: "FeatureCollection",
                        features: [{
                            type: "Feature",
                            geometry: { type: "LineString", coordinates: backtrackCoords },
                            properties: { opacity: 1.0 },
                        }],
                    });
                    setSource("detection-target-lock", emptyCollection);
                    setSource("hindcast-backtrack-trail", emptyCollection);
                    setSource("hindcast-backtrack-probe", emptyCollection);
                    setSource("hindcast-origin-pulse", emptyCollection);
                    if (originMarkerRef.current) {
                        originMarkerRef.current.getElement().style.opacity = "1";
                    }
                } else if (needsHindcastAnimation) {
                    // Cancel prior frame if any
                    if (hindcastAnimationRef.current.frameId !== null) {
                        cancelAnimationFrame(hindcastAnimationRef.current.frameId);
                        hindcastAnimationRef.current.frameId = null;
                    }

                    hindcastAnimationRef.current = {
                        frameId: null,
                        currentTab: "Hindcast",
                        animatedRunId: hindcastRun,
                        completed: false,
                    };

                    if (originMarkerRef.current) {
                        originMarkerRef.current.getElement().style.opacity = "0";
                    }

                    const animStartTime = performance.now();
                    const TOTAL_DURATION = 2800; // ms

                    const backtrackLoop = (now: number) => {
                        const elapsed = now - animStartTime;

                        // Phase 0: Target Lock at Spill Centroid (0 -> 500ms)
                        if (elapsed < 500) {
                            const phaseT = elapsed / 500;
                            const pulseRadius = 10 + 12 * Math.sin(phaseT * Math.PI);
                            const pulseOpacity = 0.5 + 0.45 * Math.cos(phaseT * Math.PI * 0.5);

                            setSource("detection-target-lock", {
                                type: "FeatureCollection",
                                features: [{
                                    type: "Feature",
                                    geometry: { type: "Point", coordinates: spillCentroidLonLat },
                                    properties: { radius: pulseRadius, opacity: pulseOpacity },
                                }],
                            });
                            setSource("hindcast-backtrack-trace", emptyCollection);
                            setSource("hindcast-backtrack-trail", emptyCollection);
                            setSource("hindcast-backtrack-probe", emptyCollection);
                            setSource("hindcast-origin-pulse", emptyCollection);

                            updateBacktrackTelemetry(
                                spillCentroidLonLat,
                                "TARGET LOCK · DETECTED SPILL",
                                "t₀ + 00.0h · Acoustic & Satellite Centroid",
                                1
                            );
                            if (originMarkerRef.current) {
                                originMarkerRef.current.getElement().style.opacity = "0";
                            }
                            hindcastAnimationRef.current.frameId = requestAnimationFrame(backtrackLoop);
                            return;
                        }

                        // Phase 1 & 2: Reverse Drift Probe Travel (500 -> 1800ms)
                        if (elapsed < 1800) {
                            const driftElapsed = elapsed - 500;
                            const driftDuration = 1300;
                            const tau = Math.min(1, driftElapsed / driftDuration);
                            const easedTau = easeInOutCubic(tau);
                            const reverseHours = easedTau * t0Hours;

                            // Fade out target lock in first 250ms of drift
                            if (driftElapsed < 250) {
                                const fadeLock = (1 - driftElapsed / 250) * 0.7;
                                setSource("detection-target-lock", {
                                    type: "FeatureCollection",
                                    features: [{
                                        type: "Feature",
                                        geometry: { type: "Point", coordinates: spillCentroidLonLat },
                                        properties: { radius: 10 + 12 * (driftElapsed / 250), opacity: fadeLock },
                                    }],
                                });
                            } else {
                                setSource("detection-target-lock", emptyCollection);
                            }

                            // Head index along densified water path
                            const headIdx = Math.max(1, Math.min(totalPts - 1, Math.round(easedTau * (totalPts - 1))));
                            const revealedCoords = backtrackCoords.slice(0, headIdx + 1);
                            const probeCoord = backtrackCoords[headIdx];

                            // Trail coords (comet tail)
                            const trailStartIdx = Math.max(0, headIdx - 12);
                            const trailCoords = backtrackCoords.slice(trailStartIdx, headIdx + 1);

                            // Update backtrack trace
                            setSource("hindcast-backtrack-trace", {
                                type: "FeatureCollection",
                                features: [{
                                    type: "Feature",
                                    geometry: { type: "LineString", coordinates: revealedCoords },
                                    properties: { opacity: 0.95 },
                                }],
                            });

                            // Update trailing glow
                            setSource("hindcast-backtrack-trail", {
                                type: "FeatureCollection",
                                features: trailCoords.length >= 2 ? [{
                                    type: "Feature",
                                    geometry: { type: "LineString", coordinates: trailCoords },
                                    properties: {},
                                }] : [],
                            });

                            // Update moving probe
                            setSource("hindcast-backtrack-probe", {
                                type: "FeatureCollection",
                                features: [{
                                    type: "Feature",
                                    geometry: { type: "Point", coordinates: probeCoord },
                                    properties: { opacity: 1.0 },
                                }],
                            });

                            setSource("hindcast-origin-pulse", emptyCollection);

                            updateBacktrackTelemetry(
                                probeCoord,
                                `REWIND DRIFT · t₀ − ${reverseHours.toFixed(1)}h`,
                                "Hydrodynamic Backtracking · Water Path",
                                1
                            );

                            if (originMarkerRef.current) {
                                originMarkerRef.current.getElement().style.opacity = "0";
                            }

                            hindcastAnimationRef.current.frameId = requestAnimationFrame(backtrackLoop);
                            return;
                        }

                        // Phase 3 & 4: Origin Arrival & Gold Ripple Pulse (1800 -> 2400ms)
                        if (elapsed < 2400) {
                            const pulseElapsed = elapsed - 1800;
                            const pulseDuration = 600;
                            const pulseTau = Math.min(1, pulseElapsed / pulseDuration);
                            const pulseRadius = 10 + 26 * easeOutCubic(pulseTau);
                            const pulseOpacity = (1 - pulseTau) * 0.85;

                            setSource("detection-target-lock", emptyCollection);
                            setSource("hindcast-backtrack-trail", emptyCollection);

                            // Full backtrack trace
                            setSource("hindcast-backtrack-trace", {
                                type: "FeatureCollection",
                                features: [{
                                    type: "Feature",
                                    geometry: { type: "LineString", coordinates: backtrackCoords },
                                    properties: { opacity: 0.95 },
                                }],
                            });

                            // Probe fades out over first 300ms
                            if (pulseElapsed < 300) {
                                setSource("hindcast-backtrack-probe", {
                                    type: "FeatureCollection",
                                    features: [{
                                        type: "Feature",
                                        geometry: { type: "Point", coordinates: hindcastOriginLonLat },
                                        properties: { opacity: 1 - pulseElapsed / 300 },
                                    }],
                                });
                            } else {
                                setSource("hindcast-backtrack-probe", emptyCollection);
                            }

                            // Expanding gold origin pulse
                            setSource("hindcast-origin-pulse", {
                                type: "FeatureCollection",
                                features: [{
                                    type: "Feature",
                                    geometry: { type: "Point", coordinates: hindcastOriginLonLat },
                                    properties: { radius: pulseRadius, opacity: pulseOpacity },
                                }],
                            });

                            // Origin callout marker fades in (0 -> 1)
                            if (originMarkerRef.current) {
                                originMarkerRef.current.getElement().style.opacity = String(
                                    Math.min(1, easeOutCubic(pulseTau))
                                );
                            }

                            updateBacktrackTelemetry(
                                hindcastOriginLonLat,
                                `ESTIMATED ORIGIN · t₀ − ${t0Hours.toFixed(1)}h`,
                                "Authoritative Sinking Point · Parity Confirmed",
                                1
                            );

                            hindcastAnimationRef.current.frameId = requestAnimationFrame(backtrackLoop);
                            return;
                        }

                        // Phase 5: Lock-In & Telemetry Settle (2400 -> 2800ms)
                        if (elapsed < TOTAL_DURATION) {
                            const settleElapsed = elapsed - 2400;
                            const settleDuration = 400;
                            const fade = Math.max(0, 1 - settleElapsed / settleDuration);

                            setSource("detection-target-lock", emptyCollection);
                            setSource("hindcast-backtrack-trail", emptyCollection);
                            setSource("hindcast-backtrack-probe", emptyCollection);
                            setSource("hindcast-origin-pulse", emptyCollection);

                            setSource("hindcast-backtrack-trace", {
                                type: "FeatureCollection",
                                features: [{
                                    type: "Feature",
                                    geometry: { type: "LineString", coordinates: backtrackCoords },
                                    properties: { opacity: 1.0 },
                                }],
                            });

                            if (originMarkerRef.current) {
                                originMarkerRef.current.getElement().style.opacity = "1";
                            }

                            updateBacktrackTelemetry(
                                hindcastOriginLonLat,
                                `ESTIMATED ORIGIN · t₀ − ${t0Hours.toFixed(1)}h`,
                                "Authoritative Sinking Point · Parity Confirmed",
                                fade
                            );

                            hindcastAnimationRef.current.frameId = requestAnimationFrame(backtrackLoop);
                            return;
                        }

                        // Animation Complete (>= 2800ms) - Clean Halt & Persistence
                        hindcastAnimationRef.current.completed = true;
                        hindcastAnimationRef.current.frameId = null;

                        setSource("detection-target-lock", emptyCollection);
                        setSource("hindcast-backtrack-trail", emptyCollection);
                        setSource("hindcast-backtrack-probe", emptyCollection);
                        setSource("hindcast-origin-pulse", emptyCollection);

                        setSource("hindcast-backtrack-trace", {
                            type: "FeatureCollection",
                            features: [{
                                type: "Feature",
                                geometry: { type: "LineString", coordinates: backtrackCoords },
                                properties: { opacity: 1.0 },
                            }],
                        });

                        if (originMarkerRef.current) {
                            originMarkerRef.current.getElement().style.opacity = "1";
                        }

                        if (hindcastTelemetryMarkerRef.current) {
                            hindcastTelemetryMarkerRef.current.remove();
                            hindcastTelemetryMarkerRef.current = null;
                        }
                    };

                    hindcastAnimationRef.current.frameId = requestAnimationFrame(backtrackLoop);
                }
            }

            // --- FORECAST FORWARD SIMULATION ANIMATION ---
            const forecastSources = [
                "forecast-target-lock",
                "forecast-animation-trace",
                "forecast-animation-trail",
                "forecast-animation-probe",
                "forecast-animation-endpoint",
                "forecast-animation-envelope",
            ] as const;

            const isForecastTab = investigationTab === "Forecast";
            const forecastAllowed = isForecastTab && layerVisibility?.forecast !== false;

            const updateForecastTelemetry = (
                pos: [number, number],
                title: string,
                sub: string,
                opacity: number = 1
            ) => {
                if (!forecastTelemetryMarkerRef.current) {
                    const el = document.createElement("div");
                    el.className = "pointer-events-none select-none relative";
                    el.style.transition = "opacity 100ms ease-out";
                    el.innerHTML = `
                        <div style="transform: translate(-50%, -135%); white-space: nowrap;" class="bg-[#051326]/95 border border-[#06b6d4]/70 rounded-md px-2.5 py-1 shadow-2xl backdrop-blur-md flex flex-col items-center gap-0.5">
                            <div class="forecast-badge-title text-[9px] font-mono font-bold text-[#22d4ee] uppercase tracking-wider leading-tight"></div>
                            <div class="forecast-badge-sub text-[8px] font-mono text-[#a5f3fc]/80 leading-tight"></div>
                        </div>
                    `;
                    forecastTelemetryMarkerRef.current = new maplibregl.Marker({
                        element: el,
                        anchor: "center",
                    })
                        .setLngLat(pos)
                        .addTo(map);
                }
                const el = forecastTelemetryMarkerRef.current.getElement();
                el.style.opacity = String(opacity);
                const titleEl = el.querySelector(".forecast-badge-title");
                if (titleEl) titleEl.textContent = title;
                const subEl = el.querySelector(".forecast-badge-sub");
                if (subEl) subEl.textContent = sub;
                forecastTelemetryMarkerRef.current.setLngLat(pos);
            };

            const ensureTimeMarkers = (coords: [number, number][], activeHours: number) => {
                if (coords.length < 2) return;
                const pts = coords.length;
                const thresholds = [
                    { hours: 6.0, fraction: 0.25, label: "t₀ + 6h" },
                    { hours: 12.0, fraction: 0.50, label: "t₀ + 12h" },
                    { hours: 18.0, fraction: 0.75, label: "t₀ + 18h" },
                ];

                thresholds.forEach((th, idx) => {
                    if (activeHours >= th.hours) {
                        if (!forecastTimeMarkersRef.current[idx]) {
                            const coordIdx = Math.round((pts - 1) * th.fraction);
                            const pos = coords[coordIdx];
                            const el = document.createElement("div");
                            el.className = "pointer-events-none select-none flex items-center gap-1";
                            el.innerHTML = `
                                <div class="w-1.5 h-1.5 rounded-full bg-[#22d4ee] shadow-[0_0_6px_#22d4ee]"></div>
                                <div class="bg-[#051326]/90 border border-[#06b6d4]/50 rounded px-1.5 py-0.5 text-[8px] font-mono font-bold text-[#22d4ee] whitespace-nowrap shadow-md backdrop-blur-sm">
                                    ${th.label}
                                </div>
                            `;
                            const marker = new maplibregl.Marker({ element: el, anchor: "left", offset: [4, 0] })
                                .setLngLat(pos)
                                .addTo(map);
                            forecastTimeMarkersRef.current[idx] = marker;
                        }
                    }
                });
            };

            if (!forecastAllowed) {
                // Cancel running animation
                if (forecastAnimationRef.current.frameId !== null) {
                    cancelAnimationFrame(forecastAnimationRef.current.frameId);
                    forecastAnimationRef.current.frameId = null;
                }
                forecastAnimationRef.current.currentTab = investigationTab;
                forecastAnimationRef.current.animatedRunId = null;
                forecastAnimationRef.current.completed = false;

                if (forecastTelemetryMarkerRef.current) {
                    forecastTelemetryMarkerRef.current.remove();
                    forecastTelemetryMarkerRef.current = null;
                }
                forecastTimeMarkersRef.current.forEach((m) => m?.remove());
                forecastTimeMarkersRef.current = [];

                for (const sId of forecastSources) {
                    setSource(sId, emptyCollection);
                }
            } else {
                // Calculate authoritative water-clipped forecast trajectory path (Spill Centroid -> 24h Forecast Centroid)
                const forecastWaterSegs = clipTrackToWater([spillCentroidLonLat, forecastCentroidLonLat]);
                const rawForecastCoords =
                    forecastWaterSegs[0] && forecastWaterSegs[0].length >= 2
                        ? forecastWaterSegs[0]
                        : [spillCentroidLonLat, forecastCentroidLonLat];
                const forecastCoords = densifyWaterPath(rawForecastCoords, 80);
                const totalForecastPts = forecastCoords.length;

                const needsForecastAnimation =
                    forecastAnimationRef.current.currentTab !== "Forecast" ||
                    forecastAnimationRef.current.animatedRunId !== forecastRun;

                if (!needsForecastAnimation && forecastAnimationRef.current.completed) {
                    // Already animated; keep steady-state static forecast trace & envelope
                    setSource("forecast-animation-trace", {
                        type: "FeatureCollection",
                        features: [{
                            type: "Feature",
                            geometry: { type: "LineString", coordinates: forecastCoords },
                            properties: { opacity: 1.0 },
                        }],
                    });
                    setSource("forecast-animation-envelope", forecastEnvelopeData);
                    setSource("forecast-target-lock", emptyCollection);
                    setSource("forecast-animation-trail", emptyCollection);
                    setSource("forecast-animation-probe", emptyCollection);
                    setSource("forecast-animation-endpoint", emptyCollection);
                    ensureTimeMarkers(forecastCoords, 24.0);
                    if (forecastMarkerRef.current) {
                        forecastMarkerRef.current.getElement().style.opacity = "1";
                    }
                } else if (needsForecastAnimation) {
                    if (forecastAnimationRef.current.frameId !== null) {
                        cancelAnimationFrame(forecastAnimationRef.current.frameId);
                        forecastAnimationRef.current.frameId = null;
                    }

                    forecastTimeMarkersRef.current.forEach((m) => m?.remove());
                    forecastTimeMarkersRef.current = [];

                    forecastAnimationRef.current = {
                        frameId: null,
                        currentTab: "Forecast",
                        animatedRunId: forecastRun,
                        completed: false,
                    };

                    if (forecastMarkerRef.current) {
                        forecastMarkerRef.current.getElement().style.opacity = "0";
                    }

                    const animStartTime = performance.now();
                    const TOTAL_FORECAST_DURATION = 2400; // ms

                    const forecastLoop = (now: number) => {
                        const elapsed = now - animStartTime;

                        // Phase 0: Target Lock at Spill Centroid (0 -> 400ms)
                        if (elapsed < 400) {
                            const phaseT = elapsed / 400;
                            const pulseRadius = 10 + 10 * Math.sin(phaseT * Math.PI);
                            const pulseOpacity = 0.5 + 0.4 * Math.cos(phaseT * Math.PI * 0.5);

                            setSource("forecast-target-lock", {
                                type: "FeatureCollection",
                                features: [{
                                    type: "Feature",
                                    geometry: { type: "Point", coordinates: spillCentroidLonLat },
                                    properties: { radius: pulseRadius, opacity: pulseOpacity },
                                }],
                            });
                            setSource("forecast-animation-trace", emptyCollection);
                            setSource("forecast-animation-trail", emptyCollection);
                            setSource("forecast-animation-probe", emptyCollection);
                            setSource("forecast-animation-endpoint", emptyCollection);
                            setSource("forecast-animation-envelope", emptyCollection);

                            updateForecastTelemetry(
                                spillCentroidLonLat,
                                "FORECAST INITIALIZED · t₀ + 00.0h",
                                "Forward Drift Simulation · Hydrodynamic Modeling",
                                1
                            );
                            if (forecastMarkerRef.current) {
                                forecastMarkerRef.current.getElement().style.opacity = "0";
                            }
                            forecastAnimationRef.current.frameId = requestAnimationFrame(forecastLoop);
                            return;
                        }

                        // Phase 1 & 2: Forward Drift Probe Travel & Progressive Line Draw-On (400 -> 1600ms)
                        if (elapsed < 1600) {
                            const driftElapsed = elapsed - 400;
                            const driftDuration = 1200;
                            const tau = Math.min(1, driftElapsed / driftDuration);
                            const easedTau = easeInOutCubic(tau);
                            const forwardHours = easedTau * 24.0;

                            // Fade out target lock in first 200ms of drift
                            if (driftElapsed < 200) {
                                const fadeLock = (1 - driftElapsed / 200) * 0.7;
                                setSource("forecast-target-lock", {
                                    type: "FeatureCollection",
                                    features: [{
                                        type: "Feature",
                                        geometry: { type: "Point", coordinates: spillCentroidLonLat },
                                        properties: { radius: 10 + 10 * (driftElapsed / 200), opacity: fadeLock },
                                    }],
                                });
                            } else {
                                setSource("forecast-target-lock", emptyCollection);
                            }

                            // Head index along densified water path
                            const headIdx = Math.max(1, Math.min(totalForecastPts - 1, Math.round(easedTau * (totalForecastPts - 1))));
                            const revealedCoords = forecastCoords.slice(0, headIdx + 1);
                            const probeCoord = forecastCoords[headIdx];

                            // Trailing wake (comet tail)
                            const trailStartIdx = Math.max(0, headIdx - 10);
                            const trailCoords = forecastCoords.slice(trailStartIdx, headIdx + 1);

                            // Update trajectory line
                            setSource("forecast-animation-trace", {
                                type: "FeatureCollection",
                                features: [{
                                    type: "Feature",
                                    geometry: { type: "LineString", coordinates: revealedCoords },
                                    properties: { opacity: 0.95 },
                                }],
                            });

                            // Update trailing glow
                            setSource("forecast-animation-trail", {
                                type: "FeatureCollection",
                                features: trailCoords.length >= 2 ? [{
                                    type: "Feature",
                                    geometry: { type: "LineString", coordinates: trailCoords },
                                    properties: {},
                                }] : [],
                            });

                            // Update moving probe
                            setSource("forecast-animation-probe", {
                                type: "FeatureCollection",
                                features: [{
                                    type: "Feature",
                                    geometry: { type: "Point", coordinates: probeCoord },
                                    properties: { opacity: 1.0 },
                                }],
                            });

                            setSource("forecast-animation-endpoint", emptyCollection);
                            setSource("forecast-animation-envelope", emptyCollection);

                            // Progressive time markers
                            ensureTimeMarkers(forecastCoords, forwardHours);

                            updateForecastTelemetry(
                                probeCoord,
                                `FORWARD SIMULATION · t₀ + ${forwardHours.toFixed(1)}h`,
                                "Hydrodynamic Forecast · Kerala Current & Wind",
                                1
                            );

                            if (forecastMarkerRef.current) {
                                forecastMarkerRef.current.getElement().style.opacity = "0";
                            }

                            forecastAnimationRef.current.frameId = requestAnimationFrame(forecastLoop);
                            return;
                        }

                        // Phase 3: Uncertainty Envelope Reveal & 24h Endpoint Pulse (1600 -> 2300ms)
                        if (elapsed < 2300) {
                            const pulseElapsed = elapsed - 1600;
                            const pulseDuration = 700;
                            const pulseTau = Math.min(1, pulseElapsed / pulseDuration);
                            const pulseRadius = 8 + 22 * easeOutCubic(pulseTau);
                            const pulseOpacity = (1 - pulseTau) * 0.85;

                            setSource("forecast-target-lock", emptyCollection);
                            setSource("forecast-animation-trail", emptyCollection);

                            // Full trajectory trace
                            setSource("forecast-animation-trace", {
                                type: "FeatureCollection",
                                features: [{
                                    type: "Feature",
                                    geometry: { type: "LineString", coordinates: forecastCoords },
                                    properties: { opacity: 1.0 },
                                }],
                            });

                            // Probe fades out over first 250ms
                            if (pulseElapsed < 250) {
                                setSource("forecast-animation-probe", {
                                    type: "FeatureCollection",
                                    features: [{
                                        type: "Feature",
                                        geometry: { type: "Point", coordinates: forecastCentroidLonLat },
                                        properties: { opacity: 1 - pulseElapsed / 250 },
                                    }],
                                });
                            } else {
                                setSource("forecast-animation-probe", emptyCollection);
                            }

                            // Expanding cyan 24h endpoint pulse
                            setSource("forecast-animation-endpoint", {
                                type: "FeatureCollection",
                                features: [{
                                    type: "Feature",
                                    geometry: { type: "Point", coordinates: forecastCentroidLonLat },
                                    properties: { radius: pulseRadius, opacity: pulseOpacity },
                                }],
                            });

                            // Uncertainty envelope fades in (0 -> 1)
                            const envelopeOpacity = easeOutCubic(pulseTau);
                            setSource("forecast-animation-envelope", {
                                ...forecastEnvelopeData,
                                features: forecastEnvelopeData.features.map((f) => ({
                                    ...f,
                                    properties: {
                                        ...f.properties,
                                        opacity: envelopeOpacity,
                                    },
                                })),
                            });

                            ensureTimeMarkers(forecastCoords, 24.0);

                            // Endpoint callout marker fades in (0 -> 1)
                            if (forecastMarkerRef.current) {
                                forecastMarkerRef.current.getElement().style.opacity = String(
                                    Math.min(1, easeOutCubic(pulseTau))
                                );
                            }

                            updateForecastTelemetry(
                                forecastCentroidLonLat,
                                "FORECAST · t₀ + 24.0h",
                                "Authoritative Drift Prediction · Uncertainty Envelope",
                                1
                            );

                            forecastAnimationRef.current.frameId = requestAnimationFrame(forecastLoop);
                            return;
                        }

                        // Settle & Animation Complete (>= 2300ms) - Clean Halt & Zero Idle CPU
                        forecastAnimationRef.current.completed = true;
                        forecastAnimationRef.current.frameId = null;

                        setSource("forecast-target-lock", emptyCollection);
                        setSource("forecast-animation-trail", emptyCollection);
                        setSource("forecast-animation-probe", emptyCollection);
                        setSource("forecast-animation-endpoint", emptyCollection);

                        setSource("forecast-animation-trace", {
                            type: "FeatureCollection",
                            features: [{
                                type: "Feature",
                                geometry: { type: "LineString", coordinates: forecastCoords },
                                properties: { opacity: 1.0 },
                            }],
                        });

                        setSource("forecast-animation-envelope", forecastEnvelopeData);
                        ensureTimeMarkers(forecastCoords, 24.0);

                        if (forecastMarkerRef.current) {
                            forecastMarkerRef.current.getElement().style.opacity = "1";
                        }

                        if (forecastTelemetryMarkerRef.current) {
                            forecastTelemetryMarkerRef.current.remove();
                            forecastTelemetryMarkerRef.current = null;
                        }
                    };

                    forecastAnimationRef.current.frameId = requestAnimationFrame(forecastLoop);
                }
            }

            // --- HTML CALLOUT 1: Hindcast Origin Marker ---
            if (showHindcast && hindcastOriginLonLat) {
                if (!originMarkerRef.current) {
                    const el = document.createElement("div");
                    el.className = "pointer-events-none select-none flex items-center gap-2";
                    el.style.transition = "opacity 180ms ease-out";
                    // If in Hindcast tab and animation is active/running, start with opacity 0
                    if (isHindcastTab && !hindcastAnimationRef.current.completed) {
                        el.style.opacity = "0";
                    }
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
                        anchor: "left",
                        offset: [-10, 0],
                    })
                        .setLngLat(hindcastOriginLonLat)
                        .addTo(map);
                } else {
                    originMarkerRef.current.setLngLat(hindcastOriginLonLat);
                    if (!isHindcastTab || hindcastAnimationRef.current.completed) {
                        originMarkerRef.current.getElement().style.opacity = "1";
                    }
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
                    el.style.transition = "opacity 180ms ease-out";
                    if (isForecastTab && !forecastAnimationRef.current.completed) {
                        el.style.opacity = "0";
                    }
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
                    forecastMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "left", offset: [-10, 0] })
                        .setLngLat(forecastCentroidLonLat)
                        .addTo(map);
                } else {
                    forecastMarkerRef.current.setLngLat(forecastCentroidLonLat);
                    if (!isForecastTab || forecastAnimationRef.current.completed) {
                        forecastMarkerRef.current.getElement().style.opacity = "1";
                    }
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
    }, [region, spillId, analysis, investigationTab, aisTracks, highlightedVesselId, cawActive, winningVesselId, decision, isIdentifying, identifyRun, hindcastRun, forecastRun, identified, suspects, layerVisibility, ensureLayers]);

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

