# Maritime Investigation Map

`MapView` is the MapLibre GL rendering engine for the oil-spill investigation workspace. It turns spill analysis, AIS history, hindcast results, and forecast results into an interactive tactical map.

`MapSurface` is the presentation wrapper around `MapView`. It owns the map toolbar, investigation tabs, layer visibility menu, cursor telemetry, and animation run counters. Use `MapSurface` for the normal application experience. Use `MapView` directly when a parent already owns those controls.

## What It Renders

- Esri dark-gray maritime basemap for the standard `Map` view.
- Esri World Imagery basemap for the `Satellite` view.
- Regional graticule covering 72-78 E and 7-13 N.
- Active region geometry fetched from the backend.
- Detected spill centroid and a scaled, irregular two-band slick contour.
- Hindcast trajectory from the estimated origin to the detected spill.
- Animated hindcast backtrack with a probe, trail, origin pulse, and telemetry markers.
- Forward forecast trajectory, particle cloud, and uncertainty envelope when supplied by analysis.
- Animated forecast reveal with a probe, trail, endpoint, and time markers.
- Historical AIS tracks and vessel markers.
- CAW winner attribution path and selection markers.
- Investigation callouts for origin, forecast, winner, and abstain states.

All track geometry is passed through the regional land mask before it is drawn. Track segments crossing land are split at the coastline, so rendered trajectories remain water-only.

## Component Relationship

```text
MapSurface
  |-- toolbar and investigation controls
  |-- layer visibility state
  |-- animation run counters
  `-- MapView
        |-- fetch region and spill metadata
        |-- initialize and dispose MapLibre
        |-- maintain GeoJSON sources and layers
        |-- update markers and animation frames
        `-- report map readiness and cursor coordinates
```

## Normal Usage

`MapSurface` is normally rendered by a page or investigation shell:

```tsx
<MapSurface
    activeLayer={activeLayer}
    onLayerChange={setActiveLayer}
    investigationTab={investigationTab}
    onTabChange={setInvestigationTab}
    aisTracks={aisTracks}
    highlightedVesselId={highlightedVesselId}
    analysis={analysis}
    cawActive={cawActive}
    winningVesselId={winningVesselId}
    decision={decision}
    isIdentifying={isIdentifying}
    identifyRun={identifyRun}
    identified={identified}
    suspects={suspects}
    onVesselSelect={handleVesselSelect}
/>
```

For lower-level integration, `MapView` exposes the map instance and coordinate telemetry:

```tsx
<MapView
    activeLayer="Map"
    investigationTab="Overview"
    analysis={analysis}
    aisTracks={tracks}
    onMapReady={(map) => setMap(map)}
    onCoordsUpdate={(coords) => setCursor(coords)}
    onVesselSelect={(vesselId) => selectVessel(vesselId)}
    layerVisibility={{
        spill: true,
        hindcast: true,
        forecast: true,
        ais: true,
        graticule: true,
    }}
/>
```

## `MapView` Props

| Prop | Type | Purpose |
| --- | --- | --- |
| `activeLayer` | `string` | Selects the basemap. `Map` shows the dark-gray tiles; `Satellite` shows imagery. |
| `investigationTab` | `string` | Current investigation mode, such as `Overview`, `Hindcast`, `Forecast`, `AIS Analysis`, or `Suspects`. It controls which animation and overlays are emphasized. |
| `aisTracks` | `AisTrack[]` | Historical vessel tracks and metadata. Defaults to an empty list. |
| `highlightedVesselId` | `number \| null` | Vessel whose AIS path and marker should receive emphasis. |
| `analysis` | `SpillAnalysis \| null` | Detection, hindcast, forecast, particle cloud, and uncertainty data. The map uses fallback coordinates when this is absent. |
| `cawActive` | `boolean` | Enables CAW attribution rendering. |
| `winningVesselId` | `number \| null` | Vessel selected as the attribution winner. |
| `decision` | `CustodesDecision \| null` | Custodes result: `COMMIT`, `REFINE_GRID`, or `ABSTAIN`. |
| `identifyRun` | `number` | Increment to restart the AIS identification animation. |
| `hindcastRun` | `number` | Increment to restart the hindcast animation. |
| `forecastRun` | `number` | Increment to restart the forecast animation. |
| `identified` | `boolean` | Indicates that identification has completed and winner overlays may be shown. |
| `suspects` | `SuspectCandidate[]` | Ranked suspect vessels used by attribution overlays and selection behavior. |
| `onVesselSelect` | `(vesselId: number) => void` | Called when a rendered vessel is selected. |
| `onCoordsUpdate` | `({ lon, lat } \| null) => void` | Receives the cursor coordinate while it is over the map, then `null` on exit. |
| `onMapReady` | `(map: MapLibreMap) => void` | Receives the initialized MapLibre instance. |
| `layerVisibility` | object | Controls `spill`, `hindcast`, `forecast`, `ais`, and `graticule` visibility. |
| `isIdentifying` | `boolean` | Indicates that an identification operation is in progress. |

All props are optional in `MapView`; defaults are applied for an empty, stable map. `MapSurface` provides the required application-level props and manages the optional state.

## Data Contracts

The component consumes the shared types in `frontend/src/types/intelligence.ts`:

- `AisTrack` contains `vesselId`, display metadata, and ordered `VesselTrackPoint[]` values.
- `SpillAnalysis` contains `detection`, `backward_hindcast`, `forward_forecast_centroid_lonlat`, and optional GeoJSON `forward_particle_cloud` and `uncertainty_envelope` values.
- `CustodesDecision` determines the attribution decision marker.
- `SuspectCandidate` provides ranked vessel candidates and their scoring fields.

Coordinates are always represented as `[longitude, latitude]` for GeoJSON and MapLibre. The API analysis object uses named `lon` and `lat` fields. Do not reverse these axes when adapting backend responses.

## Backend Requirements

On mount, `MapView` requests the first available region and spill:

```text
GET ${VITE_API_BASE_URL}/regions/
GET ${VITE_API_BASE_URL}/spills/
```

The frontend defaults `VITE_API_BASE_URL` to `/api`, so the development backend is expected at `http://localhost:8000` through the Vite proxy or an equivalent deployment proxy. The first region and first spill are selected automatically. If either request fails, the map keeps its fallback coordinates and records a load error.

The basemap uses public Esri raster tiles and does not require a MapLibre style API key. Network access to these tile URLs is still required for the basemap to display:

- `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`
- `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`

## Animation Triggers

Animations are driven by numeric run props rather than by hidden timers in the parent:

- Increment `identifyRun` to replay AIS identification.
- Increment `hindcastRun` when entering or replaying the Hindcast workflow.
- Increment `forecastRun` when entering or replaying the Forecast workflow.
- Change `investigationTab` to switch the visible investigation emphasis and animation state.

`MapView` cancels animation frames, timers, HTML markers, resize observers, and the MapLibre instance during unmount. Keep run counters stable unless a replay is intentional.

## Land-Mask Safety

AIS and modeled trajectories are processed by `utils/landMask.ts`:

1. Long segments are sampled for coastline crossings.
2. Crossings are bisected to find a water-side terminal coordinate.
3. Disconnected water sections become separate line strings.
4. `validateWaterOnlyGeometry` checks generated geometry before it is committed to a map source.

The mask is a bundled RLE grid from `data/regionalLandMask.json`. If the operating region changes, regenerate that asset and verify its bounds before changing map coordinates or fallback geometry.

## Development

From the repository root:

```bash
cd frontend
npm install
npm run dev
```

Run the production typecheck and build with:

```bash
cd frontend
npm run build
```

The map needs a non-zero-height container. `MapSurface` supplies `min-h-[480px]`; any direct `MapView` parent must provide its own height or MapLibre will render into a collapsed surface.

## Troubleshooting

### Blank map

Check that the container has height, that the browser can reach the Esri tile URLs, and that the `maplibre-gl` stylesheet is imported. The component imports the stylesheet itself, so duplicate global imports are unnecessary.

### Tracks appear on land

Confirm the track coordinates are `[longitude, latitude]`, the regional land-mask asset covers the incident area, and the source geometry passes through `clipTrackToWater` or `clipTrackToWaterWithStats`.

### Data is missing

Verify the frontend API base URL and that the backend exposes `/api/regions/` and `/api/spills/`. Inspect the browser network panel for the first failed request; the map can still render its basemap without metadata, but overlays will remain at their fallback or empty state.

### The map does not update after a new analysis

Ensure the parent replaces the `analysis` object with the latest response and increments the relevant run counter when an animation should replay. Updating a run counter is preferable to remounting the whole map.

## Extension Guidelines

- Add a new GeoJSON source ID to the source registry before adding layers that depend on it.
- Keep source updates and layer visibility updates separate so toggling a layer does not recreate the MapLibre instance.
- Use `[longitude, latitude]` consistently at the MapLibre boundary.
- Clip new vessel or trajectory lines through the land-mask helpers.
- Store animation frame IDs and marker references in refs, then clean them up in the initialization effect teardown.
- Preserve Esri attribution when changing or adding basemap sources.
- Prefer data-driven MapLibre paint/layout properties over DOM overlays for large collections; reserve HTML markers for a small number of semantic callouts.
