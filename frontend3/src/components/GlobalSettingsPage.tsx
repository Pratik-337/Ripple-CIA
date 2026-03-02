import React, { useState, useEffect } from "react";
import { ArrowLeft, Settings, Bell, Shield, User, Monitor, Loader2 } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { Particles } from "./ui/particles";
import { authApi, type UserProfile } from "@/src/lib/api";

export const GlobalSettingsPage = ({ onBack }: { onBack: () => void }) => {
    const [activeTab, setActiveTab] = useState<"general" | "notifications" | "security">("general");
    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadUser = async () => {
            try {
                const userData = await authApi.me();
                setUser(userData.user);
            } catch (err) {
                console.error("Failed to load user:", err);
            } finally {
                setLoading(false);
            }
        };
        loadUser();
    }, []);

    const initials = user?.display_name 
        ? user.display_name.split(' ').map((n: string) => n[0]).join('').toUpperCase() 
        : "U";

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
                                <Settings className="h-4 w-4 text-white" />
                            </div>
                            <h1 className="text-lg font-bold">Settings</h1>
                        </div>
                    </div>
                </header>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 md:p-10 flex flex-col md:flex-row gap-8 max-w-6xl mx-auto w-full">
                    {/* Settings Navigation */}
                    <nav className="w-full md:w-64 shrink-0 flex flex-row md:flex-col gap-2 overflow-x-auto pb-4 md:pb-0">
                        {[
                            { id: "general", label: "General", icon: User },
                            { id: "notifications", label: "Notifications", icon: Bell },
                            { id: "security", label: "Security & Privacy", icon: Shield },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={cn(
                                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm whitespace-nowrap",
                                    activeTab === tab.id
                                        ? "bg-white/10 text-white"
                                        : "text-white/40 hover:bg-white/5 hover:text-white"
                                )}
                            >
                                <tab.icon className="h-4 w-4" />
                                {tab.label}
                            </button>
                        ))}
                    </nav>

                    {/* Settings Content */}
                    <div className="flex-1 max-w-2xl bg-white/[0.02] border border-white/[0.06] rounded-3xl p-8">
                        {activeTab === "general" && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div>
                                    <h2 className="text-xl font-bold mb-1">Profile</h2>
                                    <p className="text-sm text-white/40 mb-6">Manage your public profile information.</p>

                                    <div className="space-y-5">
                                        <div className="flex items-center gap-6">
                                            <div className="h-20 w-20 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white shadow-xl shrink-0">
                                                {loading ? <Loader2 className="h-8 w-8 animate-spin" /> : initials}
                                            </div>
                                            <div>
                                                <button className="bg-white/10 hover:bg-white/15 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors mb-2">
                                                    Change Avatar
                                                </button>
                                                <p className="text-xs text-white/30">JPG, GIF or PNG. Max size of 2MB.</p>
                                            </div>
                                        </div>

                                        <div className="grid gap-2">
                                            <label className="text-sm font-medium text-white/70">Display Name</label>
                                            <input
                                                type="text"
                                                defaultValue={user?.display_name || ""}
                                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50 transition-colors"
                                            />
                                        </div>

                                        <div className="grid gap-2">
                                            <label className="text-sm font-medium text-white/70">Email Address</label>
                                            <input
                                                type="email"
                                                value={user?.email || ""}
                                                disabled
                                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/50 focus:outline-none focus:border-violet-500/50 transition-colors"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <hr className="border-white/[0.06]" />

                                <div>
                                    <h2 className="text-xl font-bold mb-1">Appearance</h2>
                                    <p className="text-sm text-white/40 mb-6">Customize how Ripple looks on your device.</p>

                                    <div className="flex gap-4">
                                        {[
                                            { id: 'dark', label: 'Dark Mode', active: true },
                                            { id: 'light', label: 'Light Mode', active: false },
                                            { id: 'system', label: 'System', active: false }
                                        ].map(theme => (
                                            <div
                                                key={theme.id}
                                                className={cn(
                                                    "border rounded-xl p-4 flex-1 cursor-pointer transition-all flex flex-col items-center gap-3",
                                                    theme.active
                                                        ? "border-violet-500 bg-violet-500/10"
                                                        : "border-white/10 hover:border-white/20 hover:bg-white/5"
                                                )}
                                            >
                                                <Monitor className={cn("h-6 w-6", theme.active ? "text-violet-400" : "text-white/40")} />
                                                <span className={cn("text-sm font-medium", theme.active ? "text-white" : "text-white/50")}>
                                                    {theme.label}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="pt-4 flex justify-end">
                                    <button className="bg-white text-black font-bold text-sm px-6 py-2.5 rounded-full hover:bg-white/90 transition-colors">
                                        Save Changes
                                    </button>
                                </div>
                            </div>
                        )}

                        {activeTab === "notifications" && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div>
                                    <h2 className="text-xl font-bold mb-1">Email Notifications</h2>
                                    <p className="text-sm text-white/40 mb-6">Control what emails you receive from Ripple.</p>

                                    <div className="space-y-4">
                                        {[
                                            { label: "Change Reviews", desc: "When someone assigns you to review a change", active: true },
                                            { label: "Impact Alerts", desc: "When a change affects your components", active: true },
                                            { label: "Team Invites", desc: "When you are invited to a new project", active: true },
                                            { label: "Marketing", desc: "Product updates and announcements", active: false }
                                        ].map((setting, i) => (
                                            <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-black/20 border border-white/5">
                                                <div>
                                                    <p className="text-sm font-medium text-white mb-0.5">{setting.label}</p>
                                                    <p className="text-xs text-white/40">{setting.desc}</p>
                                                </div>
                                                <div className={cn("w-10 h-5 rounded-full p-0.5 transition-colors cursor-pointer", setting.active ? "bg-violet-500" : "bg-white/10")}>
                                                    <div className={cn("h-4 w-4 rounded-full bg-white transition-transform", setting.active ? "translate-x-5" : "translate-x-0")} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === "security" && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div>
                                    <h2 className="text-xl font-bold mb-1">Security Settings</h2>
                                    <p className="text-sm text-white/40 mb-6">Manage your account security and authentication methods.</p>

                                    <div className="space-y-4">
                                        <div className="p-4 rounded-xl bg-black/20 border border-white/5 flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-medium text-white mb-0.5">Two-Factor Authentication</p>
                                                <p className="text-xs text-white/40">Add an extra layer of security to your account.</p>
                                            </div>
                                            <button className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors">
                                                Enable
                                            </button>
                                        </div>
                                        <div className="p-4 rounded-xl bg-black/20 border border-white/5 flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-medium text-white mb-0.5">GitHub Integration</p>
                                                <p className="text-xs text-emerald-400 font-medium">Connected</p>
                                            </div>
                                            <button className="border border-white/10 hover:bg-white/5 text-white/60 text-xs font-bold px-4 py-2 rounded-lg transition-colors">
                                                Disconnect
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};
