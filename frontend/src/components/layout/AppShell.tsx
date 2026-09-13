import type { ReactNode } from "react";
import { SideRail } from "./SideRail";
import { TopBar } from "./TopBar";

interface AppShellProps {
    children: ReactNode;
    activeSection: string;
    onNavigate: (section: string) => void;
    investigationTab?: string;
    onTabChange?: (tab: string) => void;
}

export function AppShell({ children, activeSection, onNavigate, investigationTab, onTabChange }: AppShellProps) {
    return (
        <div className="flex h-screen min-h-[680px] flex-col overflow-hidden bg-navy text-ink">
            <TopBar />
            <div className="flex min-h-0 flex-1">
                <SideRail activeSection={activeSection} onNavigate={onNavigate} investigationTab={investigationTab} onTabChange={onTabChange} />
                {children}
            </div>
        </div>
    );
}
