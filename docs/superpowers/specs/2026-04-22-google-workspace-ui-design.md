# Google Workspace UI + Toast Notifications — Design Spec

**Date:** 2026-04-22

## Summary

Add a full Google Workspace UI to the frontend and wire up toast notifications site-wide.
Backend (Gmail, Calendar, Drive, Sheets, OAuth) is already complete. No backend changes needed.

## Architecture

### New Route
- `/google` — Google Workspace dashboard page

### New Components
| File | Purpose |
|------|---------|
| `client/src/pages/Google.tsx` | Page shell with tab layout |
| `client/src/components/GoogleWorkspace/GoogleAuthCard.tsx` | OAuth connect/disconnect + setup notice when env vars missing |
| `client/src/components/GoogleWorkspace/GmailPanel.tsx` | Email inbox list + compose |
| `client/src/components/GoogleWorkspace/CalendarPanel.tsx` | Upcoming events + create event |
| `client/src/components/GoogleWorkspace/DrivePanel.tsx` | File search + list |
| `client/src/components/GoogleWorkspace/SheetsPanel.tsx` | Spreadsheet list |

### Sidebar Changes
- Add Google Workspace link (Grid icon) to Sidebar.tsx alongside existing AI Chat link

### App.tsx Changes
- Add `/google` route

## Toast Notifications

Wire `sonner` toast (already in App.tsx via `<Toaster />`) to:
- `ApiSettingsModal` — save success/error, delete success/error
- Google OAuth — connect success/error, disconnect success
- Gmail — send success/error
- Calendar — create event success/error, delete success/error
- Drive — share success/error, delete success/error

## Google Auth UX

1. Check `googleWorkspace.isAuthenticated` on page load
2. If GOOGLE_CLIENT_ID env missing on server → show amber "환경변수 설정 필요" notice
3. If not authenticated → "Google 연결" button that opens OAuth URL in new tab
4. OAuth callback hits `/api/trpc/googleWorkspace.exchangeCode` via redirect
5. If authenticated → show connected badge + "연결 해제" button

## ENV Setup Notice

When `GOOGLE_CLIENT_ID` is empty, the `getAuthUrl` endpoint returns empty string.
Frontend detects this and shows: "Google OAuth 설정이 필요합니다. .env에 GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI를 추가하세요."

## Data Flow

```
User → Google OAuth → tokens stored in SessionManager
→ Gmail/Calendar/Drive/Sheets calls use stored tokens via GoogleAuthManager
→ Toast notification on success/error
```

## Scope

- Read-only views for Gmail (inbox), Calendar (upcoming), Drive (search), Sheets (list)
- Write actions: Gmail send, Calendar create/delete, Drive share/delete
- No file upload (out of scope)
- No Sheets edit UI (out of scope — too complex for now)
