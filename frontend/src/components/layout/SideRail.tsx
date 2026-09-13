const navItems = [
    { id: "Overview", label: "Overview", icon: "⌂" },
    { id: "Hindcast", label: "Hindcast", icon: "⊕" },
    { id: "Forecast", label: "Forecast", icon: "⟳" },
    { id: "AIS Analysis", label: "AIS Analysis", icon: "⛶" },
    { id: "Suspects", label: "Suspects", icon: "👤" },
    { id: "Timeline", label: "Timeline", icon: "◷" },
    { id: "Images", label: "Images", icon: "⧉" },
    { id: "Report", label: "Report", icon: "▤" },
];

interface SideRailProps {
    activeSection: string;
    onNavigate: (section: string) => void;
    investigationTab?: string;
    onTabChange?: (tab: string) => void;
}

export function SideRail({ investigationTab = "Overview", onTabChange }: SideRailProps) {
    return (
        <aside className="flex w-[130px] shrink-0 flex-col border-r border-[#15293e] bg-[#030d17] p-2.5">
            {/* Vertical Navigation Column */}
            <nav className="flex flex-col gap-1.5" aria-label="Main Navigation">
                {navItems.map((item) => {
                    const isActive = investigationTab === item.id;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => onTabChange?.(item.id)}
                            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs transition-all ${
                                isActive
                                    ? "bg-[#0070f3] font-semibold text-white shadow-md"
                                    : "text-[#7a9bb5] hover:bg-[#0c2238] hover:text-[#f8fafc]"
                            }`}
                        >
                            <span className="text-sm leading-none">{item.icon}</span>
                            <span className="truncate">{item.label}</span>
                        </button>
                    );
                })}
            </nav>

            {/* Bottom Status from Reference Image */}
            <div className="mt-auto border-t border-[#15293e] pt-3 pl-1">
                <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#10b981] animate-pulse" />
                    <span className="text-[9px] font-semibold text-[#cbd5e1]">System Online</span>
                </div>
                <p className="mt-1 font-mono text-[8px] uppercase tracking-wider text-[#5a7d96]">
                    OCEANGUARD v1.0.0
                </p>
            </div>
        </aside>
    );
}


