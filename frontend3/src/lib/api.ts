import axios from 'axios';
import { authStore } from './authStore';

const BASE_URL = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:8000/api/v1';

export const instance = axios.create({
    baseURL: BASE_URL,
    headers: {
        'Content-Type': 'application/json'
    },
    withCredentials: true
});

instance.interceptors.request.use(config => {
    const token = authStore.getState().accessToken;
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

instance.interceptors.response.use(
    res => res,
    async err => {
        if (err.response?.status === 401 && !err.config._retry && !err.config.url?.endsWith('/auth/me')) {
            err.config._retry = true;
            try {
                await authStore.getState().refresh();
                const token = authStore.getState().accessToken;
                err.config.headers.Authorization = `Bearer ${token}`;
                return instance(err.config);
            } catch (refreshErr) {
                authStore.getState().logout();
                return Promise.reject(refreshErr);
            }
        }
        return Promise.reject(err);
    }
);

// We define helpers get, post to extract .data from axios
const get = async <T,>(path: string) => (await instance.get<{ data: T }>(path)).data.data;
const post = async <T,>(path: string, body?: unknown) => {
    const res = await instance.post<{ data: T }>(path, body);
    return res.data?.data ?? (res.data as any);
};
const patch = async <T,>(path: string, body?: unknown) => (await instance.patch<{ data: T }>(path, body)).data.data;
const del = async <T,>(path: string) => (await instance.delete<{ data: T }>(path)).data;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserProfile {
    id: string;
    display_name: string;
    email: string;
    avatar_url: string | null;
}

export interface Project {
    id: string;
    name: string;
    description: string;
    color: string;
    icon: string;
    status: string;
    created_at: string;
}

export type StrictnessMode = "visibility" | "soft" | "full";
export type ComponentStatus = "stable" | "flagged" | "pending" | "locked";

export interface Contributor {
    id: string;
    name: string;
    initials: string;
    color: string;
}

export interface ComponentItem {
    id: string;
    name: string;
    status: ComponentStatus;
    fileCount: number;
    contributors: Contributor[];
    lastActivity: string;
    activeChanges: number;
    isMyComponent: boolean;
}

export interface ActiveChange {
    id: string;
    title: string;
    author: { name: string; initials: string; color: string };
    sourceComponent: string;
    affectedComponents: string[];
    acknowledgedCount: number;
    totalCount: number;
    submittedAgo: string;
}

export interface ProjectData {
    id: string;
    name: string;
    description: string;
    owner: { id: string; name: string; initials: string; color: string };
    isOwner: boolean;
    strictnessMode: StrictnessMode;
    createdAt: string;
    components: ComponentItem[];
    activeChanges: ActiveChange[];
}

export interface Component {
    id: string;
    project_id: string;
    name: string;
    color: string;
    status: string;
    created_at: string;
    contributors: { user_id: string; role: string }[];
}

export interface ProjectFile {
    id: string;
    path: string;
    language: string;
    size_bytes: number;
    component_id: string | null;
    s3_key: string;
    created_at: string;
}

export interface Change {
    id: string;
    project_id: string;
    author_id: string;
    title: string;
    status: string;
    diff_s3_key: string | null;
    created_at: string;
    updated_at: string;
}

export interface ChangeImpact {
    id: string;
    component_id: string;
    component_name: string;
    contributor_id: string;
    contributor_name: string;
    detection_method: string;
    confidence: number;
    affected_lines: any;
    llm_annotation: string | null;
    acknowledged: boolean;
    dismissed: boolean;
}

export interface ApiNotification {
    id: string;
    type: string;
    title: string;
    body: string | null;
    link: string | null;
    meta_data: Record<string, string> | null;
    is_read: boolean;
    created_at: string;
}

export interface Invite {
    id: string;
    project_id: string;
    invited_email: string;
    status: string;
}

export interface Collaborator {
    id: string;
    display_name: string;
    email: string;
    avatar_url: string | null;
    shared_projects?: string[];
    last_activity?: string;
    /** @deprecated Use display_name instead */
    name: string;
    /** @deprecated Use email instead */
    handle: string;
}

// ─── Users API ─────────────────────────────────────────────────────────────────

export const usersApi = {
    getProfile: () => get<UserProfile>('/users/me'),
    
    updateProfile: (data: { display_name?: string; avatar_url?: string }) =>
        patch<UserProfile>('/users/me', data),
};

// ─── Auth API ─────────────────────────────────────────────────────────────────

export const authApi = {
    register: (name: string, email: string, password: string) =>
        post<{ access_token: string, user: UserProfile }>('/auth/register', { display_name: name, email, password }),

    login: (email: string, password: string) =>
        post<{ access_token: string, user: UserProfile }>('/auth/login', { email, password }),

    logout: () => post('/auth/logout'),

    me: () => get<{ access_token: string, user: UserProfile }>('/auth/me'),

    githubUrl: () => `${BASE_URL}/auth/github`,
};

// ─── Projects API ─────────────────────────────────────────────────────────────

export const projectsApi = {
    list: () => get<Project[]>('/projects'),

    get: (id: string) => get<Project>(`/projects/${id}`),

    getProject: (id: string) => get<ProjectData>(`/projects/${id}`),

    create: (name: string, description: string, color: string, icon: string) =>
        post<Project>('/projects', { name, description, color, icon }),

    update: (id: string, data: Partial<Pick<Project, 'name' | 'description' | 'color' | 'icon' | 'status'>>) =>
        patch<Project>(`/projects/${id}`, data),

    delete: (id: string, action: 'archive' | 'delete' = 'delete') =>
        del<void>(`/projects/${id}?action=${action}`),

    confirm: (id: string) => post<{ status: string }>(`/projects/${id}/confirm`),

    getInvites: (id: string) => get<{ id: string; email: string; status: string; component_name: string; created_at: string }[]>(`/projects/${id}/invites`),
};

// ─── Components API ───────────────────────────────────────────────────────────

export const componentsApi = {
    list: (projectId: string) => get<Component[]>(`/projects/${projectId}/components`),

    create: (projectId: string, name: string, color?: string) =>
        post<Component>(`/projects/${projectId}/components`, { name, color }),

    update: (projectId: string, componentId: string, data: Partial<Pick<Component, 'name' | 'color' | 'status'>>) =>
        patch<Component>(`/projects/${projectId}/components/${componentId}`, data),

    delete: (projectId: string, componentId: string) =>
        del<void>(`/projects/${projectId}/components/${componentId}`),

    addContributor: (projectId: string, componentId: string, userId: string, role?: string) =>
        post(`/projects/${projectId}/components/${componentId}/contributors`, { user_id: userId, role }),

    removeContributor: (projectId: string, componentId: string, userId: string) =>
        del(`/projects/${projectId}/components/${componentId}/contributors/${userId}`),

    getDependencies: (componentId: string) =>
        get<{ depends_on: { target_component_id: string, dependency_type: string }[], depended_by: { source_component_id: string, dependency_type: string }[] }>(`/components/${componentId}/dependencies`),
};

// ─── Files API ────────────────────────────────────────────────────────────────

export const filesApi = {
    list: (projectId: string) => get<ProjectFile[]>(`/projects/${projectId}/files`),

    requestUploadUrls: (projectId: string, files: { path: string; size_bytes: number; language: string }[]) =>
        post<{ file_id: string; s3_key: string; upload_url: string }[]>('/files/upload-url', {
            project_id: projectId,
            files: files.map(f => ({ name: f.path, size: f.size_bytes, content_type: 'text/plain' }))
        }),

    confirmBatch: (projectId: string, fileIds: string[]) =>
        post<{ status: string; file_count: number }>(`/projects/${projectId}/files/confirm-batch`, { file_ids: fileIds }),

    assignToComponent: (projectId: string, fileIds: string[], componentId: string) =>
        post(`/projects/${projectId}/files/assign`, { file_ids: fileIds, component_id: componentId }),

    githubPreview: (projectId: string, repoUrl: string, branch: string = 'main') =>
        post<string[]>(
            `/projects/${projectId}/github-import/preview`, { repo_url: repoUrl, branch }
        ),

    githubConfirm: (projectId: string, repoUrl: string, branch: string = 'main', selectedPaths?: string[]) =>
        post(`/projects/${projectId}/github-import/confirm`, { repo_url: repoUrl, branch, selected_paths: selectedPaths }),

    getComponentFiles: (componentId: string) =>
        get<{ id: string; path: string; language: string; size_bytes: number; download_url: string }[]>(`/components/${componentId}/files`),

    getFileContent: (fileId: string) =>
        get<{ filename: string; content: string; language: string }>(`/files/${fileId}/content`),

    getFileDraft: (fileId: string) =>
        get<{ id: string; content: string; updated_at: string }>(`/files/${fileId}/draft`),

    saveFileDraft: (fileId: string, content: string) =>
        post<{ id: string; content: string; updated_at: string }>(`/files/${fileId}/draft`, { content }),
};

// ─── Changes API ──────────────────────────────────────────────────────────────

export const changesApi = {
    list: (projectId: string) => get<Change[]>(`/projects/${projectId}/changes`),

    listGlobal: (scope: 'mine' | 'affected' = 'mine') => get<Change[]>(`/changes?scope=${scope}`),

    submit: (projectId: string, data: { component_id: string; title: string; description?: string; draft_ids: string[] }) =>
        post<{ id: string; status: string }>(`/projects/${projectId}/changes`, data),

    getImpact: (changeId: string) => get<{ change_request_id: string; status: string; impacts: ChangeImpact[] }>(`/changes/${changeId}/impact`),

    acknowledge: (changeId: string) => post(`/changes/${changeId}/acknowledge`),

    approve: (changeId: string) => post(`/changes/${changeId}/approve`),
};

// ─── Notifications API ────────────────────────────────────────────────────────

export const notificationsApi = {
    list: () => get<ApiNotification[]>('/notifications'),

    markRead: (ids?: string[]) => post('/notifications/mark-read', ids ? { ids } : { all: true }),

    createInvite: (projectId: string, email: string, componentId?: string, role: string = 'contributor') =>
        post<Invite>(`/projects/${projectId}/invites`, { email, component_id: componentId, role }),

    acceptInvite: (inviteId: string) => post(`/invites/${inviteId}/accept`),

    declineInvite: (inviteId: string) => post(`/invites/${inviteId}/decline`),

    listCollaborators: () => get<Collaborator[]>('/users/collaborators'),

    searchUsers: (q: string) => get<Collaborator[]>(`/users/search?q=${encodeURIComponent(q)}`),
};
