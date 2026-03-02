# Ripple — Comprehensive Error Report

Every bug, mismatch, and issue found across the entire codebase, organized by category.

---

## 1. Frontend ↔ Backend API Contract Mismatches (CRITICAL)

These will cause runtime failures when the frontend calls the backend.

### 1.1 `filesApi.requestUploadUrls` — Wrong field names
- **Frontend** [`api.ts:248`](frontend3/src/lib/api.ts:248): Sends `{ path, size_bytes, language }`
- **Backend** [`files.py:20-23`](backend/app/api/v1/routers/files.py:20): Expects `{ name, size, content_type }`
- **Impact**: 422 Validation Error on every file upload

### 1.2 `projectsApi.getProject` — Non-existent endpoint
- **Frontend** [`api.ts:203`](frontend3/src/lib/api.ts:203): Calls `GET /projects/{id}/overview`
- **Backend**: Only `GET /projects/{id}` exists at [`projects.py:146`](backend/app/api/v1/routers/projects.py:146)
- **Impact**: 404 on every project overview page load

### 1.3 `notificationsApi.createInvite` — Wrong URL
- **Frontend** [`api.ts:303`](frontend3/src/lib/api.ts:303): Posts to `POST /invites`
- **Backend** [`notifications.py:90`](backend/app/api/v1/routers/notifications.py:90): Endpoint is `POST /projects/{project_id}/invites`
- **Impact**: 404 on every invite creation

### 1.4 `filesApi.githubPreview` — Missing branch parameter
- **Frontend** [`api.ts:257-260`](frontend3/src/lib/api.ts:257): Sends `{ repo_url: repoUrl }` (no branch)
- **Backend** [`files.py:99-101`](backend/app/api/v1/routers/files.py:99): Expects `{ repo_url, branch }` (branch is required)
- **Impact**: 422 Validation Error on GitHub preview

### 1.5 `filesApi.githubConfirm` — Completely wrong payload
- **Frontend** [`api.ts:262-263`](frontend3/src/lib/api.ts:262): Sends `{ owner, repo, paths }`
- **Backend** [`files.py:146-149`](backend/app/api/v1/routers/files.py:146): Expects `{ repo_url, branch, selected_paths }`
- **Impact**: 422 Validation Error on GitHub import confirm

### 1.6 `ApiNotification` type — Field name mismatches
- **Frontend** [`api.ts:156-163`](frontend3/src/lib/api.ts:156): Has `message` and `read` fields
- **Backend** [`notifications.py:41-49`](backend/app/api/v1/routers/notifications.py:41): Returns `title`, `body`, and `is_read`
- **Impact**: Notifications display as undefined/empty

### 1.7 `ChangeImpact.confidence` typed as string
- **Frontend** [`api.ts:149`](frontend3/src/lib/api.ts:149): `confidence: string`
- **Backend** [`change.py:47`](backend/app/models/change.py:47): `confidence: Float`
- **Impact**: Type mismatch, comparison bugs

### 1.8 `Collaborator` type — Missing fields
- **Frontend** [`api.ts:172-178`](frontend3/src/lib/api.ts:172): Has `name` and `handle` fields
- **Backend** [`users.py:89-95`](backend/app/api/v1/routers/users.py:89): Returns `display_name` and `email` (no `name` or `handle`)
- **Impact**: [`GlobalTeamsPage.tsx:29-38`](frontend3/src/components/GlobalTeamsPage.tsx:29) maps `c.name` and `c.handle` which are undefined

### 1.9 `authApi.register` — Response structure mismatch
- **Frontend** [`api.ts:184`](frontend3/src/lib/api.ts:184): Expects `{ access_token, user }` in response
- **Backend** [`auth.py:73-82`](backend/app/api/v1/routers/auth.py:73): Returns `{ id, email, display_name, ... }` — no `access_token` or `user` wrapper
- **Impact**: Registration succeeds but login state is not set (no token returned)

### 1.10 `authApi.githubUrl` — Wrong response handling
- **Frontend** [`api.ts:193`](frontend3/src/lib/api.ts:193): Expects JSON `{ redirect_url }` from `GET /auth/github`
- **Backend** [`auth.py:175-188`](backend/app/api/v1/routers/auth.py:175): Returns a `RedirectResponse` (302 redirect), not JSON
- **Impact**: GitHub OAuth flow broken via API call; works only via direct browser navigation

---

## 2. Backend Bugs

### 2.1 Typo: `definitons` instead of `definitions`
- **File**: [`parser.py:25`](backend/app/services/impact/parser.py:25)
- **Impact**: Parsed symbols stored with wrong key; downstream code looking for `definitions` won't find them

### 2.2 Duplicate `ParsedFile` class definitions
- **Simple version**: [`parser.py:22-26`](backend/app/services/impact/parser.py:22) — `ParsedFile` with `definitons` and `calls`
- **Rich version**: [`extractors/base.py:49-80`](backend/app/services/impact/extractors/base.py:49) — `ParsedFile` with `path`, `language`, `definitions`, `calls`, `to_dict()`
- **Impact**: Two incompatible `ParsedFile` classes; the parser task uses the simple one, the extractors use the rich one

### 2.3 Duplicate `build_dependency_graph` functions
- **DB-based version**: [`parser.py:121-204`](backend/app/services/impact/parser.py:121) — Used by Celery task
- **In-memory version**: [`graph.py:14-97`](backend/app/services/impact/graph.py:14) — More sophisticated but never called
- **Impact**: Code duplication, the better version is unused

### 2.4 Only TypeScript/JavaScript parsing is active
- **File**: [`parsing.py:38`](backend/app/tasks/parsing.py:38)
- **Code**: `if lang in ["typescript", "javascript"]:` — skips all other languages
- **Impact**: Python, Go, Rust, Java, C, C++, Ruby, C#, PHP files are never parsed despite having extractors

### 2.5 `_run_async` pattern is fragile
- **Files**: [`parsing.py:15-17`](backend/app/tasks/parsing.py:15), [`impact.py:13-15`](backend/app/tasks/impact.py:13), [`autoconfirm.py:10-12`](backend/app/tasks/autoconfirm.py:10)
- **Code**: `asyncio.get_event_loop().run_until_complete(coro)`
- **Impact**: Deprecated in Python 3.10+; will fail if event loop is already running. Should use `asyncio.run()`

### 2.6 `approve_change` hardcodes `.ts` extension
- **File**: [`changes.py:323`](backend/app/api/v1/routers/changes.py:323)
- **Code**: `new_key = f"projects/{cr.project_id}/files/{f.id}/v{uuid.uuid4().hex[:8]}.ts"`
- **Impact**: All approved files get `.ts` extension regardless of actual language (Python, Go, etc.)

### 2.7 `SnapshotFile` not exported from models `__init__.py`
- **File**: [`models/__init__.py`](backend/app/models/__init__.py)
- **Impact**: `SnapshotFile` is defined in [`component.py:125`](backend/app/models/component.py:125) but not in `__all__`. Alembic may not detect it for migrations.

### 2.8 GitHub callback hardcoded redirect URL
- **File**: [`auth.py:290`](backend/app/api/v1/routers/auth.py:290)
- **Code**: `return RedirectResponse("http://localhost:5173/auth/callback")`
- **Impact**: Won't work in production or if frontend runs on a different port

### 2.9 Redis connection never closed
- **File**: [`main.py:14-19`](backend/app/main.py:14)
- **Impact**: [`close_redis()`](backend/app/core/redis.py:30) exists but is never called in the lifespan shutdown handler

### 2.10 `diff.py` hunk content type inconsistency
- **File**: [`diff.py:55-61`](backend/app/services/diff.py:55)
- **Code**: Line 55 appends strings to `content` list, but line 61 does `"".join(h["content"])` converting to string
- **Impact**: In [`impact.py:55`](backend/app/tasks/impact.py:55), the code does `for line in hunk["content"]` expecting a list, but after `generate_diff` returns, `content` is already a joined string. This causes character-by-character iteration instead of line-by-line.

### 2.11 `graph.py` references undefined `Import` class
- **File**: [`graph.py:166`](backend/app/services/impact/graph.py:166)
- **Code**: `Import(**i)` — but `Import` is imported from `extractors/base.py` which has `is_default`, `is_wildcard`, `line` fields
- **Impact**: If DB data has extra/missing keys, this will crash with TypeError

### 2.12 No input validation on `strictness_mode`
- **File**: [`projects.py:29`](backend/app/api/v1/routers/projects.py:29)
- **Code**: `strictness_mode: str | None = None` — accepts any string
- **Impact**: Invalid values like `"extreme"` would be written to the DB enum column, causing a database error

### 2.13 `websocket.py` Redis channel parsing assumes format
- **File**: [`websocket.py:78`](backend/app/core/websocket.py:78)
- **Code**: `user_id = channel.split(":")[1]`
- **Impact**: Channel format is `ws:user:{user_id}` (3 parts), but `split(":")[1]` returns `"user"` not the actual user_id. Should be `split(":")[2]` or `split(":")[-1]`.

### 2.14 `publish` channel format inconsistency
- **Websocket listener** [`websocket.py:78`](backend/app/core/websocket.py:78): Expects `ws:{user_id}` (2 parts)
- **Publishers** [`impact.py:114`](backend/app/tasks/impact.py:114): Publishes to `ws:user:{uid}` (3 parts)
- **Impact**: The Redis listener subscribes to `ws:*` pattern, but parses `channel.split(":")[1]` which gives `"user"` instead of the actual user_id. **WebSocket events are never delivered to the correct user.**

---

## 3. Frontend Bugs

### 3.1 No URL-based routing
- **File**: [`App.tsx`](frontend3/src/App.tsx)
- **Impact**: Browser back/forward doesn't work, URLs aren't shareable, page refresh loses navigation state

### 3.2 `AuthPage` — Registration doesn't auto-login
- **File**: [`AuthPage.tsx:39`](frontend3/src/components/AuthPage.tsx:39)
- **Code**: After `register()`, does `window.location.href = "/"`
- **Impact**: Since backend register doesn't return an access token (see 1.9), the user is redirected but not logged in

### 3.3 `ErrorBoundary` — Manually re-declares inherited properties
- **File**: [`ErrorBoundary.tsx:16-19`](frontend3/src/components/ErrorBoundary.tsx:16)
- **Code**: Manually declares `state`, `props`, `setState` with `@ts-ignore`
- **Impact**: TypeScript anti-pattern; may cause issues with React class component lifecycle

### 3.4 `ChangeReviewPage` — Hardcoded mock data mixed with real data
- **File**: [`ChangeReviewPage.tsx:143-183`](frontend3/src/components/ChangeReviewPage.tsx:143)
- **Code**: `MOCK_CHANGE` is always used as base, real data only partially overrides it
- **Impact**: Mock author, mock diff, mock comments always show even when real data is available

### 3.5 `ChangeReviewPage` — `confidence` used as string enum
- **File**: [`ChangeReviewPage.tsx:818`](frontend3/src/components/ChangeReviewPage.tsx:818)
- **Code**: `confidence: imp.confidence as "high" | "medium" | "low"`
- **Impact**: Backend returns a float (0.0-1.0), not a string. Cast will produce invalid values.

### 3.6 `ChangeReviewPage` — Unused `llvmContributor` variable
- **File**: [`ChangeReviewPage.tsx:532`](frontend3/src/components/ChangeReviewPage.tsx:532)
- **Code**: `const llvmContributor = true;` with comment "workaround for undeclared variable"
- **Impact**: Dead code / hack

### 3.7 `MonacoIDEPage` — `draft_ids` sends file IDs instead of draft IDs
- **File**: [`MonacoIDEPage.tsx:367`](frontend3/src/components/MonacoIDEPage.tsx:367)
- **Code**: `draft_ids: selectedFileIds` — but `selectedFileIds` are file IDs from the file tab
- **Backend** [`changes.py:43-46`](backend/app/api/v1/routers/changes.py:43): Expects actual `FileDraft.id` values
- **Impact**: 400 error "Invalid draft IDs" on every change submission

### 3.8 `DependencyGraphPage` — Uses mock data, not real API data
- **File**: [`DependencyGraphPage.tsx:46-48`](frontend3/src/components/DependencyGraphPage.tsx:46)
- **Code**: Mock data section is empty but the component still references `componentsApi` and `changesApi`
- **Impact**: Graph may show empty or crash depending on how data is wired

### 3.9 `VersionHistoryPage` — Entirely mock data
- **File**: [`VersionHistoryPage.tsx:33-130`](frontend3/src/components/VersionHistoryPage.tsx:33)
- **Impact**: No API integration; always shows hardcoded mock history entries

### 3.10 `GlobalNotificationsPage` — Mock data with wrong field names
- **File**: [`GlobalNotificationsPage.tsx:10-14`](frontend3/src/components/GlobalNotificationsPage.tsx:10)
- **Code**: Local `Notification` interface has `message` and `read` fields
- **Impact**: Even if API data is fetched, it won't match the local interface (backend returns `title`, `body`, `is_read`)

### 3.11 `GlobalSettingsPage` — Entirely static/mock
- **File**: [`GlobalSettingsPage.tsx`](frontend3/src/components/GlobalSettingsPage.tsx)
- **Impact**: No API calls; all settings are non-functional UI

### 3.12 `UserProfilePage` — Entirely static/mock
- **File**: [`UserProfilePage.tsx`](frontend3/src/components/UserProfilePage.tsx)
- **Impact**: No API calls; profile changes are not persisted

### 3.13 `ProjectSettingsPage` — Mock members data
- **File**: [`ProjectSettingsPage.tsx:39-65`](frontend3/src/components/ProjectSettingsPage.tsx:39)
- **Impact**: `INITIAL_MEMBERS` and `INITIAL_INVITES` are hardcoded; real project members not loaded

### 3.14 `HomePage` — `activeChanges` accessed without null check
- **File**: [`HomePage.tsx:147`](frontend3/src/components/HomePage.tsx:147)
- **Code**: `project.activeChanges > 0` — but `activeChanges` is optional and may be undefined
- **Impact**: Potential runtime error or always-false comparison

---

## 4. Database / Migration Issues

### 4.1 `SnapshotFile` missing from model exports
- **File**: [`models/__init__.py`](backend/app/models/__init__.py)
- **Impact**: Alembic autogenerate may not detect `snapshot_files` table changes

### 4.2 Enum values not validated at API level
- **Impact**: Invalid enum values passed to SQLAlchemy will cause `DataError` from PostgreSQL instead of a clean 422 response

### 4.3 No database indexes on frequently queried columns
- While [`ffff55f4aceb_add_indexes.py`](backend/alembic/versions/ffff55f4aceb_add_indexes.py) exists, the `alembic/env.py` [`IGNORE_INDEXES`](backend/alembic/env.py:23) set explicitly ignores these indexes during migration comparison

---

## 5. Security Issues

### 5.1 GitHub access tokens stored in plaintext
- **File**: [`user.py:21`](backend/app/models/user.py:21)
- **Impact**: Database breach exposes all GitHub tokens

### 5.2 S3 bucket policy is public-read
- **File**: [`storage.py:36-45`](backend/app/core/storage.py:36)
- **Code**: `"Principal":"*"` with `"Action":"s3:GetObject"`
- **Impact**: Anyone who knows/guesses an S3 key can read any file

### 5.3 No rate limiting on auth endpoints
- **Impact**: Brute force attacks on login/register endpoints

### 5.4 Hardcoded test credentials in AuthPage
- **File**: [`AuthPage.tsx:19-21`](frontend3/src/components/AuthPage.tsx:19)
- **Code**: Default values `test@ripple.com` / `password123`
- **Impact**: Should not ship to production

### 5.5 `jwt_expires_in` parsing is fragile
- **File**: [`security.py:36`](backend/app/core/security.py:36)
- **Code**: `int(settings.jwt_expires_in.replace("m", ""))`
- **Impact**: Only handles "15m" format; "1h" or "30s" would crash

---

## 6. Unused / Dead Code

### 6.1 Unused npm dependencies
- **File**: [`package.json`](frontend3/package.json)
- `better-sqlite3` — No SQLite usage in a Vite SPA
- `express` — No server-side rendering
- `dotenv` — Vite handles env vars natively
- `json-stable-stringify` — Not imported anywhere
- `@google/genai` — Gemini AI SDK, not used in any component

### 6.2 `GEMINI_API_KEY` in vite config
- **File**: [`vite.config.ts:11`](frontend3/vite.config.ts:11)
- **Impact**: Exposes an unused API key to the frontend bundle

### 6.3 `graph.py` `find_affected_components` function
- **File**: [`graph.py:136-188`](backend/app/services/impact/graph.py:136)
- **Impact**: Never called from any task or router

### 6.4 `websockets.py` router
- **File**: [`backend/app/api/v1/routers/websockets.py`](backend/app/api/v1/routers/websockets.py)
- **Impact**: 698 chars but not included in `main.py` router registration

### 6.5 Multiple test/debug files in backend root
- `alembic_err.txt`, `alembic_err2.txt`, `alembic_err4.txt`, `alembic_err6.txt`
- `project_err.txt`, `pytest_out.txt`, `pytest_out_utf8.txt`
- `beat_out.txt`, `main_output.txt`, `notifs_utf8.txt`
- `install_log.txt`, `test_upload.out`, `test_upload3.out`
- **Impact**: Debug artifacts committed to repo

---

## 7. Summary — Error Count by Severity

| Severity | Count | Description |
|---|---|---|
| **CRITICAL** | 11 | API mismatches that cause 404/422 errors (items 1.1-1.10, 2.14) |
| **HIGH** | 8 | Bugs that cause incorrect behavior (items 2.1, 2.6, 2.10, 2.13, 3.5, 3.7, 3.4, 2.4) |
| **MEDIUM** | 10 | Mock data not replaced, missing features (items 3.8-3.14, 2.7, 2.8, 2.9) |
| **LOW** | 8 | Code quality, dead code, security hardening (items 5.1-5.5, 6.1-6.5) |
| **Total** | **37** | |

### Top Priority Fixes
1. **Fix WebSocket channel parsing** ([`websocket.py:78`](backend/app/core/websocket.py:78)) — Real-time updates are completely broken
2. **Fix API contract mismatches** (Section 1) — Most frontend features won't work
3. **Fix `draft_ids` vs file IDs** ([`MonacoIDEPage.tsx:367`](frontend3/src/components/MonacoIDEPage.tsx:367)) — Change submission is broken
4. **Fix registration flow** — No token returned, user can't auto-login after register
5. **Wire up multi-language parsing** ([`parsing.py:38`](backend/app/tasks/parsing.py:38)) — Only 2 of 10 languages work
