# MeloStudio Architecture

## Ecosystem map

Every user action follows this path:

```
Browser → src/routes/<page>.tsx     (thin route — auth guard + lazy import)
       → src/pages/<Page>.tsx       (all component logic lives here)
       → src/lib/api.ts             (typed fetch helpers — the only place URL shapes live)
       → src/routes/api/<route>.ts  (server handler — auth via projectAccess.ts)
       → src/lib/db/ or Netlify Blobs
```

---

## Adding a new page

1. Create `src/pages/mypage/MyPage.tsx` — fat component with all logic
2. Create `src/routes/mypage.tsx` — thin wrapper:

```tsx
import { lazy, Suspense } from "solid-js";
import RouteVeil from "~/components/RouteVeil";
import { ProtectedPage } from "~/lib/session";

const MyPage = lazy(() => import("~/pages/mypage/MyPage"));

export default function MyPageRoute() {
  return (
    <ProtectedPage label="my page">
      <Suspense fallback={<RouteVeil label="Loading..." />}>
        <MyPage />
      </Suspense>
    </ProtectedPage>
  );
}
```

3. For public pages (no auth required), omit `<ProtectedPage>` — see `src/routes/share/[id].tsx`.

---

## Adding a new API endpoint

1. Create `src/routes/api/myendpoint.ts`
2. Use the shared guards from `src/lib/server/projectAccess.ts`:
   - `getReadAccess(request, projectId)` — published projects bypass auth; unpublished require owner
   - `getOwnerAccess(request, projectId)` — always authenticates, returns 401/403/404 shapes
3. Add a typed helper in `src/lib/api.ts` so callers never hand-build URL strings

```ts
// src/lib/api.ts
export async function myThingApi(id: string): Promise<MyThing | null> {
  const res = await apiFetch(`/api/mything/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  return res.json();
}
```

---

## Adding a project field

Four places to touch:

| # | File | What to do |
|---|------|-----------|
| 1 | `src/lib/audio/types.ts` | Add field to `ProjectDoc` interface |
| 2 | `src/pages/studio/hooks/useProject.ts` | Include field in `normalizedProjectJson` and `applyDoc` |
| 3 | `src/routes/api/projects/[id].ts` | Add to `isProjectDocPayload` validator **only if required on every save** |
| 4 | `src/routes/api/projects/[id].ts` PATCH handler | Add if the field should be settable via PATCH |

---

## Clip storage

```
Record/import → IndexedDB ("melostudio-clips")       fast local playback
              → /api/clips/:id?projectId=:pid        saved remote audio
              → inline dataUrl                       legacy read fallback only
```

**Rule:** Build clip URLs only via `clipUrl(projectId, clipId)` from `src/lib/api.ts`.  
Never hand-write `/api/clips/...` strings — that's how bugs like the Profile waveform issue happened.

Upload logic lives in `src/lib/remoteClips.ts`. `remoteClipUrl` is a re-export of `clipUrl` for zero importer churn.

---

## Who wrote what

This section comes from current `git blame` and commit history, not guesses.
Merge commits are not counted as authorship. This is a snapshot: later edits can
make a file shared even when one person built the first version.

### Mainly Malikhai

| File | What he added |
|------|---------------|
| `src/pages/studio/components/PianoRoll.tsx` | Piano-roll editor, note drawing, moving, trimming, velocity and scale tools |
| `src/pages/studio/styles/_pianoroll.scss` | Piano-roll layout and visual states |
| `src/lib/audio/midiManager.ts` | Hardware Web MIDI connection, message parsing and controller input |
| `src/lib/audio/synth.ts` | A large part of the Tone.js synth/sample engine and instrument presets |
| `src/pages/studio/hooks/useTransport.ts` | A large part of current audio/MIDI scheduling, metronome, count-in and playback routing |

### Shared files

| File | Split of the work |
|------|-------------------|
| `src/pages/studio/Studio.tsx` | Niko built the studio shell and hook wiring; Malikhai added major DAW, MIDI and recording integrations |
| `src/pages/studio/components/TimelineArea.tsx` | Niko built the arrangement/region workflow; Malikhai added substantial rendering and interaction code |
| `src/pages/studio/hooks/useTracks.ts` | Niko built the track/region workflow; Malikhai added substantial recording, MIDI and routing code |
| `src/pages/studio/hooks/useSynth.ts` | Shared synth lifecycle, live notes and MIDI binding |
| `src/pages/studio/components/KeyboardPanel.tsx` | Shared instrument keyboard and controls |
| `src/pages/studio/components/TopBar.tsx` | Shared transport and project controls |
| `src/pages/studio/components/AudioClipEditor.tsx` | Shared audio editor and pitch controls |
| `src/pages/studio/data/instrumentPresets.ts` | Instrument categories and presets mostly came from Malikhai's branch, with later sorting/integration work |
| `src/lib/audio/graph.ts` | Shared Web Audio routing and microphone graph |
| `src/lib/audio/stepSeq.ts` | Niko built the sequencer; Malikhai contributed later timing/playback changes |
| `src/pages/studio/lib/regionMath.ts` | Niko built the main math; Malikhai contributed original-length trim recovery |

### Smaller Malikhai contributions still present

Current lines from Malikhai's commits also remain in:

- `BottomBar.tsx`, `TracksSidebar.tsx`, `LiveRecordingClip.tsx`, `DrumPanel.tsx`
- `_topbar.scss`, `_drum.scss`, `_timeline.scss`, `_keyboard.scss`, `_sidebar.scss`
- `types.ts`, `transportStore.ts`, `studio.scss`
- `useProject.ts`, `Library.tsx`, `social.ts`, `rateLimit.ts`
- `src/routes/api/clips/[clipId].ts`

For exact line-level credit, run:

```bash
git blame -w path/to/file
```

---

## Auth / session

- **Client:** `src/lib/session.tsx` — `ProtectedPage` component + `getSession()` (no caching — avoids stale-session trap)
- **Server:** `src/lib/auth-server.ts` — `requireUserId(request)` returns userId or null
- **Providers:** Better Auth (cookie) + Neon Auth (JWT Bearer). Both are probed; `apiFetch` in `src/lib/api.ts` attaches the JWT when Neon is active. **Always use `apiFetch`, never raw `fetch`, for authenticated API calls.**

---

## Schema truth

| Thing | Where it lives | Notes |
|-------|---------------|-------|
| `ProjectDoc.tracks` / `.assets` / `.master` | DB JSONB | Required by `isProjectDocPayload` in `[id].ts:28`. Never remove from save payload even if empty. |
| `uiTracks` | DB JSONB | The real persisted track data (`UITrack[]`). Preferred over `tracks` at read time. |
| `_published` | Server-only | Smuggled into GET response by the server. Extracted and stripped by `getProjectDocApi` in `api.ts`. **Never appears in PUT payload.** |
| Clip `id` | `Clip.id` in ProjectDoc | Used to build the remote URL. The clip blob lives at `clipUrl(projectId, clip.id)`. |

---

## URL builders — single source of truth

All in `src/lib/api.ts`. Never duplicate these:

```ts
clipUrl(projectId, clipId)   // /api/clips/:id?projectId=:pid
pfpUrl(userId)               // /api/user/:id/pfp
shareUrl(projectId)          // https://melostudio.co/share/:id
isApiClipUrl(url)            // true if url points to our clip API
```

---

## Known deferred debt

- **Dashboard prop drilling** — Dashboard.tsx passes ~50 props down; extracting sub-components would help but it works fine now
- **Share route** — `src/routes/share/[id].tsx` is still ~1150 LOC inline; logic could move to `src/pages/share/Share.tsx` for consistency
- **Stripped-clip auto-upload** — when a clip is too large to embed and remote upload also fails, it silently plays only on the recording device; could show a retry button
- **Privacy/data-deletion routes** — still inline in `src/routes/`, not in `src/pages/`
