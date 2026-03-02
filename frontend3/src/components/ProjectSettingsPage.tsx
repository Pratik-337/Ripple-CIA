import React, { useState, useRef } from "react";
import {
    ArrowLeft, Waves, Settings, Users, Shield, AlertTriangle,
    Check, ChevronDown, X, Loader2, Eye, Lock, Save,
    Mail, RotateCcw, Trash2, Archive, UserMinus, RefreshCw
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { Particles } from "@/src/components/ui/particles";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectsApi, notificationsApi, componentsApi } from "@/src/lib/api";
import { authStore } from "@/src/lib/authStore";

// ─── Types ───────────────────────────────────────────────────────────────────

type MemberRole = "Owner" | "Contributor" | "Viewer";
type StrictnessMode = "visibility" | "soft" | "full";
type NavSection = "general" | "members" | "strictness" | "danger";

interface Member {
    id: string;
    name: string;
    initials: string;
    color: string;
    email: string;
    role: MemberRole;
    components: string[];
    isYou: boolean;
}

interface PendingInvite {
    id: string;
    email: string;
    component: string;
    sentAgo: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const INITIAL_MEMBERS: Member[] = [
    {
        id: "me", name: "Alex Rivera", initials: "AR", color: "from-violet-500 to-purple-600",
        email: "alex@co.com", role: "Owner", components: ["All components"], isYou: true,
    },
    {
        id: "u2", name: "Priya Sharma", initials: "PS", color: "from-emerald-500 to-green-600",
        email: "priya@co.com", role: "Contributor", components: ["Authentication", "Dashboard UI"], isYou: false,
    },
    {
        id: "u3", name: "Raj Patel", initials: "RP", color: "from-amber-500 to-orange-600",
        email: "raj@co.com", role: "Contributor", components: ["Checkout & Payment"], isYou: false,
    },
    {
        id: "u4", name: "Sarah Chen", initials: "SC", color: "from-rose-500 to-pink-600",
        email: "sarah@co.com", role: "Contributor", components: ["Authentication", "Dashboard UI"], isYou: false,
    },
    {
        id: "u5", name: "Mia Wong", initials: "MW", color: "from-cyan-500 to-teal-600",
        email: "mia@co.com", role: "Viewer", components: ["Search & Indexing"], isYou: false,
    },
];

const INITIAL_INVITES: PendingInvite[] = [
    { id: "inv1", email: "dev@company.com", component: "Checkout & Payment", sentAgo: "2 days ago" },
    { id: "inv2", email: "ops@company.com", component: "API Gateway", sentAgo: "5 days ago" },
];

const STRICTNESS_OPTIONS: {
    key: StrictnessMode;
    label: string;
    subtitle: string;
    gates: string[];
    icon: React.ElementType;
    activeColor: string;
    activeBorder: string;
    activeBg: string;
}[] = [
        {
            key: "visibility",
            label: "Visibility",
            subtitle: "Map changes. No friction.",
            gates: [
                "Changes are visible to all contributors",
                "No acknowledgement required before merge",
                "Owner can merge any time",
                "CI pipeline optional",
            ],
            icon: Eye,
            activeColor: "text-white",
            activeBorder: "border-white/30",
            activeBg: "bg-white/[0.06]",
        },
        {
            key: "soft",
            label: "Soft Enforcement",
            subtitle: "CI must pass. Reviews encouraged.",
            gates: [
                "Affected contributors are notified",
                "CI pipeline must pass before merge",
                "Acknowledgement tracked but not required",
                "Owner can override if needed",
            ],
            icon: Shield,
            activeColor: "text-amber-400",
            activeBorder: "border-amber-400/40",
            activeBg: "bg-amber-400/[0.07]",
        },
        {
            key: "full",
            label: "Full Governance",
            subtitle: "Everyone must confirm. No exceptions.",
            gates: [
                "All affected contributors must acknowledge",
                "CI pipeline must pass",
                "No merge until all gates are met",
                "Full audit trail of every approval",
            ],
            icon: Lock,
            activeColor: "text-violet-400",
            activeBorder: "border-violet-400/40",
            activeBg: "bg-violet-400/[0.07]",
        },
    ];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const Avatar = ({ initials, color, size = "sm" }: { initials: string; color: string; size?: "sm" | "md" }) => {
    const sz = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm" }[size];
    return (
        <div className={cn("rounded-full bg-gradient-to-br flex items-center justify-center font-bold text-white shrink-0", sz, color)}>
            {initials}
        </div>
    );
};

const SectionHeader = ({ title, description }: { title: string; description?: string }) => (
    <div className="mb-6">
        <h2 className="text-base font-bold text-white">{title}</h2>
        {description && <p className="text-sm text-white/40 mt-1 leading-relaxed">{description}</p>}
    </div>
);

// ─── Role Dropdown ────────────────────────────────────────────────────────────

const RoleDropdown = ({ value, onChange }: { value: MemberRole; onChange: (r: MemberRole) => void }) => {
    const [open, setOpen] = useState(false);
    const roles: MemberRole[] = ["Contributor", "Viewer"];

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(v => !v)}
                className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/20 px-2.5 py-1.5 rounded-lg transition-all"
            >
                {value}
                <ChevronDown className="h-3 w-3" />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-9 z-20 w-36 bg-zinc-950 border border-white/10 rounded-xl overflow-hidden shadow-2xl">
                        {roles.map(r => (
                            <button
                                key={r}
                                onClick={() => { onChange(r); setOpen(false); }}
                                className={cn(
                                    "flex items-center justify-between w-full px-3 py-2.5 text-left text-xs transition-colors",
                                    r === value ? "text-white bg-white/[0.06]" : "text-white/50 hover:bg-white/[0.04] hover:text-white"
                                )}
                            >
                                {r}
                                {r === value && <Check className="h-3 w-3" />}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

// ─── Modals ───────────────────────────────────────────────────────────────────

const ArchiveModal = ({ projectName, onConfirm, onCancel }: { projectName: string; onConfirm: () => void; onCancel: () => void }) => {
    const [loading, setLoading] = useState(false);
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative bg-zinc-950 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                <div className="flex items-center gap-3 mb-4">
                    <div className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                        <Archive className="h-4 w-4 text-amber-400" />
                    </div>
                    <h3 className="text-sm font-bold text-white">Archive this project?</h3>
                </div>
                <p className="text-xs text-white/40 leading-relaxed mb-6">
                    Archived projects are hidden from your dashboard but all data is preserved. You can restore it at any time from your account settings.
                </p>
                <div className="flex gap-2">
                    <button onClick={onCancel} className="flex-1 py-2.5 text-xs font-medium text-white/40 hover:text-white border border-white/10 hover:border-white/20 rounded-xl transition-colors">
                        Cancel
                    </button>
                    <button
                        id="confirm-archive-btn"
                        onClick={() => { setLoading(true); setTimeout(() => { setLoading(false); onConfirm(); }, 1200); }}
                        disabled={loading}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded-xl transition-colors disabled:opacity-60"
                    >
                        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                        {loading ? "Archiving..." : "Archive Project"}
                    </button>
                </div>
            </div>
        </div>
    );
};

const DeleteModal = ({
    projectName,
    onConfirm,
    onCancel,
}: {
    projectName: string;
    onConfirm: () => void;
    onCancel: () => void;
}) => {
    const [value, setValue] = useState("");
    const [loading, setLoading] = useState(false);
    const matches = value === projectName;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative bg-zinc-950 border border-rose-500/20 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                <div className="flex items-center gap-3 mb-4">
                    <div className="h-9 w-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                        <Trash2 className="h-4 w-4 text-rose-400" />
                    </div>
                    <h3 className="text-sm font-bold text-white">Delete this project permanently?</h3>
                </div>
                <p className="text-xs text-white/40 leading-relaxed mb-5">
                    This will delete all components, files, change history, and contributor assignments. <span className="text-rose-400/80 font-medium">This cannot be undone.</span>
                </p>
                <div className="mb-5">
                    <label className="text-[11px] text-white/40 block mb-2">
                        Type <span className="font-mono text-white/70 bg-white/[0.06] px-1.5 py-0.5 rounded">{projectName}</span> to confirm:
                    </label>
                    <input
                        id="delete-confirm-input"
                        type="text"
                        value={value}
                        onChange={e => setValue(e.target.value)}
                        placeholder={projectName}
                        autoFocus
                        className={cn(
                            "w-full bg-white/[0.04] border rounded-xl px-3 py-2.5 text-sm font-mono text-white placeholder:text-white/15 focus:outline-none transition-colors",
                            matches ? "border-rose-500/50 focus:border-rose-500" : "border-white/[0.08] focus:border-white/20"
                        )}
                    />
                </div>
                <div className="flex gap-2">
                    <button onClick={onCancel} className="flex-1 py-2.5 text-xs font-medium text-white/40 hover:text-white border border-white/10 hover:border-white/20 rounded-xl transition-colors">
                        Cancel
                    </button>
                    <button
                        id="confirm-delete-btn"
                        onClick={() => { setLoading(true); setTimeout(() => { setLoading(false); onConfirm(); }, 1500); }}
                        disabled={!matches || loading}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        {loading ? "Deleting..." : "Delete Project"}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Sections ─────────────────────────────────────────────────────────────────

// General
const GeneralSection = ({ projectName, description }: { projectName: string; description: string }) => {
    const [name, setName] = useState(projectName);
    const [desc, setDesc] = useState(description);
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const isDirty = name !== projectName || desc !== description;

    const handleSave = () => {
        setSaving(true);
        setTimeout(() => { setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2500); }, 900);
    };

    return (
        <div>
            <SectionHeader title="General" description="Basic information about this project." />
            <div className="space-y-5 max-w-lg">
                <div>
                    <label className="text-xs font-medium text-white/50 block mb-2">Project name</label>
                    <input
                        id="settings-project-name"
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/25 transition-colors"
                    />
                </div>
                <div>
                    <label className="text-xs font-medium text-white/50 block mb-2">Description</label>
                    <textarea
                        id="settings-description"
                        value={desc}
                        onChange={e => setDesc(e.target.value)}
                        rows={3}
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/25 transition-colors resize-none"
                    />
                </div>
                <button
                    id="save-general-btn"
                    onClick={handleSave}
                    disabled={!isDirty || saving}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all",
                        saved
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : isDirty
                                ? "bg-white text-black hover:bg-white/90"
                                : "bg-white/5 text-white/25 cursor-not-allowed"
                    )}
                >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                    {saving ? "Saving..." : saved ? "Saved" : "Save changes"}
                </button>
            </div>
        </div>
    );
};

// Members
const MembersSection = ({ projectId }: { projectId: string }) => {
    const queryClient = useQueryClient();
    const { data: project } = useQuery({
        queryKey: ['project', projectId],
        queryFn: () => projectsApi.getProject(projectId),
    });
    const { data: invites = [] } = useQuery({
        queryKey: ['project-invites', projectId],
        queryFn: () => projectsApi.getInvites(projectId)
    });
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => authStore.getState().accessToken ? import('@/src/lib/api').then(m => m.authApi.me()) : Promise.resolve(null)
    });

    // Build members list from project data
    const members: Member[] = React.useMemo(() => {
        if (!project) return [];
        const memberMap = new Map<string, Member>();
        
        // Add owner
        if (project.owner) {
            memberMap.set(project.owner.id, {
                id: project.owner.id,
                name: project.owner.name,
                initials: project.owner.initials,
                color: project.owner.color,
                email: '',
                role: project.isOwner ? 'Owner' as MemberRole : 'Contributor' as MemberRole,
                components: ['All components'],
                isYou: currentUser?.user?.id === project.owner.id,
            });
        }
        
        // Add contributors from components
        project.components?.forEach(comp => {
            comp.contributors?.forEach(contrib => {
                const existing = memberMap.get(contrib.user_id);
                const componentNames = existing ? [...existing.components, comp.name] : [comp.name];
                memberMap.set(contrib.user_id, {
                    id: contrib.user_id,
                    name: contrib.display_name || 'Unknown',
                    initials: (contrib.display_name || 'U').split(' ').map(n => n[0]).join('').toUpperCase(),
                    color: 'from-emerald-500 to-green-600',
                    email: contrib.email || '',
                    role: contrib.role === 'owner' ? 'Owner' as MemberRole : 'Contributor' as MemberRole,
                    components: componentNames,
                    isYou: currentUser?.user?.id === contrib.user_id,
                });
            });
        });
        
        return Array.from(memberMap.values());
    }, [project, currentUser]);

    const [invitesList, setInvites] = useState<PendingInvite[]>(invites.map((i: any) => ({
        id: i.id,
        email: i.email,
        component: i.component_name || 'All components',
        sentAgo: new Date(i.created_at).toLocaleDateString(),
    })));
    const [removingId, setRemovingId] = useState<string | null>(null);
    const [resentId, setResentId] = useState<string | null>(null);

    // Note: Role changes and member removal require backend API endpoints - not yet implemented
    const handleRoleChange = (_id: string, _role: MemberRole) => {
        // TODO: Add API call when backend supports it
    };

    const handleRemove = (_id: string) => {
        // TODO: Add API call when backend supports it
    };

    const handleResend = (id: string) => {
        setResentId(id);
        setTimeout(() => setResentId(null), 2500);
    };

    const handleCancelInvite = (id: string) => {
        setInvites(prev => prev.filter(i => i.id !== id));
    };

    return (
        <div>
            <SectionHeader
                title="Members"
                description="Manage who has access to this project and what they can do."
            />

            {/* Active contributors */}
            <div className="mb-8">
                <p className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-3">
                    Contributors — {members.length}
                </p>
                <div className="border border-white/[0.06] rounded-2xl overflow-hidden divide-y divide-white/[0.04]">
                    {members.map(member => (
                        <div
                            key={member.id}
                            className={cn(
                                "flex items-center gap-4 px-4 py-3.5 transition-all",
                                removingId === member.id ? "opacity-0 scale-98" : "opacity-100",
                                member.isYou ? "bg-white/[0.02]" : "hover:bg-white/[0.02]"
                            )}
                        >
                            <Avatar initials={member.initials} color={member.color} size="sm" />

                            {/* Name + email */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-white truncate">{member.name}</p>
                                    {member.isYou && (
                                        <span className="text-[10px] text-white/30 bg-white/[0.05] border border-white/[0.08] px-1.5 py-0.5 rounded-full">You</span>
                                    )}
                                </div>
                                <p className="text-[11px] text-white/30 truncate">{member.email}</p>
                            </div>

                            {/* Components */}
                            <div className="hidden md:flex items-center gap-1 max-w-[220px] flex-wrap">
                                {member.components.slice(0, 2).map(c => (
                                    <span key={c} className="text-[10px] text-white/40 bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                        {c}
                                    </span>
                                ))}
                                {member.components.length > 2 && (
                                    <span className="text-[10px] text-white/25">+{member.components.length - 2}</span>
                                )}
                            </div>

                            {/* Role + actions */}
                            <div className="flex items-center gap-2 shrink-0">
                                {member.isYou ? (
                                    <span className="text-xs text-white/30 px-2.5 py-1.5 bg-white/[0.03] border border-white/[0.06] rounded-lg">Owner</span>
                                ) : (
                                    <>
                                        <RoleDropdown value={member.role} onChange={r => handleRoleChange(member.id, r)} />
                                        <button
                                            id={`remove-member-${member.id}`}
                                            onClick={() => handleRemove(member.id)}
                                            disabled={removingId === member.id}
                                            className="p-1.5 text-white/20 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-colors"
                                            title="Remove from project"
                                        >
                                            <UserMinus className="h-3.5 w-3.5" />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Pending invites */}
            {invites.length > 0 && (
                <div>
                    <p className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-3">
                        Pending invites — {invites.length}
                    </p>
                    <div className="border border-white/[0.06] rounded-2xl overflow-hidden divide-y divide-white/[0.04]">
                        {invites.map(invite => (
                            <div key={invite.id} className="flex items-center gap-4 px-4 py-3.5 hover:bg-white/[0.02] transition-colors">
                                <div className="h-8 w-8 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
                                    <Mail className="h-3.5 w-3.5 text-white/30" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white/70 truncate">{invite.email}</p>
                                    <p className="text-[11px] text-white/30">{invite.component_name} · Sent {new Date(invite.created_at).toLocaleDateString()}</p>
                                </div>
                                <span className="text-[10px] text-white/30 bg-white/[0.04] border border-white/[0.06] px-2 py-1 rounded-full">Pending</span>
                                <div className="flex items-center gap-2 shrink-0">
                                    {resentId === invite.id ? (
                                        <span className="text-[11px] text-emerald-400 flex items-center gap-1"><Check className="h-3 w-3" />Resent</span>
                                    ) : (
                                        <button
                                            id={`resend-invite-${invite.id}`}
                                            onClick={() => handleResend(invite.id)}
                                            className="text-[11px] text-white/40 hover:text-white border border-white/[0.08] hover:border-white/20 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                                        >
                                            <RefreshCw className="h-3 w-3" />
                                            Resend
                                        </button>
                                    )}
                                    <button
                                        id={`cancel-invite-${invite.id}`}
                                        onClick={() => handleCancelInvite(invite.id)}
                                        className="p-1.5 text-white/20 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-colors"
                                        title="Cancel invite"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// Strictness Mode
const StrictnessSection = ({ current }: { current: StrictnessMode }) => {
    const [selected, setSelected] = useState<StrictnessMode>(current);
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const isDirty = selected !== current;

    const handleSave = () => {
        setSaving(true);
        setTimeout(() => { setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2500); }, 900);
    };

    return (
        <div>
            <SectionHeader
                title="Strictness Mode"
                description="Controls how much confirmation is required before a change can be merged. This applies to all components in this project."
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {STRICTNESS_OPTIONS.map(opt => {
                    const Icon = opt.icon;
                    const isSelected = selected === opt.key;
                    return (
                        <button
                            key={opt.key}
                            id={`strictness-${opt.key}`}
                            onClick={() => setSelected(opt.key)}
                            className={cn(
                                "text-left p-5 rounded-2xl border transition-all duration-200",
                                isSelected
                                    ? cn(opt.activeBg, opt.activeBorder, "shadow-sm")
                                    : "bg-white/[0.02] border-white/[0.06] hover:border-white/15 hover:bg-white/[0.04]"
                            )}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className={cn(
                                    "h-8 w-8 rounded-xl flex items-center justify-center border",
                                    isSelected ? cn(opt.activeBg, opt.activeBorder) : "bg-white/[0.04] border-white/[0.08]"
                                )}>
                                    <Icon className={cn("h-4 w-4", isSelected ? opt.activeColor : "text-white/30")} />
                                </div>
                                {isSelected && (
                                    <div className="h-5 w-5 rounded-full bg-white/10 flex items-center justify-center">
                                        <Check className="h-3 w-3 text-white" />
                                    </div>
                                )}
                            </div>
                            <p className={cn("text-sm font-bold mb-0.5", isSelected ? opt.activeColor : "text-white")}>{opt.label}</p>
                            <p className="text-[11px] text-white/35 mb-3">{opt.subtitle}</p>
                            <ul className="space-y-1.5">
                                {opt.gates.map(gate => (
                                    <li key={gate} className="flex items-start gap-2 text-[11px] text-white/40">
                                        <span className={cn("h-3.5 w-3.5 rounded-full flex items-center justify-center shrink-0 mt-0.5 border",
                                            isSelected ? cn(opt.activeBg, opt.activeBorder) : "bg-white/[0.04] border-white/[0.08]"
                                        )}>
                                            <Check className={cn("h-2 w-2", isSelected ? opt.activeColor : "text-white/25")} />
                                        </span>
                                        {gate}
                                    </li>
                                ))}
                            </ul>
                        </button>
                    );
                })}
            </div>

            <button
                id="save-strictness-btn"
                onClick={handleSave}
                disabled={!isDirty || saving}
                className={cn(
                    "flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all",
                    saved
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        : isDirty
                            ? "bg-white text-black hover:bg-white/90"
                            : "bg-white/5 text-white/25 cursor-not-allowed"
                )}
            >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                {saving ? "Saving..." : saved ? "Saved" : "Save changes"}
            </button>
        </div>
    );
};

// Danger Zone
const DangerSection = ({
    projectName,
    onArchived,
    onDeleted,
    isDeleting,
    isArchiving,
}: {
    projectName: string;
    onArchived: () => void;
    onDeleted: () => void;
    isDeleting?: boolean;
    isArchiving?: boolean;
}) => {
    const [showArchive, setShowArchive] = useState(false);
    const [showDelete, setShowDelete] = useState(false);

    return (
        <div>
            <SectionHeader title="Danger Zone" />

            <div className="border border-rose-500/20 rounded-2xl overflow-hidden divide-y divide-rose-500/10">
                {/* Archive */}
                <div className="flex items-center justify-between px-5 py-4">
                    <div>
                        <p className="text-sm font-semibold text-white">Archive project</p>
                        <p className="text-xs text-white/35 mt-0.5">
                            Hide from your dashboard. All data preserved — restore any time from account settings.
                        </p>
                    </div>
                    <button
                        id="archive-project-btn"
                        onClick={() => setShowArchive(true)}
                        disabled={isArchiving}
                        className="shrink-0 ml-8 flex items-center gap-2 px-4 py-2 text-xs font-semibold text-amber-400 border border-amber-400/30 hover:border-amber-400/60 hover:bg-amber-400/10 rounded-xl transition-colors disabled:opacity-50"
                    >
                        {isArchiving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                        {isArchiving ? 'Archiving...' : 'Archive'}
                    </button>
                </div>

                {/* Delete */}
                <div className="flex items-center justify-between px-5 py-4">
                    <div>
                        <p className="text-sm font-semibold text-white">Delete project permanently</p>
                        <p className="text-xs text-white/35 mt-0.5">
                            Deletes all components, files, change history, and contributor assignments. Cannot be undone.
                        </p>
                    </div>
                    <button
                        id="delete-project-btn"
                        onClick={() => setShowDelete(true)}
                        disabled={isDeleting}
                        className="shrink-0 ml-8 flex items-center gap-2 px-4 py-2 text-xs font-semibold text-rose-400 border border-rose-400/30 hover:border-rose-400/60 hover:bg-rose-400/10 rounded-xl transition-colors disabled:opacity-50"
                    >
                        {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        {isDeleting ? 'Deleting...' : 'Delete'}
                    </button>
                </div>
            </div>

            {showArchive && (
                <ArchiveModal
                    projectName={projectName}
                    onConfirm={() => { setShowArchive(false); onArchived(); }}
                    onCancel={() => setShowArchive(false)}
                />
            )}
            {showDelete && (
                <DeleteModal
                    projectName={projectName}
                    onConfirm={() => { setShowDelete(false); onDeleted(); }}
                    onCancel={() => setShowDelete(false)}
                />
            )}
        </div>
    );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const NAV_ITEMS: { key: NavSection; label: string; icon: React.ElementType }[] = [
    { key: "general", label: "General", icon: Settings },
    { key: "members", label: "Members", icon: Users },
    { key: "strictness", label: "Strictness Mode", icon: Shield },
    { key: "danger", label: "Danger Zone", icon: AlertTriangle },
];

interface ProjectSettingsPageProps {
    projectId: string;
    onBack: () => void;
    onDeleted: () => void;
    onArchived: () => void;
}

export const ProjectSettingsPage = ({
    projectId,
    onBack,
    onDeleted,
    onArchived,
}: ProjectSettingsPageProps) => {
    const queryClient = useQueryClient();
    const { user: currentUser } = authStore();

    const { data: projectData, isLoading: loadingProj } = useQuery({
        queryKey: ['project', projectId],
        queryFn: () => projectsApi.getProject(projectId),
    });

    const { data: rawInvites = [], isLoading: loadingInvites } = useQuery({
        queryKey: ['project-invites', projectId],
        queryFn: () => projectsApi.getInvites(projectId)
    });

    const deleteMutation = useMutation({
        mutationFn: () => projectsApi.delete(projectId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            onDeleted();
        },
    });

    const archiveMutation = useMutation({
        mutationFn: () => projectsApi.delete(projectId, 'archive'),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            onArchived();
        },
    });

    const [activeSection, setActiveSection] = useState<NavSection>("general");
    const sectionRefs = useRef<Record<NavSection, HTMLDivElement | null>>({
        general: null, members: null, strictness: null, danger: null,
    });

    const scrollTo = (key: NavSection) => {
        setActiveSection(key);
        sectionRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    return (
        <div className="flex h-screen bg-black text-white overflow-hidden relative">
            <div className="fixed inset-0 z-0 pointer-events-none">
                <Particles quantity={80} className="absolute inset-0 h-full w-full" color="#ffffff" staticity={92} size={0.22} />
            </div>

            <div className="relative z-10 flex w-full">

                {/* ── Left Sidebar Nav ───────────────────────────────────────────── */}
                <aside className="w-56 shrink-0 border-r border-white/[0.06] flex flex-col bg-black/30 backdrop-blur-sm">
                    {/* Brand + back */}
                    <div className="px-4 pt-4 pb-3 border-b border-white/[0.04]">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="h-5 w-5 rounded bg-white flex items-center justify-center">
                                <Waves className="h-3 w-3 text-black" />
                            </div>
                            <span className="text-xs font-bold text-white">Ripple</span>
                        </div>
                        <button
                            id="settings-back-btn"
                            onClick={onBack}
                            className="flex items-center gap-1.5 text-xs text-white/35 hover:text-white transition-colors"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            Back to project
                        </button>
                    </div>

                    {/* Project pill */}
                    <div className="px-4 py-3 border-b border-white/[0.04]">
                        <p className="text-[10px] font-semibold text-white/25 uppercase tracking-wider mb-1.5">Settings for</p>
                        <p className="text-xs font-semibold text-white truncate">{projectData?.name || "Loading..."}</p>
                    </div>

                    {/* Nav items */}
                    <nav className="flex-1 px-2 py-3 space-y-0.5">
                        {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
                            <button
                                key={key}
                                id={`nav-${key}`}
                                onClick={() => scrollTo(key)}
                                className={cn(
                                    "flex items-center gap-2.5 w-full px-3 py-2 text-xs font-medium rounded-xl transition-colors text-left",
                                    activeSection === key
                                        ? key === "danger"
                                            ? "bg-rose-500/10 text-rose-400"
                                            : "bg-white/[0.08] text-white"
                                        : "text-white/40 hover:text-white hover:bg-white/[0.04]"
                                )}
                            >
                                <Icon className={cn("h-3.5 w-3.5 shrink-0", key === "danger" && activeSection === key ? "text-rose-400" : "")} />
                                {label}
                            </button>
                        ))}
                    </nav>
                </aside>

                {/* ── Main Content ──────────────────────────────────────────────── */}
                <main className="flex-1 overflow-y-auto" onScroll={e => {
                    // Update active section based on scroll position
                    const scrollTop = (e.target as HTMLElement).scrollTop + 120;
                    const keys: NavSection[] = ["general", "members", "strictness", "danger"];
                    for (let i = keys.length - 1; i >= 0; i--) {
                        const el = sectionRefs.current[keys[i]];
                        if (el && el.offsetTop <= scrollTop) { setActiveSection(keys[i]); break; }
                    }
                }}>
                    <div className="max-w-3xl mx-auto px-8 py-10 space-y-16">

                        {/* General */}
                        <div ref={el => { sectionRefs.current.general = el; }}>
                            <GeneralSection projectName={projectData?.name || ""} description={projectData?.description || ""} />
                        </div>

                        {/* Divider */}
                        <div className="h-px bg-white/[0.04]" />

                        {/* Members */}
                        <div ref={el => { sectionRefs.current.members = el; }}>
                            <MembersSection projectId={projectId} />
                        </div>

                        <div className="h-px bg-white/[0.04]" />

                        {/* Strictness Mode */}
                        <div ref={el => { sectionRefs.current.strictness = el; }}>
                            <StrictnessSection current={projectData?.strictnessMode as StrictnessMode || "visibility"} />
                        </div>

                        <div className="h-px bg-white/[0.04]" />

                        {/* Danger Zone */}
                        <div ref={el => { sectionRefs.current.danger = el; }}>
                            <DangerSection
                                projectName={projectData?.name || ""}
                                onArchived={() => archiveMutation.mutate()}
                                onDeleted={() => deleteMutation.mutate()}
                                isDeleting={deleteMutation.isPending}
                                isArchiving={archiveMutation.isPending}
                            />
                        </div>

                        {/* Bottom padding */}
                        <div className="h-16" />
                    </div>
                </main>
            </div>
        </div>
    );
};
