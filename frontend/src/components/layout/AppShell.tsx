import type { ReactNode } from "react";
import { SideRail } from "./SideRail";
import { TopBar } from "./TopBar";

export function AppShell({ children, activeSection, onNavigate }: { children: ReactNode; activeSection: string; onNavigate: (section: string) => void }) {
    return <div className="flex h-screen min-h-[680px] flex-col overflow-hidden bg-ink text-[#173247]"><TopBar /><div className="flex min-h-0 flex-1"><SideRail activeSection={activeSection} onNavigate={onNavigate} />{children}</div></div>;
}
