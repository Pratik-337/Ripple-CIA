import React, { useState, useRef, useEffect } from "react";
import {
    ArrowLeft, Waves, User, Mail, Lock, Bell,
    Check, Loader2, Eye, EyeOff, Save, Camera,
    CheckCircle2, AlertCircle, BellOff, BellRing, Globe
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { Particles } from "@/src/components/ui/particles";
import { authApi, usersApi, type UserProfile } from "@/src/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

type NavSection = "profile" | "password" | "notifications";

interface NotifPrefs {
    changeReviewAssigned: boolean;
    changeReviewMentioned: boolean;
    changeMerged: boolean;
    inviteReceived: boolean;
    nudgeReceived: boolean;
    weeklyDigest: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SaveButton = ({
    id,
    dirty,
    saving,
    saved,
    onClick,
}: {
    id: string;
    dirty: boolean;
    saving: boolean;
    saved: boolean;
    onClick: () => void;
}) => (
    <button
        id={id}
        onClick={onClick}
        disabled={!dirty || saving}
        className={cn(
            "flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all",
            saved
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                : dirty
                    ? "bg-white text-black hover:bg-white/90"
                    : "bg-white/5 text-white/25 cursor-not-allowed"
        )}
    >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
        {saving ? "Saving..." : saved ? "Saved" : "Save changes"}
    </button>
);

const useSaveState = () => {
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const trigger = () => {
        setSaving(true);
        setTimeout(() => {
            setSaving(false);
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        }, 900);
    };
    return { saving, saved, trigger };
};

// ─── Avatar Upload ────────────────────────────────────────────────────────────

const AvatarUpload = ({
    initials,
    color,
    onUpload,
}: {
    initials: string;
    color: string;
    onUpload: (file: File) => void;
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [hovering, setHovering] = useState(false);

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        setPreview(url);
        onUpload(file);
    };

    return (
        <div className="flex items-center gap-5">
            <div
                className="relative h-20 w-20 rounded-2xl cursor-pointer group"
                onMouseEnter={() => setHovering(true)}
                onMouseLeave={() => setHovering(false)}
                onClick={() => inputRef.current?.click()}
            >
                {preview ? (
                    <img src={preview} alt="Avatar" className="h-full w-full rounded-2xl object-cover" />
                ) : (
                    <div className={cn("h-full w-full rounded-2xl bg-gradient-to-br flex items-center justify-center text-2xl font-black text-white", color)}>
                        {initials}
                    </div>
                )}
                {/* Hover overlay */}
                <div className={cn(
                    "absolute inset-0 rounded-2xl bg-black/60 flex items-center justify-center transition-opacity",
                    hovering ? "opacity-100" : "opacity-0"
                )}>
                    <Camera className="h-5 w-5 text-white" />
                </div>
                <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            </div>
            <div>
                <p className="text-sm font-medium text-white mb-1">Profile photo</p>
                <p className="text-xs text-white/35">PNG or JPG up to 2 MB. Click the avatar to change.</p>
            </div>
        </div>
    );
};

// ─── Profile Section ──────────────────────────────────────────────────────────

const ProfileSection = () => {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [displayName, setDisplayName] = useState("");
    const [email, setEmail] = useState("");
    const [emailDirty, setEmailDirty] = useState(false);
    const [loading, setLoading] = useState(true);
    const { saving, saved, trigger } = useSaveState();

    useEffect(() => {
        const loadUser = async () => {
            try {
                const userData = await authApi.me();
                setUser(userData.user);
                setDisplayName(userData.user.display_name || "");
                setEmail(userData.user.email || "");
            } catch (err) {
                console.error("Failed to load user:", err);
            } finally {
                setLoading(false);
            }
        };
        loadUser();
    }, []);

    const initial = { name: user?.display_name || "", email: user?.email || "" };
    const isDirty = displayName !== initial.name || email !== initial.email;

    const handleSave = async () => {
        if (!isDirty || saving) return;
        trigger();
        try {
            await usersApi.updateProfile({ display_name: displayName });
            setUser(prev => prev ? { ...prev, display_name: displayName } : null);
        } catch (err) {
            console.error("Failed to update profile:", err);
        }
    };

    // Show loading state while fetching user data
    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-white/40" />
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center gap-2 mb-6">
                <User className="h-4 w-4 text-white/40" />
                <h2 className="text-base font-bold text-white">Profile</h2>
            </div>

            <div className="space-y-6 max-w-lg">
                {/* Avatar */}
                <AvatarUpload
                    initials={user?.display_name ? user.display_name.split(' ').map((n: string) => n[0]).join('').toUpperCase() : "U"}
                    color="from-violet-500 to-purple-600"
                    onUpload={() => { }}
                />

                {/* Display name */}
                <div>
                    <label className="text-xs font-medium text-white/50 block mb-2">Display name</label>
                    <input
                        id="profile-display-name"
                        type="text"
                        value={displayName}
                        onChange={e => setDisplayName(e.target.value)}
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-white/25 transition-colors"
                    />
                    <p className="text-[11px] text-white/25 mt-1.5">This is how you appear to others on Ripple.</p>
                </div>

                {/* Email */}
                <div>
                    <label className="text-xs font-medium text-white/50 block mb-2">Email address</label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/25" />
                        <input
                            id="profile-email"
                            type="email"
                            value={email}
                            onChange={e => { setEmail(e.target.value); setEmailDirty(true); }}
                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-9 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-white/25 transition-colors"
                        />
                    </div>
                    {emailDirty && email !== initial.email && (
                        <p className="text-[11px] text-amber-400/80 mt-1.5 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            You'll receive a confirmation email to verify this change.
                        </p>
                    )}
                </div>

                <SaveButton id="save-profile-btn" dirty={isDirty} saving={saving} saved={saved} onClick={handleSave} />
            </div>
        </div>
    );
};

// ─── Password Section ─────────────────────────────────────────────────────────

const PasswordSection = () => {
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNext, setShowNext] = useState(false);
    const { saving, saved, trigger } = useSaveState();

    const strength = (() => {
        if (!next) return null;
        let s = 0;
        if (next.length >= 8) s++;
        if (/[A-Z]/.test(next)) s++;
        if (/[0-9]/.test(next)) s++;
        if (/[^a-zA-Z0-9]/.test(next)) s++;
        return s;
    })();

    const strengthLabel = strength === null ? null : ["Weak", "Fair", "Good", "Strong"][strength - 1] ?? "Weak";
    const strengthColor = ["bg-rose-500", "bg-amber-500", "bg-yellow-400", "bg-emerald-500"][Math.max(0, (strength ?? 1) - 1)];

    const mismatch = confirm.length > 0 && next !== confirm;
    const canSave = current.length > 0 && next.length >= 8 && next === confirm && !mismatch;

    const handleSave = () => {
        if (!canSave) return;
        trigger();
        setTimeout(() => { setCurrent(""); setNext(""); setConfirm(""); }, 900);
    };

    return (
        <div>
            <div className="flex items-center gap-2 mb-6">
                <Lock className="h-4 w-4 text-white/40" />
                <h2 className="text-base font-bold text-white">Password</h2>
            </div>

            <div className="space-y-4 max-w-lg">
                {/* Current */}
                <div>
                    <label className="text-xs font-medium text-white/50 block mb-2">Current password</label>
                    <div className="relative">
                        <input
                            id="current-password"
                            type={showCurrent ? "text" : "password"}
                            value={current}
                            onChange={e => setCurrent(e.target.value)}
                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 pr-10 text-sm text-white focus:outline-none focus:border-white/25 transition-colors"
                        />
                        <button
                            type="button"
                            onClick={() => setShowCurrent(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white transition-colors"
                        >
                            {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </div>
                </div>

                {/* New */}
                <div>
                    <label className="text-xs font-medium text-white/50 block mb-2">New password</label>
                    <div className="relative">
                        <input
                            id="new-password"
                            type={showNext ? "text" : "password"}
                            value={next}
                            onChange={e => setNext(e.target.value)}
                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 pr-10 text-sm text-white focus:outline-none focus:border-white/25 transition-colors"
                        />
                        <button
                            type="button"
                            onClick={() => setShowNext(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white transition-colors"
                        >
                            {showNext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </div>

                    {/* Strength meter */}
                    {strength !== null && (
                        <div className="mt-2">
                            <div className="flex gap-1 mb-1">
                                {[1, 2, 3, 4].map(i => (
                                    <div
                                        key={i}
                                        className={cn("h-1 flex-1 rounded-full transition-all", i <= (strength ?? 0) ? strengthColor : "bg-white/10")}
                                    />
                                ))}
                            </div>
                            <p className={cn("text-[11px]",
                                strength >= 4 ? "text-emerald-400" : strength >= 3 ? "text-yellow-400" : strength >= 2 ? "text-amber-400" : "text-rose-400"
                            )}>{strengthLabel}</p>
                        </div>
                    )}
                </div>

                {/* Confirm */}
                <div>
                    <label className="text-xs font-medium text-white/50 block mb-2">Confirm new password</label>
                    <div className="relative">
                        <input
                            id="confirm-password"
                            type="password"
                            value={confirm}
                            onChange={e => setConfirm(e.target.value)}
                            className={cn(
                                "w-full bg-white/[0.04] border rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none transition-colors",
                                mismatch ? "border-rose-500/50" : "border-white/[0.08] focus:border-white/25"
                            )}
                        />
                        {confirm.length > 0 && !mismatch && (
                            <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-400" />
                        )}
                    </div>
                    {mismatch && <p className="text-[11px] text-rose-400 mt-1.5">Passwords don't match.</p>}
                </div>

                <button
                    id="save-password-btn"
                    onClick={handleSave}
                    disabled={!canSave || saving}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all",
                        saved
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : canSave
                                ? "bg-white text-black hover:bg-white/90"
                                : "bg-white/5 text-white/25 cursor-not-allowed"
                    )}
                >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                    {saving ? "Updating..." : saved ? "Updated" : "Update password"}
                </button>
            </div>
        </div>
    );
};

// ─── Notification Section ─────────────────────────────────────────────────────

const NotificationsSection = () => {
    const [prefs, setPrefs] = useState<NotifPrefs>({
        changeReviewAssigned: true,
        changeReviewMentioned: true,
        changeMerged: true,
        inviteReceived: true,
        nudgeReceived: false,
        weeklyDigest: true,
    });
    const [initialPrefs] = useState(prefs);
    const isDirty = JSON.stringify(prefs) !== JSON.stringify(initialPrefs);
    const { saving, saved, trigger } = useSaveState();

    const toggle = (key: keyof NotifPrefs) => setPrefs(p => ({ ...p, [key]: !p[key] }));

    const Toggle = ({ prefKey, label, description }: { prefKey: keyof NotifPrefs; label: string; description: string }) => (
        <div className="flex items-center justify-between py-3.5 border-b border-white/[0.04] last:border-0">
            <div className="flex-1 mr-8">
                <p className="text-sm font-medium text-white">{label}</p>
                <p className="text-[11px] text-white/35 mt-0.5">{description}</p>
            </div>
            <button
                id={`notif-${prefKey}`}
                onClick={() => toggle(prefKey)}
                className={cn(
                    "relative h-5 w-9 rounded-full transition-all shrink-0",
                    prefs[prefKey] ? "bg-white" : "bg-white/[0.12]"
                )}
            >
                <span className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-black transition-transform shadow-sm",
                    prefs[prefKey] ? "left-4" : "left-0.5"
                )} />
            </button>
        </div>
    );

    return (
        <div>
            <div className="flex items-center gap-2 mb-6">
                <Bell className="h-4 w-4 text-white/40" />
                <h2 className="text-base font-bold text-white">Notifications</h2>
            </div>

            <p className="text-sm text-white/40 mb-6 max-w-lg">
                Choose what you get notified about. Email notifications are sent to your registered address.
            </p>

            <div className="max-w-lg border border-white/[0.06] rounded-2xl px-5 divide-y divide-white/[0.04] mb-6 overflow-hidden">
                {/* Change activity */}
                <div className="py-3">
                    <p className="text-[10px] font-semibold text-white/25 uppercase tracking-wider">Change Activity</p>
                </div>
                <Toggle
                    prefKey="changeReviewAssigned"
                    label="Assigned for review"
                    description="When a change affects your component and needs your confirmation."
                />
                <Toggle
                    prefKey="changeReviewMentioned"
                    label="Mentioned in a comment"
                    description="When someone mentions you in a change's comment thread."
                />
                <Toggle
                    prefKey="changeMerged"
                    label="Change merged"
                    description="When a change you were part of is approved and merged."
                />

                {/* Account */}
                <div className="py-3">
                    <p className="text-[10px] font-semibold text-white/25 uppercase tracking-wider">Account</p>
                </div>
                <Toggle
                    prefKey="inviteReceived"
                    label="Project invitations"
                    description="When someone invites you to collaborate on their project."
                />
                <Toggle
                    prefKey="nudgeReceived"
                    label="Nudges"
                    description="When a change author sends you a reminder to review their impact."
                />
                <Toggle
                    prefKey="weeklyDigest"
                    label="Weekly digest"
                    description="A weekly summary of activity across all your projects."
                />
            </div>

            <SaveButton id="save-notifications-btn" dirty={isDirty} saving={saving} saved={saved} onClick={trigger} />
        </div>
    );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const NAV_ITEMS: { key: NavSection; label: string; icon: React.ElementType }[] = [
    { key: "profile", label: "Profile", icon: User },
    { key: "password", label: "Password", icon: Lock },
    { key: "notifications", label: "Notifications", icon: Bell },
];

interface UserProfilePageProps {
    onBack: () => void;
}

export const UserProfilePage = ({ onBack }: UserProfilePageProps) => {
    const [activeSection, setActiveSection] = useState<NavSection>("profile");
    const sectionRefs = useRef<Record<NavSection, HTMLDivElement | null>>({
        profile: null, password: null, notifications: null,
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

                {/* ── Left Sidebar ──────────────────────────────────────────────── */}
                <aside className="w-56 shrink-0 border-r border-white/[0.06] flex flex-col bg-black/30 backdrop-blur-sm">
                    <div className="px-4 pt-4 pb-3 border-b border-white/[0.04]">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="h-5 w-5 rounded bg-white flex items-center justify-center">
                                <Waves className="h-3 w-3 text-black" />
                            </div>
                            <span className="text-xs font-bold text-white">Ripple</span>
                        </div>
                        <button
                            id="profile-back-btn"
                            onClick={onBack}
                            className="flex items-center gap-1.5 text-xs text-white/35 hover:text-white transition-colors"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            Back to dashboard
                        </button>
                    </div>

                    <div className="px-4 py-3 border-b border-white/[0.04]">
                        <p className="text-[10px] font-semibold text-white/25 uppercase tracking-wider mb-3">Account settings</p>
                        <div className="flex items-center gap-2.5">
                            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                                AR
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-semibold text-white truncate">Alex Rivera</p>
                                <p className="text-[10px] text-white/30 truncate">alex@co.com</p>
                            </div>
                        </div>
                    </div>

                    <nav className="flex-1 px-2 py-3 space-y-0.5">
                        {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
                            <button
                                key={key}
                                id={`profile-nav-${key}`}
                                onClick={() => scrollTo(key)}
                                className={cn(
                                    "flex items-center gap-2.5 w-full px-3 py-2 text-xs font-medium rounded-xl transition-colors text-left",
                                    activeSection === key
                                        ? "bg-white/[0.08] text-white"
                                        : "text-white/40 hover:text-white hover:bg-white/[0.04]"
                                )}
                            >
                                <Icon className="h-3.5 w-3.5 shrink-0" />
                                {label}
                            </button>
                        ))}
                    </nav>
                </aside>

                {/* ── Main Content ──────────────────────────────────────────────── */}
                <main
                    className="flex-1 overflow-y-auto"
                    onScroll={e => {
                        const scrollTop = (e.target as HTMLElement).scrollTop + 120;
                        const keys: NavSection[] = ["profile", "password", "notifications"];
                        for (let i = keys.length - 1; i >= 0; i--) {
                            const el = sectionRefs.current[keys[i]];
                            if (el && el.offsetTop <= scrollTop) { setActiveSection(keys[i]); break; }
                        }
                    }}
                >
                    <div className="max-w-2xl mx-auto px-8 py-10 space-y-16">
                        <div ref={el => { sectionRefs.current.profile = el; }}>
                            <ProfileSection />
                        </div>
                        <div className="h-px bg-white/[0.04]" />
                        <div ref={el => { sectionRefs.current.password = el; }}>
                            <PasswordSection />
                        </div>
                        <div className="h-px bg-white/[0.04]" />
                        <div ref={el => { sectionRefs.current.notifications = el; }}>
                            <NotificationsSection />
                        </div>
                        <div className="h-16" />
                    </div>
                </main>
            </div>
        </div>
    );
};
