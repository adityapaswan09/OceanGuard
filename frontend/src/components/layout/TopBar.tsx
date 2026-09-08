import { useOperationsClock } from "../../hooks/useOperationsClock";

export function TopBar() {
    const clock = useOperationsClock();
    return (
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-line bg-white px-5 lg:px-8">
            <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-signal text-sm font-bold text-white">OG</div>
                <div><p className="font-display text-[15px] font-bold text-[#123b55]">OceanGuard</p><p className="text-[9px] uppercase tracking-[.18em] text-mist">Maritime intelligence platform</p></div>
            </div>
            <div className="hidden w-[360px] items-center border border-line bg-[#f7fafc] px-3 py-2 md:flex"><span className="mr-2 text-sm text-mist">⌕</span><input className="w-full bg-transparent text-xs text-[#173247] outline-none placeholder:text-mist/70" placeholder="Search incidents, vessels, regions" /><span className="font-mono text-[9px] text-mist">⌘ K</span></div>
            <div className="flex items-center gap-5 text-right"><div className="hidden sm:block"><p className="eyebrow">Region</p><p className="text-xs font-medium text-[#173247]">Arabian Sea</p></div><div className="hidden sm:block"><p className="eyebrow">UTC</p><p className="font-mono text-xs text-[#173247]">{clock}</p></div><div className="flex items-center gap-2 border-l border-line pl-5"><span className="h-2 w-2 rounded-full bg-[#37a87a]" /><span className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#36765d]">Operational</span></div><div className="h-8 w-8 rounded-full bg-[#d8edf3] text-center text-[11px] font-bold leading-8 text-signal">AM</div></div>
        </header>
    );
}
