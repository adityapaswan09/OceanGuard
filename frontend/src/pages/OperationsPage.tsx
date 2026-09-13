import { useEffect, useState } from "react";

import { InvestigationPanel } from "../components/investigation/InvestigationPanel";
import { IncidentRail } from "../components/incidents/IncidentRail";
import { AppShell } from "../components/layout/AppShell";
import { MapSurface } from "../components/map/MapSurface";
import { TimelineBar } from "../components/operations/TimelineBar";
import { VesselWatchlist } from "../components/vessels/VesselWatchlist";
import { AlertsPage, type AlertRecord } from "./AlertsPage";
import { API_BASE_URL, getAlphaSurface, getCustodesStatus } from "../services/api";
import type { AisTrack, AlphaSurfaceResponse, CustodesStatusResponse, SpillAnalysis, SuspectCandidate } from "../types/intelligence";

const selectedSpillId = 1;
type VesselRecord = { id: number; name: string; vessel_type?: string | null; flag?: string | null };

export function OperationsPage() {
    const [activeSection, setActiveSection] = useState("Overview");
    const [activeLayer, setActiveLayer] = useState("Satellite");
    const [activeTab, setActiveTab] = useState("Overview");
    const [aisTracks, setAisTracks] = useState<AisTrack[]>([]);
    const [suspects, setSuspects] = useState<SuspectCandidate[]>([]);
    const [suspectsLoading, setSuspectsLoading] = useState(false);
    const [suspectsError, setSuspectsError] = useState(false);
    const [selectedSuspectId, setSelectedSuspectId] = useState<number | null>(null);
    const [detectionTime, setDetectionTime] = useState<string | null>(null);
    const [analysis, setAnalysis] = useState<SpillAnalysis | null>(null);
    const [alphaSurface, setAlphaSurface] = useState<AlphaSurfaceResponse | null>(null);
    const [custodesStatus, setCustodesStatus] = useState<CustodesStatusResponse | null>(null);
    const [identifyLoading, setIdentifyLoading] = useState(false);
    const [identifyError, setIdentifyError] = useState(false);
    const [identifyRun, setIdentifyRun] = useState(0);

    const handleAlertOpen = (alert: AlertRecord) => {
        setActiveSection("Overview");
        if (alert.spillId) setActiveTab("Timeline");
    };

    const handleIdentifySuspects = () => {
        if (identifyLoading) return;
        setIdentifyLoading(true);
        setIdentifyError(false);
        // Each click is a new animation run: MapView replays the winner flight on every run token.
        setIdentifyRun((run) => run + 1);
        Promise.all([getAlphaSurface(selectedSpillId), getCustodesStatus(selectedSpillId)])
            .then(([surface, status]) => {
                setAlphaSurface(surface);
                setCustodesStatus(status);
                // Ensure the CAW winning vessel's AIS track is loaded so the gold highlight and the
                // hindcast-origin animation can render without the user having visited "AIS Analysis".
                const winnerId = status.top_vessel;
                if (winnerId !== null && !aisTracks.some((track) => track.vesselId === winnerId)) {
                    fetch(`${API_BASE_URL}/vessels/${winnerId}/track`)
                        .then((response) => {
                            if (!response.ok) throw new Error("Vessel track unavailable");
                            return response.json();
                        })
                        .then((track: { points?: AisTrack["points"] }) => {
                            const points = track.points;
                            if (!points?.length) return;
                            const winnerName = suspects.find((candidate) => candidate.vessel_id === winnerId)?.vessel_name ?? `Vessel ${winnerId}`;
                            setAisTracks((prevTracks) => {
                                if (prevTracks.some((t) => t.vesselId === winnerId)) return prevTracks;
                                return [...prevTracks, { vesselId: winnerId, vesselName: winnerName, vesselType: null, flag: null, points }];
                            });
                        })
                        .catch(() => {
                            // Leave existing tracks as-is; identification result and panel stay usable.
                        });
                }
            })
            .catch(() => {
                setAlphaSurface(null);
                setCustodesStatus(null);
                setIdentifyError(true);
            })
            .finally(() => {
                setIdentifyLoading(false);
            });
    };

    useEffect(() => {
        let cancelled = false;
        fetch(`${API_BASE_URL}/spills/${selectedSpillId}/analysis`)
            .then((response) => {
                if (!response.ok) throw new Error(`Analysis request failed: ${response.status}`);
                return response.json() as Promise<SpillAnalysis>;
            })
            .then((data) => {
                if (!cancelled) setAnalysis(data);
            })
            .catch(() => {
                if (!cancelled) setAnalysis(null);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (activeTab !== "Suspects") return;
        let cancelled = false;
        setSuspectsLoading(true);
        setSuspectsError(false);
        fetch(`${API_BASE_URL}/spills/${selectedSpillId}/suspects`)
            .then((response) => {
                if (!response.ok) throw new Error("Suspect ranking unavailable");
                return response.json() as Promise<SuspectCandidate[]>;
            })
            .then((data) => {
                if (!cancelled) {
                    setSuspects(data);
                    setSelectedSuspectId(data[0]?.vessel_id ?? null);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setSuspects([]);
                    setSelectedSuspectId(null);
                    setSuspectsError(true);
                }
            })
            .finally(() => {
                if (!cancelled) setSuspectsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [activeTab]);

    useEffect(() => {
        if (activeTab !== "AIS Analysis") return;
        let cancelled = false;
        fetch(`${API_BASE_URL}/vessels/`)
            .then((response) => response.json() as Promise<VesselRecord[]>)
            .then((vessels) => Promise.all(vessels.map(async (vessel) => {
                const response = await fetch(`${API_BASE_URL}/vessels/${vessel.id}/track`);
                if (!response.ok) return null;
                const track = await response.json() as { points?: AisTrack["points"] };
                if (!track.points?.length) return null;
                return { vesselId: vessel.id, vesselName: vessel.name, vesselType: vessel.vessel_type, flag: vessel.flag, points: track.points } as AisTrack;
            })))
            .then((tracks) => {
                if (!cancelled) setAisTracks(tracks.filter((track): track is AisTrack => track !== null));
            })
            .catch(() => {
                if (!cancelled) setAisTracks([]);
            });
        return () => {
            cancelled = true;
        };
    }, [activeTab]);

    useEffect(() => {
        if (activeTab !== "Timeline") return;
        let cancelled = false;
        fetch(`${API_BASE_URL}/spills/`)
            .then((response) => response.json() as Promise<{ items?: Array<{ id: number; detection_time?: string | null }> }>)
            .then((data) => {
                const spill = data.items?.find((item) => item.id === selectedSpillId) ?? data.items?.[0];
                if (!cancelled) setDetectionTime(spill?.detection_time ?? null);
            })
            .catch(() => {
                if (!cancelled) setDetectionTime(null);
            });
        return () => {
            cancelled = true;
        };
    }, [activeTab]);

    useEffect(() => {
        if (selectedSuspectId === null) return;
        let cancelled = false;
        fetch(`${API_BASE_URL}/vessels/${selectedSuspectId}/track`)
            .then((response) => {
                if (!response.ok) throw new Error("Vessel track unavailable");
                return response.json();
            })
            .then((track: { vessel_id: number; points?: AisTrack["points"] }) => {
                if (!cancelled && track.points?.length) {
                    const suspect = suspects.find((s) => s.vessel_id === selectedSuspectId);
                    const vesselName = suspect?.vessel_name ?? `Vessel ${selectedSuspectId}`;
                    const newTrack: AisTrack = {
                        vesselId: selectedSuspectId,
                        vesselName: vesselName,
                        vesselType: null,
                        flag: null,
                        points: track.points,
                    };
                    setAisTracks((prevTracks) => {
                        const filtered = prevTracks.filter((t) => t.vesselId !== selectedSuspectId);
                        return [...filtered, newTrack];
                    });
                }
            })
            .catch(() => {
                // Gracefully handle API failure - leave existing UI functional
            });
        return () => {
            cancelled = true;
        };
    }, [selectedSuspectId, suspects]);

    const winningVesselId = custodesStatus?.top_vessel ?? null;
    const identified = alphaSurface !== null && custodesStatus !== null && !identifyError;
    const cawActive = identified && winningVesselId !== null;

    const kpis = [["Active spills", "01", "Elevated"], ["Total area", analysis ? `${analysis.detection.physical_area_km2.toFixed(2)} km²` : "—", "Current incident"], ["Monitored vessels", "148", "AIS coverage"], ["Alerts", "03", "2 unread"]];

    return <AppShell activeSection={activeSection} onNavigate={setActiveSection}>{activeSection === "Alerts" ? <AlertsPage onOpenAlert={handleAlertOpen} /> : <main className="flex min-w-0 flex-1 flex-col overflow-auto"><div className="border-b border-line bg-panel/90 px-5 py-5 lg:px-7"><div className="flex items-end justify-between"><div><div className="mb-2 flex items-center gap-2 text-[10px] text-mist"><span>Overview</span><span>/</span><span className="text-signal">Regional monitoring</span></div><h1 className="font-display text-2xl font-semibold text-ink">Regional Overview</h1><p className="mt-1 text-xs text-mist">Monitor active spills, vessel traffic, and environmental conditions across the Arabian Sea.</p></div><div className="hidden items-center gap-2 sm:flex"><span className="eyebrow">Region</span><button className="rounded-sm border border-line bg-panelAlt px-3 py-2 text-xs font-medium text-ink" type="button">Arabian Sea <span className="ml-5 text-mist">⌄</span></button></div></div><div className="mt-5 grid grid-cols-2 gap-2 xl:grid-cols-4">{kpis.map(([label, value, note]) => <div className="rounded-sm border border-line bg-panelAlt px-4 py-3" key={label}><p className="eyebrow">{label}</p><div className="mt-2 flex items-end justify-between"><p className="font-display text-xl font-semibold text-ink">{value}</p><p className="text-[9px] text-mist">{note}</p></div></div>)}</div></div><div className="grid min-h-[520px] flex-1 grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)_310px]"><IncidentRail analysis={analysis} /><div className="flex min-h-0 min-w-0 flex-col"><MapSurface
                            activeLayer={activeLayer}
                            onLayerChange={setActiveLayer}
                            investigationTab={activeTab}
                            aisTracks={aisTracks}
                            highlightedVesselId={selectedSuspectId}
                            analysis={analysis}
                            cawActive={cawActive}
                            winningVesselId={winningVesselId}
                            isIdentifying={identifyLoading}
                            identifyRun={identifyRun}
                            identified={identified}
                        /><VesselWatchlist /></div><InvestigationPanel
                            activeTab={activeTab}
                            onTabChange={setActiveTab}
                            suspects={suspects}
                            suspectsLoading={suspectsLoading}
                            suspectsError={suspectsError}
                            selectedSuspectId={selectedSuspectId}
                            onSuspectSelect={setSelectedSuspectId}
                            detectionTime={detectionTime}
                            analysis={analysis}
                            onIdentifySuspects={handleIdentifySuspects}
                            identifyLoading={identifyLoading}
                            identifyError={identifyError}
                            identified={identified}
                            alphaSurface={alphaSurface}
                            custodes={custodesStatus}
                            winningVesselId={winningVesselId}
                        /></div><TimelineBar /></main>}</AppShell>;
}
