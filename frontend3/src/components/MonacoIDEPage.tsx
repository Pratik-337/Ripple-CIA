import React, { useState, useRef, useCallback, useEffect } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import {
    ArrowLeft, Waves, Undo2, Redo2, WrapText, GitCompare,
    Zap, Save, Clock, FileCode2, ChevronRight, X, Check,
    Loader2, Users, Lock, AlertCircle, MessageSquare, Send,
    CheckCircle2, File, GitBranch
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { Particles } from "@/src/components/ui/particles";
import { useQuery, useMutation } from "@tanstack/react-query";
import { filesApi, changesApi } from "@/src/lib/api";

// ─── Types ─────────────────────────────────────────────────────────────────

interface FileTab {
    id: string;
    name: string;
    language: string;
    path: string;
    stableContent: string;
    draftContent: string | null; // null = no draft
}

interface MapImpactFile {
    fileId: string;
    fileName: string;
    changed: boolean;
}



// ─── Sub-components ─────────────────────────────────────────────────────────

const LanguageDot = ({ lang }: { lang: string }) => {
    const map: Record<string, string> = { typescript: "bg-blue-400", javascript: "bg-yellow-400", python: "bg-green-400", tsx: "bg-cyan-400" };
    return <span className={cn("h-2 w-2 rounded-full shrink-0", map[lang] ?? "bg-white/30")} />;
};

// Map Impact Confirmation Sheet
const MapImpactSheet = ({
    files,
    componentName,
    onCancel,
    onSubmit,
}: {
    files: FileTab[];
    componentName: string;
    onCancel: () => void;
    onSubmit: (title: string, description: string, selectedFileIds: string[]) => void;
}) => {
    const changedFiles = files.filter(f => f.draftContent !== null && f.draftContent !== f.stableContent);
    const [title, setTitle] = useState(`Updated ${componentName} — ${changedFiles[0]?.name ?? "changes"}`);
    const [description, setDescription] = useState("");
    const [selected, setSelected] = useState<string[]>(changedFiles.map(f => f.id));

    const toggleFile = (id: string) => {
        setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative w-full max-w-2xl bg-zinc-950 border border-white/10 rounded-t-2xl shadow-2xl animate-in slide-in-from-bottom duration-300">
                {/* Handle */}
                <div className="flex justify-center pt-3 pb-1">
                    <div className="h-1 w-10 rounded-full bg-white/20" />
                </div>

                <div className="px-6 pb-6 pt-3">
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h2 className="text-base font-bold text-white">Submit change for impact analysis?</h2>
                            <p className="text-xs text-white/35 mt-0.5">Ripple will map which components are connected to this change.</p>
                        </div>
                        <button onClick={onCancel} className="text-white/30 hover:text-white transition-colors">
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="space-y-3 mb-5">
                        <div>
                            <label className="text-xs text-white/50 mb-1.5 block">Title</label>
                            <input
                                id="impact-title-input"
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                className="w-full bg-white/[0.04] border border-white/[0.10] rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/25 transition-colors"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-white/50 mb-1.5 block">Description <span className="text-white/20">(optional)</span></label>
                            <textarea
                                id="impact-description-input"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="What does this change do?"
                                rows={2}
                                className="w-full bg-white/[0.04] border border-white/[0.10] rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/25 transition-colors resize-none"
                            />
                        </div>
                    </div>

                    {/* File list */}
                    <div className="mb-5">
                        <p className="text-xs text-white/50 mb-2">Files in this submission:</p>
                        <div className="space-y-1.5">
                            {files.map(f => {
                                const isChanged = f.draftContent !== null && f.draftContent !== f.stableContent;
                                const isSelected = selected.includes(f.id);
                                return (
                                    <div
                                        key={f.id}
                                        onClick={() => isChanged && toggleFile(f.id)}
                                        className={cn(
                                            "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                                            isChanged ? "cursor-pointer hover:bg-white/[0.04]" : "opacity-30 cursor-default"
                                        )}
                                    >
                                        <div className={cn(
                                            "h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 transition-all",
                                            isSelected && isChanged ? "bg-violet-500 border-violet-500" : "border-white/20"
                                        )}>
                                            {isSelected && isChanged && <Check className="h-2 w-2 text-white" />}
                                        </div>
                                        <LanguageDot lang={f.language} />
                                        <span className="text-xs font-mono text-white/70 flex-1">{f.path}</span>
                                        <span className={cn(
                                            "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                                            isChanged ? "text-orange-400 bg-orange-400/10" : "text-white/25 bg-white/5"
                                        )}>
                                            {isChanged ? "modified" : "unchanged — excluded"}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={onCancel}
                            className="flex-1 py-2.5 text-sm font-medium text-white/50 hover:text-white border border-white/10 hover:border-white/20 rounded-xl transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            id="confirm-map-impact-btn"
                            onClick={() => onSubmit(title, description, selected)}
                            disabled={selected.length === 0 || !title.trim()}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white text-black text-sm font-bold rounded-xl hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <Zap className="h-4 w-4" />
                            Map Impact
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Read-only banner for unassigned contributors
const ReadOnlyBanner = ({
    componentName,
    onPingOwner,
}: {
    componentName: string;
    onPingOwner: () => void;
}) => {
    const [pinged, setPinged] = useState(false);

    const handlePing = () => {
        setPinged(true);
        onPingOwner();
    };

    return (
        <div className="flex items-center justify-between px-4 py-2.5 bg-amber-500/[0.08] border-b border-amber-500/20">
            <div className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <p className="text-xs text-amber-400/90">
                    You're viewing <span className="font-semibold">{componentName}</span> in read-only mode — you're not assigned to this component.
                </p>
            </div>
            {pinged ? (
                <span className="flex items-center gap-1 text-[11px] text-emerald-400 shrink-0 ml-4">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Ping sent
                </span>
            ) : (
                <button
                    id="ping-owner-btn"
                    onClick={handlePing}
                    className="ml-4 shrink-0 text-[11px] font-semibold text-amber-400 hover:text-amber-300 border border-amber-500/30 hover:border-amber-400/50 px-2.5 py-1 rounded-lg transition-colors"
                >
                    Ping Owner for access
                </button>
            )}
        </div>
    );
};

// Shadow page indicator
const ShadowPageBanner = ({ hasDraft, onViewDiff }: { hasDraft: boolean; onViewDiff: () => void }) => {
    if (!hasDraft) return null;
    return (
        <div className="flex items-center justify-between px-4 py-2 bg-violet-500/[0.07] border-b border-violet-500/15">
            <div className="flex items-center gap-2">
                <GitBranch className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                <p className="text-xs text-violet-300/80">
                    Viewing your <span className="font-medium text-violet-300">draft</span> — the stable version is different.
                </p>
            </div>
            <button
                onClick={onViewDiff}
                className="ml-4 text-[11px] font-semibold text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1"
            >
                Compare <ChevronRight className="h-3 w-3" />
            </button>
        </div>
    );
};

// Auto-save indicator
const SaveIndicator = ({ state }: { state: "idle" | "saving" | "saved" }) => {
    if (state === "idle") return null;
    return (
        <div className={cn(
            "flex items-center gap-1.5 text-[10px] transition-all",
            state === "saving" ? "text-white/30" : "text-emerald-400/70"
        )}>
            {state === "saving" ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> Saving...</>
            ) : (
                <><CheckCircle2 className="h-3 w-3" /> Saved</>
            )}
        </div>
    );
};

// ─── Main IDE Page ──────────────────────────────────────────────────────────

interface MonacoIDEPageProps {
    projectId: string;
    componentId: string;
    componentName: string;
    readOnly: boolean;
    onBack: () => void;
    onChangeSubmitted: (changeId: string) => void;
}

export const MonacoIDEPage = ({
    projectId,
    componentId,
    componentName,
    readOnly,
    onBack,
    onChangeSubmitted,
}: MonacoIDEPageProps) => {
    const { data: realFiles = [], isLoading } = useQuery({
        queryKey: ['component', componentId, 'expandedFiles'],
        queryFn: async () => {
            const meta = await filesApi.getComponentFiles(componentId);
            const resolvedFiles: FileTab[] = await Promise.all(
                meta.map(async m => {
                    let stable = "";
                    let draft = null;
                    try {
                        const contentRes = await filesApi.getFileContent(m.id);
                        stable = contentRes.content;
                    } catch (e) {
                        // handle missing
                    }
                    try {
                        const draftRes = await filesApi.getFileDraft(m.id);
                        draft = draftRes.content;
                    } catch (e) {
                        // null
                    }

                    return {
                        id: m.id,
                        name: m.path.split('/').pop() || m.path,
                        language: m.language,
                        path: m.path,
                        stableContent: stable,
                        draftContent: draft
                    };
                })
            );
            return resolvedFiles;
        },
        enabled: !!componentId
    });

    const [files, setFiles] = useState<FileTab[]>([]);
    const [activeFileId, setActiveFileId] = useState<string>("");

    useEffect(() => {
        if (realFiles.length > 0 && files.length === 0) {
            setFiles(realFiles);
            setActiveFileId(realFiles[0].id);
        }
    }, [realFiles]);

    const [showDiff, setShowDiff] = useState(false);
    const [showMapImpact, setShowMapImpact] = useState(false);
    const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const activeFile = files.find(f => f.id === activeFileId);
    const hasDraft = activeFile ? activeFile.draftContent !== null : false;
    const isDirty = activeFile ? hasDraft && activeFile.draftContent !== activeFile.stableContent : false;
    const hasAnyDraft = files.some(f => f.draftContent !== null && f.draftContent !== f.stableContent);
    const changedFilesCount = files.filter(f => f.draftContent !== null && f.draftContent !== f.stableContent).length;

    const saveDraftMut = useMutation({
        mutationFn: ({ id, content }: { id: string, content: string }) => filesApi.saveFileDraft(id, content)
    });

    // Debounced auto-save
    const handleEditorChange = useCallback((value: string | undefined) => {
        if (value === undefined || readOnly) return;

        // Update draft in state immediately (local)
        setFiles(prev => prev.map(f =>
            f.id === activeFileId ? { ...f, draftContent: value } : f
        ));

        setSaveState("saving");
        if (saveTimer.current) clearTimeout(saveTimer.current);
        if (savedTimer.current) clearTimeout(savedTimer.current);

        saveTimer.current = setTimeout(async () => {
            try {
                await saveDraftMut.mutateAsync({ id: activeFileId, content: value });
                setSaveState("saved");
            } catch {
                setSaveState("idle");
            }
            savedTimer.current = setTimeout(() => setSaveState("idle"), 2000);
        }, 1500);

    }, [activeFileId, readOnly, saveDraftMut]);

    useEffect(() => {
        return () => {
            if (saveTimer.current) clearTimeout(saveTimer.current);
            if (savedTimer.current) clearTimeout(savedTimer.current);
        };
    }, []);

    const submitChangeMut = useMutation({
        mutationFn: (data: any) => changesApi.submit(projectId, data)
    });

    const handleMapImpactSubmit = async (title: string, description: string, selectedFileIds: string[]) => {
        setIsSubmitting(true);
        try {
            const res = await submitChangeMut.mutateAsync({
                component_id: componentId,
                title,
                description,
                file_ids: selectedFileIds
            });
            setShowMapImpact(false);
            onChangeSubmitted(res.id);
        } catch (e) {
            console.error(e);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading || files.length === 0 || !activeFile) {
        return <div className="flex h-screen items-center justify-center bg-[#0d0d0d] text-white">Loading component files...</div>;
    }

    const currentContent = activeFile.draftContent ?? activeFile.stableContent;

    return (
        <div className="flex h-screen bg-[#0d0d0d] text-white overflow-hidden relative flex-col">
            {/* Subtle particle bg */}
            <div className="fixed inset-0 z-0 pointer-events-none opacity-40">
                <Particles quantity={60} className="absolute inset-0 h-full w-full" color="#ffffff" staticity={95} size={0.2} />
            </div>

            <div className="relative z-10 flex flex-col h-full">

                {/* ── Top Toolbar ──────────────────────────────────────────────────── */}
                <div className="flex items-center justify-between px-4 h-11 border-b border-white/[0.06] bg-black/40 backdrop-blur-sm shrink-0">
                    {/* Left: breadcrumb */}
                    <div className="flex items-center gap-3">
                        <div className="h-5 w-5 rounded bg-white flex items-center justify-center">
                            <Waves className="h-3 w-3 text-black" />
                        </div>
                        <button
                            id="ide-back-btn"
                            onClick={onBack}
                            className="flex items-center gap-1 text-white/40 hover:text-white transition-colors text-xs"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            {componentName}
                        </button>
                        <span className="text-white/20">/</span>
                        <span className="text-xs text-white/60 font-mono">{activeFile.name}</span>

                        {/* Draft amber indicator */}
                        {isDirty && (
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Draft — unsaved changes exist" />
                        )}
                    </div>

                    {/* Centre: editor controls */}
                    <div className="flex items-center gap-1">
                        {[
                            { icon: Undo2, label: "Undo", action: () => { } },
                            { icon: Redo2, label: "Redo", action: () => { } },
                            { icon: WrapText, label: "Format", action: () => { } },
                        ].map(({ icon: Icon, label, action }) => (
                            <button
                                key={label}
                                onClick={action}
                                disabled={readOnly}
                                title={label}
                                className="p-1.5 text-white/30 hover:text-white/70 hover:bg-white/[0.06] rounded transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                            >
                                <Icon className="h-3.5 w-3.5" />
                            </button>
                        ))}
                        <div className="h-4 w-px bg-white/10 mx-1" />
                        <button
                            id="toggle-diff-btn"
                            onClick={() => setShowDiff(v => !v)}
                            disabled={!hasDraft}
                            title="Diff view"
                            className={cn(
                                "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors",
                                showDiff
                                    ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                                    : "text-white/30 hover:text-white/60 hover:bg-white/[0.06] disabled:opacity-20 disabled:cursor-not-allowed"
                            )}
                        >
                            <GitCompare className="h-3.5 w-3.5" />
                            {showDiff ? "Edit" : "Diff"}
                        </button>
                    </div>

                    {/* Right: save indicator + Map Impact */}
                    <div className="flex items-center gap-3">
                        <SaveIndicator state={saveState} />

                        {isSubmitting ? (
                            <div className="flex items-center gap-2 px-4 py-1.5 bg-white/10 rounded-full text-white/60 text-xs">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Submitting...
                            </div>
                        ) : (
                            <button
                                id="map-impact-btn"
                                onClick={() => setShowMapImpact(true)}
                                disabled={!hasAnyDraft || readOnly}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all",
                                    hasAnyDraft && !readOnly
                                        ? "bg-violet-600 hover:bg-violet-500 text-white shadow-[0_0_20px_rgba(124,58,237,0.4)] hover:shadow-[0_0_28px_rgba(124,58,237,0.6)]"
                                        : "bg-white/5 text-white/20 cursor-not-allowed"
                                )}
                            >
                                <Zap className="h-3.5 w-3.5" />
                                Map Impact
                                {changedFilesCount > 0 && (
                                    <span className="bg-white/20 text-white px-1.5 py-0.5 rounded-full text-[9px]">
                                        {changedFilesCount}
                                    </span>
                                )}
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Banners ───────────────────────────────────────────────────────── */}
                {readOnly && (
                    <ReadOnlyBanner
                        componentName={componentName}
                        onPingOwner={() => { }}
                    />
                )}
                {!readOnly && (
                    <ShadowPageBanner
                        hasDraft={isDirty}
                        onViewDiff={() => setShowDiff(true)}
                    />
                )}

                {/* ── File Tabs ──────────────────────────────────────────────────── */}
                <div className="flex items-center border-b border-white/[0.06] bg-black/20 shrink-0 overflow-x-auto">
                    {files.map(f => {
                        const hasFileDraft = f.draftContent !== null && f.draftContent !== f.stableContent;
                        return (
                            <button
                                key={f.id}
                                id={`tab-${f.id}`}
                                onClick={() => { setActiveFileId(f.id); setShowDiff(false); }}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2.5 text-xs font-mono border-r border-white/[0.06] transition-colors whitespace-nowrap",
                                    activeFileId === f.id
                                        ? "bg-[#1e1e1e] text-white border-t border-t-violet-500"
                                        : "text-white/40 hover:text-white/70 hover:bg-white/[0.03]"
                                )}
                            >
                                <LanguageDot lang={f.language} />
                                {f.name}
                                {hasFileDraft && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 ml-0.5" />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* ── Editor Pane ────────────────────────────────────────────────── */}
                <div className={cn(
                    "flex-1 relative overflow-hidden",
                    isDirty && !showDiff ? "border-t-2 border-amber-400" : ""
                )}>
                    {showDiff && activeFile.draftContent !== null ? (
                        <DiffEditor
                            height="100%"
                            theme="vs-dark"
                            language={activeFile.language}
                            original={activeFile.stableContent}
                            modified={activeFile.draftContent}
                            options={{
                                readOnly: true,
                                fontSize: 13,
                                lineHeight: 21,
                                renderSideBySide: true,
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                wordWrap: "on",
                                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
                                fontLigatures: true,
                            }}
                        />
                    ) : (
                        <Editor
                            height="100%"
                            theme="vs-dark"
                            language={activeFile.language}
                            value={currentContent}
                            onChange={handleEditorChange}
                            options={{
                                readOnly,
                                fontSize: 13,
                                lineHeight: 21,
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                wordWrap: "on",
                                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
                                fontLigatures: true,
                                cursorSmoothCaretAnimation: "on",
                                smoothScrolling: true,
                                renderLineHighlight: "gutter",
                                overviewRulerLanes: 0,
                                padding: { top: 16, bottom: 16 },
                            }}
                            loading={
                                <div className="flex items-center justify-center h-full">
                                    <Loader2 className="h-5 w-5 text-white/30 animate-spin" />
                                </div>
                            }
                        />
                    )}

                    {/* Read-only overlay hint */}
                    {readOnly && (
                        <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm border border-white/10 rounded-lg px-2.5 py-1.5 pointer-events-none">
                            <Lock className="h-3 w-3 text-white/30" />
                            <span className="text-[10px] text-white/30">Read-only</span>
                        </div>
                    )}
                </div>

                {/* ── Status Bar ─────────────────────────────────────────────────── */}
                <div className="h-6 flex items-center justify-between px-4 bg-black/50 border-t border-white/[0.04] shrink-0">
                    <div className="flex items-center gap-4 text-[10px] text-white/25">
                        <span className="flex items-center gap-1"><LanguageDot lang={activeFile.language} />{activeFile.language}</span>
                        <span className="font-mono">{activeFile.path}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-white/25">
                        {isDirty && <span className="text-amber-400/60">Draft in progress</span>}
                        {readOnly && <span className="text-amber-400/60">Read-only view</span>}
                        <span>UTF-8</span>
                    </div>
                </div>
            </div>

            {/* ── Map Impact Sheet ──────────────────────────────────────────────── */}
            {showMapImpact && (
                <MapImpactSheet
                    files={files}
                    componentName={componentName}
                    onCancel={() => setShowMapImpact(false)}
                    onSubmit={handleMapImpactSubmit}
                />
            )}
        </div>
    );
};

