import { useCallback, useEffect, useState } from "react";

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
    const [activeLayer, setActiveLayer] = useState("Map");
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
    const [identified, setIdentified] = useState(false);
    const [identifiedAt, setIdentifiedAt] = useState<string | null>(null);
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
        // Clear previous identification state so stale values are not shown while re-running
        setIdentified(false);
        setIdentifiedAt(null);
        setCustodesStatus(null);
        setAlphaSurface(null);
        setSelectedSuspectId(null);
        // Each click is a new animation run for the AIS web -> fade sequence
        setIdentifyRun((run) => run + 1);
        if (aisTracks.length < 20) {
            loadAllVesselTracks();
        }
        Promise.all([getAlphaSurface(selectedSpillId), getCustodesStatus(selectedSpillId)])
            .then(([surface, status]) => {
                setAlphaSurface(surface);
                setCustodesStatus(status);
                setIdentified(true);
                setIdentifiedAt(new Date().toISOString());
                const winnerId = status.top_vessel;
                if (winnerId !== null) {
                    setSelectedSuspectId(winnerId);
                }
            })
            .catch(() => {
                setAlphaSurface(null);
                setCustodesStatus(null);
                setIdentifiedAt(null);
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
                    // Do not auto-select suspect before identification
                    setSelectedSuspectId(null);
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
    }, []);

    const loadAllVesselTracks = useCallback(() => {
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
    }, []);

    useEffect(() => {
        const cleanup = loadAllVesselTracks();
        return cleanup;
    }, [loadAllVesselTracks]);

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

    const isAbstain = custodesStatus?.decision === "ABSTAIN" || custodesStatus?.top_vessel === null;
    const winningVesselId = (identified && !isAbstain) ? (custodesStatus?.top_vessel ?? null) : null;
    const cawActive = identified && winningVesselId !== null;

    const kpis = [["Active spills", "01", "Elevated"], ["Total area", analysis ? `${analysis.detection.physical_area_km2.toFixed(2)} km²` : "—", "Current incident"], ["Monitored vessels", "148", "AIS coverage"], ["Alerts", "03", "2 unread"]];

    return (
        <AppShell
            activeSection={activeSection}
            onNavigate={setActiveSection}
            investigationTab={activeTab}
            onTabChange={setActiveTab}
        >
            {activeSection === "Alerts" ? (
                <AlertsPage onOpenAlert={handleAlertOpen} />
            ) : (
                <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#020813]">
                    {/* Main Operations 3-Column Dashboard Cards */}
                    <div className="flex min-h-0 min-w-0 flex-1 gap-3 p-3 overflow-hidden bg-[#020813]">
                        {/* 1. Left Card: Incident Overview */}
                        <IncidentRail
                            analysis={analysis}
                            onIdentifySuspects={handleIdentifySuspects}
                            identifyLoading={identifyLoading}
                            identified={identified}
                            identifyError={identifyError}
                            custodes={custodesStatus}
                            alphaSurface={alphaSurface}
                            identifiedAt={identifiedAt}
                        />

                        {/* 2. Center Card: Tactical Map Workspace */}
                        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#162c44] bg-[#040d1a] shadow-2xl">
                            <MapSurface
                                activeLayer={activeLayer}
                                onLayerChange={setActiveLayer}
                                investigationTab={activeTab}
                                onTabChange={setActiveTab}
                                aisTracks={aisTracks}
                                highlightedVesselId={selectedSuspectId}
                                analysis={analysis}
                                cawActive={cawActive}
                                winningVesselId={winningVesselId}
                                decision={custodesStatus?.decision}
                                isIdentifying={identifyLoading}
                                identifyRun={identifyRun}
                                identified={identified}
                                alphaSurface={alphaSurface}
                                suspects={suspects}
                                onVesselSelect={setSelectedSuspectId}
                            />
                        </div>

                        {/* 3. Right Card: CAW & Custodes Investigation Panel */}
                        <InvestigationPanel
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
                        />
                    </div>
                </main>
            )}
        </AppShell>
    );
}
