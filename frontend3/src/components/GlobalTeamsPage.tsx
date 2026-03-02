import React, { useState } from "react";
import { ArrowLeft, Users, Search, MessageSquare, Clock } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { Particles } from "./ui/particles";
import { useQuery } from "@tanstack/react-query";
import { notificationsApi } from "@/src/lib/api";

interface Collaborator {
    id: string;
    name: string;
    handle: string;
    initials: string;
    avatarColor: string;
    sharedProjects: string[];
    lastActive: string;
    online: boolean;
}



export const GlobalTeamsPage = ({ onBack }: { onBack: () => void }) => {
    const [query, setQuery] = useState("");

    const { data: rawCollaborators = [], isLoading } = useQuery({
        queryKey: ['collaborators'],
        queryFn: () => notificationsApi.listCollaborators()
    });

    const collaborators: Collaborator[] = rawCollaborators.map(c => ({
        id: c.id,
        name: c.name || "",
        handle: c.handle || "",
        initials: (c.name || "U").substring(0, 2).toUpperCase(),
        avatarColor: "from-blue-500 to-indigo-600",
        sharedProjects: ["Shared Project"], // Backend Doesn't return shared projects, mock it
        lastActive: "Active recently",
        online: false
    }));

    const filtered = collaborators.filter(c =>
        (c.name || "").toLowerCase().includes(query.toLowerCase()) ||
        (c.handle || "").toLowerCase().includes(query.toLowerCase()) ||
        c.sharedProjects.some(p => p.toLowerCase().includes(query.toLowerCase()))
    );

    return (
        <div className="flex h-screen bg-black text-white overflow-hidden relative">
            <div className="fixed inset-0 z-0 pointer-events-none">
                <Particles quantity={120} className="absolute inset-0 h-full w-full" color="#ffffff" staticity={80} size={0.3} />
            </div>

            <main className="relative z-10 flex-1 flex flex-col min-w-0 h-full">
                {/* Header */}
                <header className="h-16 border-b border-white/[0.06] flex items-center px-6 bg-black/40 backdrop-blur-sm shrink-0">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onBack}
                            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center border border-white/10">
                                <Users className="h-4 w-4 text-white" />
                            </div>
                            <h1 className="text-lg font-bold">Your Collaborators</h1>
                            {isLoading && <span className="text-xs text-white/50 ml-4 animate-pulse">Loading...</span>}
                        </div>
                    </div>
                </header>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 md:p-10">
                    <div className="max-w-4xl mx-auto">
                        {/* Search */}
                        <div className="relative mb-8">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/20" />
                            <input
                                type="text"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="Search people or shared projects..."
                                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-2xl pl-12 pr-4 py-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-colors"
                            />
                        </div>

                        {/* List */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {filtered.length > 0 ? (
                                filtered.map(user => (
                                    <div key={user.id} className="bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.05] rounded-2xl p-5 transition-all duration-300 flex items-start gap-4 group cursor-pointer">
                                        <div className="relative shrink-0">
                                            <div className={cn("h-12 w-12 rounded-full bg-gradient-to-br flex items-center justify-center font-bold text-white shadow-lg", user.avatarColor)}>
                                                {user.initials}
                                            </div>
                                            {user.online && (
                                                <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 bg-emerald-500 rounded-full border-2 border-zinc-950" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <h3 className="text-base font-semibold text-white truncate">{user.name}</h3>
                                                <span className="text-xs text-white/40 group-hover:text-white/60 transition-colors">{user.handle}</span>
                                            </div>
                                            <div className="flex items-center gap-2 mb-3">
                                                <Clock className="h-3 w-3 text-white/30 shrink-0" />
                                                <span className={cn("text-xs", user.online ? "text-emerald-400 font-medium" : "text-white/40")}>
                                                    {user.lastActive}
                                                </span>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex flex-wrap gap-1.5">
                                                    {user.sharedProjects.map(p => (
                                                        <span key={p} className="px-2 py-0.5 rounded-md bg-white/[0.08] text-[11px] font-medium text-white/60">
                                                            {p}
                                                        </span>
                                                    ))}
                                                </div>
                                                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/[0.06]">
                                                    <span className="text-xs font-semibold text-white/30">{user.sharedProjects.length} shared project{user.sharedProjects.length !== 1 ? 's' : ''}</span>
                                                    <button className="ml-auto flex items-center gap-1.5 text-xs font-medium text-violet-400 hover:text-violet-300 transition-colors bg-violet-400/10 hover:bg-violet-400/20 px-3 py-1.5 rounded-lg">
                                                        <MessageSquare className="h-3.5 w-3.5" /> Ping
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="col-span-1 md:col-span-2 text-center py-20 border border-white/5 rounded-2xl bg-white/[0.02]">
                                    <Users className="h-8 w-8 text-white/10 mx-auto mb-3" />
                                    <p className="text-white/40">No collaborators found for "{query}".</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};
