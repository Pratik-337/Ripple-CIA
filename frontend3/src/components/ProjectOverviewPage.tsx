import React, { useState } from "react";
import {
    ArrowLeft, MoreHorizontal, Waves, Bell, GitBranch, Users, Clock,
    CheckCircle2, AlertCircle, CircleDot, Lock, Plus, Settings,
    Eye, Shield, X, Search, ChevronRight, FileCode2, Zap,
    GitMerge, History, Network, SendHorizonal, UserPlus, Pencil,
    FolderPlus, FileMinus, RefreshCw, Trash2, Check
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { Particles } from "@/src/components/ui/particles";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectsApi, componentsApi, notificationsApi, ProjectData, ComponentItem, StrictnessMode, ComponentStatus, ActiveChange, Collaborator } from "@/src/lib/api";

// ─── Mock Data ────────────────────────────────────────────────────────────────





// ─── Status + Strictness Config ───────────────────────────────────────────────

const STATUS_CFG: Record<ComponentStatus, { label: string; dot: string; badge: string }> = {
    stable: { label: "Stable", dot: "bg-emerald-400", badge: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
    flagged: { label: "Flagged", dot: "bg-orange-400", badge: "text-orange-400 bg-orange-400/10 border-orange-400/20" },
    pending: { label: "Pending", dot: "bg-yellow-400", badge: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" },
    locked: { label: "Locked", dot: "bg-white/30", badge: "text-white/40 bg-white/5 border-white/10" },
};

const STRICTNESS_CFG: Record<StrictnessMode, { label: string; color: string; icon: React.ElementType }> = {
    visibility: { label: "Visibility", color: "text-white/50 bg-white/5 border-white/10", icon: Eye },
    soft: { label: "Soft Enforcement", color: "text-amber-400 bg-amber-400/10 border-amber-400/20", icon: Shield },
    full: { label: "Full Governance", color: "text-violet-400 bg-violet-400/10 border-violet-400/20", icon: Lock },
};

// ─── Mini Avatar ──────────────────────────────────────────────────────────────

const Avatar = ({ initials, color, size = "sm" }: { initials: string; color: string; size?: "xs" | "sm" | "md" }) => {
    const sz = { xs: "h-5 w-5 text-[9px]", sm: "h-7 w-7 text-[10px]", md: "h-9 w-9 text-xs" }[size];
    return (
        <div className={cn("rounded-full bg-gradient-to-br flex items-center justify-center font-bold text-white shrink-0", sz, color)}>
            {initials}
        </div>
    );
};

// ─── Status Badge ─────────────────────────────────────────────────────────────

const StatusBadge = ({ status }: { status: ComponentStatus }) => {
    const cfg = STATUS_CFG[status];
    return (
        <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border", cfg.badge)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
            {cfg.label}
        </span>
    );
};

// ─── Component Card ───────────────────────────────────────────────────────────

const ComponentCard = ({
    component,
    isOwner,
    onOpenIDE,
    onMenuAction,
}: {
    component: ComponentItem;
    isOwner: boolean;
    onOpenIDE: (c: ComponentItem) => void;
    onMenuAction: (action: string, c: ComponentItem) => void | Promise<void>;
}) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const canEdit = isOwner || component.isMyComponent;
    const maxAvatars = 4;

    return (
        <div className={cn(
            "group relative bg-white/[0.03] hover:bg-white/[0.05] border rounded-2xl p-5 transition-all duration-300 overflow-hidden",
            component.status === "flagged" ? "border-orange-400/20" :
                component.status === "pending" ? "border-yellow-400/20" :
                    "border-white/[0.06] hover:border-white/[0.10]"
        )}>
            {/* Flagged/Pending pulse glow */}
            {(component.status === "flagged" || component.status === "pending") && (
                <div className={cn(
                    "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl",
                    component.status === "flagged" ? "shadow-[inset_0_0_30px_rgba(251,146,60,0.05)]" : "shadow-[inset_0_0_30px_rgba(251,191,36,0.05)]"
                )} />
            )}

            <div className="relative">
                {/* Header row */}
                <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                            <StatusBadge status={component.status} />
                            {component.activeChanges > 0 && (
                                <span className="text-[10px] text-orange-400/80 bg-orange-400/10 px-1.5 py-0.5 rounded-full border border-orange-400/15">
                                    {component.activeChanges} active
                                </span>
                            )}
                        </div>
                        <h3 className="text-[15px] font-semibold text-white leading-tight">{component.name}</h3>
                    </div>

                    {/* Owner-only menu */}
                    {isOwner && (
                        <div className="relative ml-2">
                            <button
                                id={`menu-${component.id}`}
                                onClick={() => setMenuOpen(v => !v)}
                                className="p-1 rounded-lg text-white/20 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
                            >
                                <MoreHorizontal className="h-4 w-4" />
                            </button>
                            {menuOpen && (
                                <div className="absolute right-0 top-8 z-30 w-48 bg-zinc-950 border border-white/10 rounded-xl overflow-hidden shadow-2xl">
                                    {[
                                        { icon: Pencil, label: "Rename component", action: "rename" },
                                        { icon: FolderPlus, label: "Add files", action: "add-files" },
                                        { icon: FileMinus, label: "Remove files", action: "remove-files" },
                                        { icon: Users, label: "Manage contributors", action: "contributors" },
                                        { icon: component.status === "locked" ? RefreshCw : Lock, label: component.status === "locked" ? "Unlock component" : "Lock component", action: "lock" },
                                        { icon: Trash2, label: "Delete component", action: "delete", danger: true },
                                    ].map(({ icon: Icon, label, action, danger }) => (
                                        <button
                                            key={action}
                                            onClick={() => { setMenuOpen(false); onMenuAction(action, component); }}
                                            className={cn(
                                                "flex items-center gap-2.5 w-full px-3 py-2.5 text-left text-xs transition-colors",
                                                danger ? "text-rose-400 hover:bg-rose-400/10" : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                                            )}
                                        >
                                            <Icon className="h-3.5 w-3.5" />
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-3 text-[11px] text-white/35 mb-4">
                    <span className="flex items-center gap-1"><FileCode2 className="h-3 w-3" />{component.fileCount} files</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{component.lastActivity}</span>
                </div>

                {/* Contributors */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center">
                        {component.contributors.slice(0, maxAvatars).map((c, i) => (
                            <div key={c.user_id} style={{ marginLeft: i === 0 ? 0 : -6, zIndex: maxAvatars - i }} className="relative">
                                <Avatar initials={(c.display_name || 'U').split(' ').map(n => n[0]).join('').toUpperCase()} color="from-emerald-500 to-green-600" size="xs" />
                            </div>
                        ))}
                        {component.contributors.length > maxAvatars && (
                            <div className="h-5 w-5 rounded-full bg-white/10 flex items-center justify-center text-[9px] text-white/50 border-2 border-black" style={{ marginLeft: -6, zIndex: 0 }}>
                                +{component.contributors.length - maxAvatars}
                            </div>
                        )}
                    </div>

                    {/* Action button */}
                    <button
                        id={`ide-btn-${component.id}`}
                        onClick={() => onOpenIDE(component)}
                        className={cn(
                            "text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all",
                            canEdit
                                ? "bg-white/[0.08] hover:bg-white/15 border-white/10 hover:border-white/20 text-white"
                                : "bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.06] text-white/40 hover:text-white/60"
                        )}
                    >
                        {canEdit ? "Open in IDE" : "View"}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Active Changes Feed ──────────────────────────────────────────────────────

const ActiveChangesFeed = ({
    changes,
    onReview,
}: {
    changes: ActiveChange[];
    onReview: (change: ActiveChange) => void;
}) => (
    <aside className="w-72 shrink-0 border-l border-white/[0.06] flex flex-col bg-black/20">
        <div className="px-4 py-3 border-b border-white/[0.06]">
            <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Active Changes</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
            {changes.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center px-4">
                    <CheckCircle2 className="h-6 w-6 text-emerald-500/40 mb-2" />
                    <p className="text-xs text-white/25">All clear — no pending changes.</p>
                </div>
            ) : (
                changes.map((change) => (
                    <div key={change.id} className="px-4 py-4 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                        <div className="flex items-start gap-2.5 mb-2">
                            <Avatar initials={change.author.initials} color={change.author.color} size="xs" />
                            <p className="text-xs text-white/80 font-medium leading-snug flex-1">{change.title}</p>
                        </div>

                        <div className="text-[10px] text-white/35 mb-2 pl-7">
                            <span className="text-white/50">{change.sourceComponent}</span>
                            {" → "}
                            {change.affectedComponents.map((ac, i) => (
                                <span key={ac}>
                                    <span className="text-white/40">{ac}</span>
                                    {i < change.affectedComponents.length - 1 && ", "}
                                </span>
                            ))}
                        </div>

                        <div className="flex items-center justify-between pl-7">
                            <div className="space-y-0.5">
                                <div className="flex items-center gap-1">
                                    <div className="flex gap-0.5">
                                        {Array.from({ length: change.totalCount }).map((_, i) => (
                                            <div key={i} className={cn("h-1.5 w-3 rounded-full", i < change.acknowledgedCount ? "bg-emerald-500" : "bg-white/10")} />
                                        ))}
                                    </div>
                                    <span className="text-[10px] text-white/30">{change.acknowledgedCount}/{change.totalCount}</span>
                                </div>
                                <p className="text-[9px] text-white/20">{change.submittedAgo}</p>
                            </div>
                            <button
                                onClick={() => onReview(change)}
                                className="text-[10px] font-semibold text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1"
                            >
                                Review <ChevronRight className="h-3 w-3" />
                            </button>
                        </div>
                    </div>
                ))
            )}
        </div>
    </aside>
);

// ─── Invite Slide-Over ────────────────────────────────────────────────────────

const InviteSlideOver = ({
    project,
    onClose,
}: {
    project: ProjectData;
    onClose: () => void;
}) => {
    const [query, setQuery] = useState("");
    const [selectedComponent, setSelectedComponent] = useState<string>("");
    const [sentSuccess, setSentSuccess] = useState(false);

    const { data: users = [] } = useQuery({
        queryKey: ['users', query],
        queryFn: () => notificationsApi.searchUsers(query),
        enabled: query.length > 1
    });

    const createInvite = useMutation({
        mutationFn: (email: string) => notificationsApi.createInvite(project.id, email, selectedComponent || undefined),
        onSuccess: () => {
            setSentSuccess(true);
            setTimeout(() => { setSentSuccess(false); setQuery(""); setSelectedComponent(""); }, 3000);
        }
    });

    const handleSend = () => {
        if (!query) return;
        createInvite.mutate(query);
    };

    return (
        <>
            <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <aside className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-zinc-950 border-l border-white/10 flex flex-col shadow-2xl">
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                    <div>
                        <h2 className="text-sm font-bold text-white">Invite Contributor</h2>
                        <p className="text-[11px] text-white/35 mt-0.5">{project.name}</p>
                    </div>
                    <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    <div className="px-5 py-4 border-b border-white/[0.04] space-y-3">
                        {sentSuccess ? (
                            <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                                <Check className="h-4 w-4 text-emerald-400" />
                                <p className="text-xs text-emerald-400">Invite sent — they'll be looped in when they open Ripple.</p>
                            </div>
                        ) : (
                            <>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/20" />
                                    <input
                                        id="invite-search"
                                        type="text"
                                        value={query}
                                        onChange={e => setQuery(e.target.value)}
                                        placeholder="Name or email..."
                                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
                                    />
                                </div>

                                {users.length > 0 && (
                                    <div className="bg-black/50 border border-white/10 rounded-xl overflow-hidden">
                                        {users.map(u => (
                                            <button
                                                key={u.id}
                                                onClick={() => setQuery(u.email)}
                                                className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-white/[0.05] transition-colors"
                                            >
                                                <Avatar initials={u.handle?.substring(0, 2).toUpperCase() || "??"} color="from-violet-500 to-purple-600" size="xs" />
                                                <div className="text-left">
                                                    <p className="text-xs font-medium text-white">{u.name}</p>
                                                    <p className="text-[10px] text-white/30">{u.email}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                <select
                                    value={selectedComponent}
                                    onChange={e => setSelectedComponent(e.target.value)}
                                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white/60 focus:outline-none appearance-none"
                                >
                                    <option value="">Assign to component (optional)</option>
                                    {project.components.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>

                                <button
                                    id="send-invite-btn"
                                    onClick={handleSend}
                                    disabled={!query}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-white text-black text-sm font-bold rounded-xl hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <SendHorizonal className="h-4 w-4" />
                                    Send Invite
                                </button>
                            </>
                        )}
                    </div>

                    {/* Current contributors list */}
                    <div className="px-5 py-3">
                        <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-3">Current Contributors</p>
                        <div className="space-y-2">
                            {Array.from(
                                new Map(
                                    project.components.flatMap(c => c.contributors).map(ct => [ct.user_id, {
                                        id: ct.user_id,
                                        name: ct.display_name || 'Unknown',
                                        initials: (ct.display_name || 'U').split(' ').map(n => n[0]).join('').toUpperCase(),
                                        color: 'from-emerald-500 to-green-600'
                                    }])
                                ).values()
                            ).map(ct => (
                                <div key={ct.id} className="flex items-center gap-2.5">
                                    <Avatar initials={ct.initials} color={ct.color} size="xs" />
                                    <span className="text-xs text-white/60 flex-1">{ct.name}</span>
                                    <button className="text-[10px] text-white/20 hover:text-white/50 transition-colors">Remove</button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

interface ProjectOverviewPageProps {
    projectId?: string;
    onBack: () => void;
    onOpenIDE: (projectId: string, componentId: string, componentName: string, readOnly: boolean) => void;
    onViewGraph: (projectId: string) => void;
    onViewHistory: (projectId: string) => void;
    onReviewChange: (projectId: string, changeId: string) => void;
    onOpenSettings: (projectId: string) => void;
}

export const ProjectOverviewPage = ({
    projectId,
    onBack,
    onOpenIDE,
    onViewGraph,
    onViewHistory,
    onReviewChange,
    onOpenSettings,
}: ProjectOverviewPageProps) => {
    const { data: project, isLoading } = useQuery({
        queryKey: ['project', projectId],
        queryFn: () => projectId ? projectsApi.getProject(projectId) : Promise.reject("No projectId"),
        enabled: !!projectId
    });
    const queryClient = useQueryClient();

    const [showInvite, setShowInvite] = useState(false);
    const [menuAction, setMenuAction] = useState<{ action: string; component: ComponentItem } | null>(null);

    const handleMenuAction = async (action: string, component: ComponentItem) => {
        if (!project) return;
        try {
            if (action === "delete") {
                await componentsApi.delete(project.id, component.id);
            } else if (action === "lock") {
                await componentsApi.update(project.id, component.id, { status: component.status === "locked" ? "stable" : "locked" });
            } else if (action === "rename") {
                const newName = prompt("Enter new name:", component.name);
                if (newName) await componentsApi.update(project.id, component.id, { name: newName });
            }
            queryClient.invalidateQueries({ queryKey: ['project', project.id] });
        } catch (e) {
            console.error("Action failed", e);
        }
    };

    if (isLoading || !project) {
        return <div className="flex h-screen items-center justify-center bg-black text-white">Loading project...</div>;
    }

    const strictness = STRICTNESS_CFG[project.strictnessMode] || STRICTNESS_CFG.soft;
    const StrictnessIcon = strictness.icon;

    const totalContributors = new Set(project.components.flatMap(c => c.contributors.map(ct => ct.user_id))).size;

    const handleOpenIDE = (component: ComponentItem) => {
        const readOnly = !project.isOwner && !component.isMyComponent;
        onOpenIDE(project.id, component.id, component.name, readOnly);
    };

    return (
        <div className="flex h-screen bg-black text-white overflow-hidden relative">
            {/* Particle bg */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <Particles quantity={100} className="absolute inset-0 h-full w-full" color="#ffffff" staticity={90} size={0.25} />
            </div>

            {/* Main column */}
            <div className="relative z-10 flex-1 flex flex-col min-w-0">

                {/* ── Top Header ─────────────────────────────────────────────────── */}
                <header className="border-b border-white/[0.06] bg-black/30 backdrop-blur-sm shrink-0">
                    {/* Breadcrumb + actions row */}
                    <div className="flex items-center justify-between px-6 py-3 border-b border-white/[0.04]">
                        <div className="flex items-center gap-3">
                            {/* Logo */}
                            <div className="flex items-center gap-2 mr-2">
                                <div className="h-6 w-6 rounded-md bg-white flex items-center justify-center">
                                    <Waves className="h-3.5 w-3.5 text-black" />
                                </div>
                            </div>
                            <button
                                id="back-to-dashboard"
                                onClick={onBack}
                                className="flex items-center gap-1.5 text-white/40 hover:text-white transition-colors text-sm"
                            >
                                <ArrowLeft className="h-3.5 w-3.5" />
                                Dashboard
                            </button>
                            <span className="text-white/20">/</span>
                            <span className="text-sm font-semibold text-white">{project.name}</span>
                        </div>

                        {/* Right actions */}
                        <div className="flex items-center gap-2">
                            <button
                                id="view-graph-btn"
                                onClick={() => onViewGraph(project.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white/60 hover:text-white border border-white/[0.08] hover:border-white/20 rounded-lg transition-colors"
                            >
                                <Network className="h-3.5 w-3.5" />
                                View Graph
                            </button>
                            <button
                                id="view-history-btn"
                                onClick={() => onViewHistory(project.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white/60 hover:text-white border border-white/[0.08] hover:border-white/20 rounded-lg transition-colors"
                            >
                                <History className="h-3.5 w-3.5" />
                                View History
                            </button>
                            {project.isOwner && (
                                <>
                                    <button
                                        id="invite-btn"
                                        onClick={() => setShowInvite(true)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white/60 hover:text-white border border-white/[0.08] hover:border-white/20 rounded-lg transition-colors"
                                    >
                                        <UserPlus className="h-3.5 w-3.5" />
                                        Invite
                                    </button>
                                    <button
                                        id="project-settings-btn"
                                        onClick={() => onOpenSettings(project.id)}
                                        className="p-1.5 text-white/30 hover:text-white border border-white/[0.08] hover:border-white/20 rounded-lg transition-colors"
                                    >
                                        <Settings className="h-3.5 w-3.5" />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Project meta row */}
                    <div className="flex items-center gap-5 px-6 py-3">
                        <div className="flex items-center gap-2">
                            {project.owner ? (
                                <>
                                    <Avatar initials={project.owner.initials || "?"} color={project.owner.color} size="xs" />
                                    <span className="text-xs text-white/40">{project.owner.name}</span>
                                </>
                            ) : (
                                <span className="text-xs text-white/40">Loading...</span>
                            )}
                        </div>
                        <span className="text-white/15">·</span>
                        <span className="text-xs text-white/30">Created {project.createdAt}</span>
                        <span className="text-white/15">·</span>
                        <span className="text-xs text-white/40">{project.components.length} components</span>
                        <span className="text-white/15">·</span>
                        <span className="text-xs text-white/40">{totalContributors} contributors</span>
                        <span className="text-white/15">·</span>
                        <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border", strictness.color)}>
                            <StrictnessIcon className="h-3 w-3" />
                            {strictness.label}
                        </span>
                    </div>
                </header>

                {/* ── Content + Sidebar split ─────────────────────────────────────── */}
                <div className="flex flex-1 min-h-0">

                    {/* Main content */}
                    <main className="flex-1 overflow-y-auto px-6 py-6">
                        {/* Component count + action */}
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-sm font-semibold text-white/60">
                                Components
                                <span className="ml-2 text-white/25">{project.components.length}</span>
                            </h2>
                            {project.isOwner && (
                                <button
                                    id="add-component-btn"
                                    className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    Add component
                                </button>
                            )}
                        </div>

                        {/* Component Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {project.components.map((component) => (
                                <ComponentCard
                                    key={component.id}
                                    component={component}
                                    isOwner={project.isOwner}
                                    onOpenIDE={handleOpenIDE}
                                    onMenuAction={(action, c) => handleMenuAction(action, c)}
                                />
                            ))}
                        </div>
                    </main>

                    {/* Right sidebar — Active Changes Feed */}
                    <ActiveChangesFeed
                        changes={project.activeChanges || []}
                        onReview={(change) => onReviewChange(project.id, change.id)}
                    />
                </div>
            </div>

            {/* Invite slide-over */}
            {showInvite && (
                <InviteSlideOver project={project} onClose={() => setShowInvite(false)} />
            )}

            {/* Click-outside to close component menus */}
            {menuAction && (
                <div className="fixed inset-0 z-20" onClick={() => setMenuAction(null)} />
            )}
        </div>
    );
};
