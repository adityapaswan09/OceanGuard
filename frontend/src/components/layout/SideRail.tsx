const navItems = [
    { id: "Overview", label: "Overview", icon: "◈", active: true },
    { id: "Hindcast", label: "Hindcast", icon: "◀", active: false },
    { id: "Forecast", label: "Forecast", icon: "▶", active: false },
    { id: "AIS Analysis", label: "AIS Analysis", icon: "⟐", active: false },
    { id: "Suspects", label: "Suspects", icon: "◆", active: false },
    { id: "Timeline", label: "Timeline", icon: "◈", active: false },
    { id: "Images", label: "Images", icon: "▦", active: false },
    { id: "Report", label: "Report", icon: "◧", active: false },
];

const investigationTabs = ["Overview", "Hindcast", "Forecast", "AIS Analysis", "Suspects", "Timeline", "Images", "Report"];

interface SideRailProps {
    activeSection: string;
    onNavigate: (section: string) => void;
    investigationTab?: string;
    onTabChange?: (tab: string) => void;
}

export function SideRail({ activeSection, onNavigate, investigationTab, onTabChange }: SideRailProps) {
    const activeNav = navItems.find((item) => item.id === activeSection) ?? navItems[0];
    const showInvestigation = investigationTab !== undefined && onTabChange !== undefined;
    return (
        <aside className="flex w-[72px] shrink-0 flex-col border-r border-line bg-panel/90 py-4 max-lg:w-16 max-lg:justify-center max-lg:px-2">
            <div className="mb-6 flex h-9 w-9 items-center justify-center rounded-sm bg-signal font-bold text-white shadow-glow">
                OG
            </div>
            <nav className="flex flex-col gap-1">
                {navItems.map((item) => {
                    const isActive = activeSection === item.id;
                    return (
                        <button
                            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-sm transition-all duration-150 ${
                                isActive
                                    ? "bg-panelAlt text-signal shadow-glow"
                                    : "text-mist hover:bg-panelAlt hover:text-ink"
                            }`}
                            key={item.id}
                            onClick={() => onNavigate(item.id)}
                            title={item.label}
                            type="button"
                        >
                            <span className="text-lg">{item.icon}</span>
                            {isActive && (
                                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-signal rounded-r" />
                            )}
                        </button>
                    );
                })}
            </nav>
            {showInvestigation && (
                <div className="mt-5 border-t border-line pt-4">
                    <p className="mb-2 px-1 text-[8px] font-semibold uppercase tracking-[.15em] text-mist/70">Investigation</p>
                    <div className="flex flex-col gap-0.5">
                        {investigationTabs.map((tab) => {
                            const isActive = investigationTab === tab;
                            return (
                                <button
                                    className={`flex h-8 w-10 shrink-0 items-center justify-center rounded-sm text-[8px] font-semibold transition-colors ${
                                        isActive
                                            ? "bg-signal/20 text-signal"
                                            : "text-mist hover:bg-panelAlt hover:text-ink"
                                    }`}
                                    key={tab}
                                    onClick={() => onTabChange!(tab)}
                                    title={tab}
                                    type="button"
                                >
                                    {tab.slice(0, 4)}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
            <div className="mt-auto flex items-center gap-2 border-t border-line pt-3 px-1">
                <span className="h-2 w-2 rounded-full bg-success" />
                <span className="text-[8px] uppercase tracking-[.15em] text-mist">Online</span>
            </div>
            <p className="px-1 pb-2 text-[8px] uppercase tracking-[.2em] text-mist/60">v1.0.0</p>
        </aside>
    );
}
