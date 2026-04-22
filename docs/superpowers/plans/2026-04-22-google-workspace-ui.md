# Google Workspace UI + Toast Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full Google Workspace UI (Gmail, Calendar, Drive, Sheets) and wire up toast notifications across the app.

**Architecture:** New `/google` page with tab layout; each service is a self-contained panel component. Toast notifications added via `sonner`'s `toast()` call (already configured in App.tsx). Google OAuth callback route registered in the Express server.

**Tech Stack:** React 19, tRPC, sonner, framer-motion, lucide-react, radix-ui, wouter, TypeScript

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `client/src/components/ApiSettingsModal.tsx` | Add toast on save/delete/error |
| Modify | `server/_core/index.ts` | Register Google OAuth callback route |
| Create | `client/src/components/GoogleWorkspace/GoogleAuthCard.tsx` | OAuth connect/disconnect card |
| Create | `client/src/components/GoogleWorkspace/GmailPanel.tsx` | Email inbox + compose |
| Create | `client/src/components/GoogleWorkspace/CalendarPanel.tsx` | Upcoming events + create |
| Create | `client/src/components/GoogleWorkspace/DrivePanel.tsx` | File search + list |
| Create | `client/src/components/GoogleWorkspace/SheetsPanel.tsx` | Spreadsheet list placeholder |
| Create | `client/src/pages/Google.tsx` | Page with tabs orchestrating panels |
| Modify | `client/src/App.tsx` | Add `/google` route |
| Modify | `client/src/components/Sidebar.tsx` | Add Google Workspace nav link |

---

## Task 1: Wire Toast to ApiSettingsModal

**Files:**
- Modify: `client/src/components/ApiSettingsModal.tsx`

- [ ] **Step 1: Add toast import**

At the top of `client/src/components/ApiSettingsModal.tsx`, add after existing imports:

```tsx
import { toast } from "sonner";
```

- [ ] **Step 2: Add toast to handleSaveKey**

Replace the `handleSaveKey` function:

```tsx
const handleSaveKey = async (provider: Provider) => {
  if (!apiKeys[provider].trim()) return;
  try {
    await saveMutation.mutateAsync({ provider, apiKey: apiKeys[provider] });
    setApiKeys((prev) => ({ ...prev, [provider]: "" }));
    toast.success(`${provider} API 키가 저장되었습니다.`);
  } catch (error) {
    toast.error(`저장 실패: ${error instanceof Error ? error.message : "오류가 발생했습니다"}`);
  }
};
```

- [ ] **Step 3: Add toast to handleDeleteKey**

Replace the `handleDeleteKey` function:

```tsx
const handleDeleteKey = async (provider: Provider) => {
  try {
    await deleteMutation.mutateAsync({ provider });
    toast.success(`${provider} API 키가 삭제되었습니다.`);
  } catch (error) {
    toast.error(`삭제 실패: ${error instanceof Error ? error.message : "오류가 발생했습니다"}`);
  }
};
```

- [ ] **Step 4: Verify dev server compiles without errors**

Check terminal where `pnpm dev` is running — no TypeScript errors expected.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ApiSettingsModal.tsx
git commit -m "feat: add toast notifications to ApiSettingsModal"
```

---

## Task 2: Register Google OAuth Callback Route in Server

**Files:**
- Modify: `server/_core/index.ts`

The Google callback router (`server/webhooks/google-callback.ts`) is never registered. Fix that.

- [ ] **Step 1: Add import to server index**

In `server/_core/index.ts`, add after the existing telegram import:

```ts
import googleCallbackRouter from "../webhooks/google-callback";
```

- [ ] **Step 2: Register the route**

In `startServer()`, after `app.use("/api/webhooks", telegramRouter);` add:

```ts
app.use("/api/webhooks", googleCallbackRouter);
```

- [ ] **Step 3: Verify server restarts cleanly**

Check dev terminal — should see `Server running on http://localhost:4000/` with no errors.

- [ ] **Step 4: Commit**

```bash
git add server/_core/index.ts
git commit -m "fix: register Google OAuth callback route"
```

---

## Task 3: GoogleAuthCard Component

**Files:**
- Create: `client/src/components/GoogleWorkspace/GoogleAuthCard.tsx`

This card checks Google auth status and shows connect/disconnect UI.
When `GOOGLE_CLIENT_ID` is not configured, the auth URL will be empty — detect and show setup notice.

- [ ] **Step 1: Create the file**

```tsx
import { toast } from "sonner";
import { motion } from "framer-motion";
import { LogIn, LogOut, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

export default function GoogleAuthCard() {
  const { data: authStatus, isLoading, refetch } = trpc.googleWorkspace.isAuthenticated.useQuery();
  const { data: authUrlData } = trpc.googleWorkspace.getAuthUrl.useQuery();
  const revokeMutation = trpc.googleWorkspace.revokeAuth.useMutation({
    onSuccess: () => {
      toast.success("Google 연결이 해제되었습니다.");
      refetch();
    },
    onError: (err) => toast.error(`연결 해제 실패: ${err.message}`),
  });

  const isConfigured = !!authUrlData?.authUrl;
  const isAuthenticated = authStatus?.authenticated;

  const handleConnect = () => {
    if (!authUrlData?.authUrl) return;
    const popup = window.open(authUrlData.authUrl, "_blank", "width=500,height=600");
    const timer = setInterval(() => {
      if (popup?.closed) {
        clearInterval(timer);
        refetch();
        toast.success("Google 연결이 완료되었습니다.");
      }
    }, 1000);
  };

  const handleDisconnect = () => revokeMutation.mutate();

  if (isLoading) {
    return (
      <Card className="bg-slate-800 border-slate-700 p-4 flex items-center gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
        <span className="text-slate-400 text-sm">Google 연결 상태 확인 중...</span>
      </Card>
    );
  }

  if (!isConfigured) {
    return (
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="bg-amber-950/30 border-amber-700/50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-amber-300 font-medium text-sm">Google OAuth 설정 필요</p>
              <p className="text-amber-400/70 text-xs mt-1">
                .env 파일에 다음 항목을 추가하세요:
              </p>
              <pre className="mt-2 text-xs bg-slate-900/60 rounded p-2 text-amber-300 font-mono">
{`GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:4000/api/webhooks/google/callback`}
              </pre>
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-cyan-400 hover:text-cyan-300 underline mt-2 inline-block"
              >
                Google Cloud Console에서 OAuth 앱 만들기 →
              </a>
            </div>
          </div>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="bg-slate-800 border-slate-700 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <CheckCircle2 className="w-5 h-5 text-green-400" />
          ) : (
            <div className="w-5 h-5 rounded-full border-2 border-slate-500" />
          )}
          <div>
            <p className="text-white text-sm font-medium">
              {isAuthenticated ? "Google 계정 연결됨" : "Google 계정 미연결"}
            </p>
            <p className="text-slate-400 text-xs">
              {isAuthenticated
                ? "Gmail, Calendar, Drive, Sheets 사용 가능"
                : "연결하면 Google Workspace 서비스를 사용할 수 있습니다"}
            </p>
          </div>
        </div>
        {isAuthenticated ? (
          <Button
            onClick={handleDisconnect}
            disabled={revokeMutation.isPending}
            variant="outline"
            size="sm"
            className="bg-red-950/30 border-red-700/50 text-red-300 hover:bg-red-900/40"
          >
            {revokeMutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <>
                <LogOut className="w-3 h-3 mr-1" />
                연결 해제
              </>
            )}
          </Button>
        ) : (
          <Button
            onClick={handleConnect}
            size="sm"
            className="bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            <LogIn className="w-3 h-3 mr-1" />
            Google 연결
          </Button>
        )}
      </Card>
    </motion.div>
  );
}
```

- [ ] **Step 2: Verify compilation**

Check dev terminal for TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/GoogleWorkspace/GoogleAuthCard.tsx
git commit -m "feat: add GoogleAuthCard with OAuth connect/disconnect"
```

---

## Task 4: GmailPanel Component

**Files:**
- Create: `client/src/components/GoogleWorkspace/GmailPanel.tsx`

Shows inbox list. "편지 쓰기" expands a compose form.

- [ ] **Step 1: Create the file**

```tsx
import { useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Send, Loader2, RefreshCw, PenSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

export default function GmailPanel() {
  const [showCompose, setShowCompose] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const { data, isLoading, refetch } = trpc.googleWorkspace.gmail.getEmails.useQuery({
    maxResults: 15,
  });

  const sendMutation = trpc.googleWorkspace.gmail.sendEmail.useMutation({
    onSuccess: () => {
      toast.success("이메일이 전송되었습니다.");
      setShowCompose(false);
      setTo(""); setSubject(""); setBody("");
    },
    onError: (err) => toast.error(`전송 실패: ${err.message}`),
  });

  const handleSend = () => {
    if (!to || !subject || !body) {
      toast.error("받는 사람, 제목, 내용을 모두 입력하세요.");
      return;
    }
    sendMutation.mutate({ to, subject, body });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <Mail className="w-4 h-4 text-cyan-400" />
          받은 편지함
        </h3>
        <div className="flex gap-2">
          <Button
            onClick={() => refetch()}
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-slate-300"
          >
            <RefreshCw className="w-3 h-3" />
          </Button>
          <Button
            onClick={() => setShowCompose((v) => !v)}
            size="sm"
            className="bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            <PenSquare className="w-3 h-3 mr-1" />
            편지 쓰기
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {showCompose && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className="bg-slate-800 border-slate-700 p-4 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-white">새 메일 작성</span>
                <button onClick={() => setShowCompose(false)}>
                  <X className="w-4 h-4 text-slate-400 hover:text-slate-300" />
                </button>
              </div>
              <Input
                placeholder="받는 사람 (이메일)"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white placeholder-slate-500"
              />
              <Input
                placeholder="제목"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white placeholder-slate-500"
              />
              <textarea
                placeholder="내용을 입력하세요..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                className="w-full rounded-md bg-slate-700 border border-slate-600 text-white placeholder-slate-500 p-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
              <Button
                onClick={handleSend}
                disabled={sendMutation.isPending}
                className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
              >
                {sendMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                전송
              </Button>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        </div>
      ) : !data?.emails?.length ? (
        <p className="text-slate-500 text-sm text-center py-8">
          이메일이 없거나 Google 계정이 연결되지 않았습니다.
        </p>
      ) : (
        <div className="space-y-2">
          {data.emails.map((email) => (
            <motion.div
              key={email.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <Card
                className={`p-3 border-slate-700 cursor-default ${
                  email.isRead ? "bg-slate-800/50" : "bg-slate-800"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm truncate ${email.isRead ? "text-slate-400" : "text-white font-medium"}`}>
                      {email.from}
                    </p>
                    <p className={`text-sm truncate ${email.isRead ? "text-slate-500" : "text-slate-300"}`}>
                      {email.subject}
                    </p>
                    <p className="text-xs text-slate-600 truncate mt-0.5">{email.body}</p>
                  </div>
                  <p className="text-xs text-slate-500 shrink-0">
                    {new Date(email.date).toLocaleDateString("ko-KR")}
                  </p>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

Check dev terminal for TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/GoogleWorkspace/GmailPanel.tsx
git commit -m "feat: add GmailPanel with inbox and compose"
```

---

## Task 5: CalendarPanel Component

**Files:**
- Create: `client/src/components/GoogleWorkspace/CalendarPanel.tsx`

Shows upcoming events. "일정 추가" expands a create-event form.

- [ ] **Step 1: Create the file**

```tsx
import { useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Plus, Loader2, Trash2, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

export default function CalendarPanel() {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [description, setDescription] = useState("");

  const { data, isLoading, refetch } = trpc.googleWorkspace.calendar.getUpcomingEvents.useQuery({
    maxResults: 10,
  });

  const createMutation = trpc.googleWorkspace.calendar.createEvent.useMutation({
    onSuccess: () => {
      toast.success("일정이 추가되었습니다.");
      setShowCreate(false);
      setTitle(""); setStartTime(""); setEndTime(""); setDescription("");
      refetch();
    },
    onError: (err) => toast.error(`일정 추가 실패: ${err.message}`),
  });

  const deleteMutation = trpc.googleWorkspace.calendar.deleteEvent.useMutation({
    onSuccess: () => {
      toast.success("일정이 삭제되었습니다.");
      refetch();
    },
    onError: (err) => toast.error(`삭제 실패: ${err.message}`),
  });

  const handleCreate = () => {
    if (!title || !startTime || !endTime) {
      toast.error("제목, 시작 시간, 종료 시간을 입력하세요.");
      return;
    }
    createMutation.mutate({ title, startTime, endTime, description });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <Calendar className="w-4 h-4 text-cyan-400" />
          다가오는 일정
        </h3>
        <div className="flex gap-2">
          <Button onClick={() => refetch()} variant="ghost" size="sm" className="text-slate-400 hover:text-slate-300">
            <RefreshCw className="w-3 h-3" />
          </Button>
          <Button
            onClick={() => setShowCreate((v) => !v)}
            size="sm"
            className="bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            <Plus className="w-3 h-3 mr-1" />
            일정 추가
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Card className="bg-slate-800 border-slate-700 p-4 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-white">새 일정</span>
                <button onClick={() => setShowCreate(false)}>
                  <X className="w-4 h-4 text-slate-400 hover:text-slate-300" />
                </button>
              </div>
              <Input
                placeholder="일정 제목"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white placeholder-slate-500"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">시작</label>
                  <Input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">종료</label>
                  <Input
                    type="datetime-local"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
              </div>
              <Input
                placeholder="설명 (선택)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white placeholder-slate-500"
              />
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                추가
              </Button>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        </div>
      ) : !data?.events?.length ? (
        <p className="text-slate-500 text-sm text-center py-8">다가오는 일정이 없거나 Google 계정이 연결되지 않았습니다.</p>
      ) : (
        <div className="space-y-2">
          {data.events.map((event) => (
            <motion.div key={event.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
              <Card className="bg-slate-800 border-slate-700 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white font-medium truncate">{event.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(event.startTime).toLocaleString("ko-KR")}
                    </p>
                    {event.location && (
                      <p className="text-xs text-slate-500 truncate mt-0.5">{event.location}</p>
                    )}
                  </div>
                  <Button
                    onClick={() => deleteMutation.mutate({ eventId: event.id })}
                    disabled={deleteMutation.isPending}
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:text-red-300 hover:bg-red-950/30 shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

- [ ] **Step 3: Commit**

```bash
git add client/src/components/GoogleWorkspace/CalendarPanel.tsx
git commit -m "feat: add CalendarPanel with event list and create"
```

---

## Task 6: DrivePanel Component

**Files:**
- Create: `client/src/components/GoogleWorkspace/DrivePanel.tsx`

File search with list view. Share and delete actions.

- [ ] **Step 1: Create the file**

```tsx
import { useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { HardDrive, Search, Loader2, Trash2, Share2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

export default function DrivePanel() {
  const [query, setQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const { data, isLoading, refetch } = trpc.googleWorkspace.drive.searchFiles.useQuery({
    query: query || "trashed = false",
    maxResults: 20,
  });

  const deleteMutation = trpc.googleWorkspace.drive.deleteFile.useMutation({
    onSuccess: () => { toast.success("파일이 삭제되었습니다."); refetch(); },
    onError: (err) => toast.error(`삭제 실패: ${err.message}`),
  });

  const shareMutation = trpc.googleWorkspace.drive.shareFile.useMutation({
    onSuccess: () => toast.success("파일이 공유되었습니다."),
    onError: (err) => toast.error(`공유 실패: ${err.message}`),
  });

  const handleSearch = () => setQuery(searchInput || "trashed = false");

  const handleShare = async (fileId: string, fileName: string) => {
    const email = window.prompt(`"${fileName}" 파일을 공유할 이메일을 입력하세요:`);
    if (!email) return;
    shareMutation.mutate({ fileId, email, role: "reader" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-cyan-400" />
          Google Drive
        </h3>
        <Button onClick={() => refetch()} variant="ghost" size="sm" className="text-slate-400 hover:text-slate-300">
          <RefreshCw className="w-3 h-3" />
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="파일 검색..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="bg-slate-700 border-slate-600 text-white placeholder-slate-500"
        />
        <Button onClick={handleSearch} size="sm" className="bg-cyan-600 hover:bg-cyan-700 text-white shrink-0">
          <Search className="w-4 h-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        </div>
      ) : !data?.files?.length ? (
        <p className="text-slate-500 text-sm text-center py-8">
          파일이 없거나 Google 계정이 연결되지 않았습니다.
        </p>
      ) : (
        <div className="space-y-2">
          {data.files.map((file: any) => (
            <motion.div key={file.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
              <Card className="bg-slate-800 border-slate-700 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{file.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {file.mimeType?.split(".").pop() ?? file.mimeType}
                      {file.size ? ` · ${Math.round(file.size / 1024)}KB` : ""}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      onClick={() => handleShare(file.id, file.name)}
                      disabled={shareMutation.isPending}
                      variant="ghost"
                      size="sm"
                      className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-950/30"
                    >
                      <Share2 className="w-3 h-3" />
                    </Button>
                    <Button
                      onClick={() => deleteMutation.mutate({ fileId: file.id })}
                      disabled={deleteMutation.isPending}
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300 hover:bg-red-950/30"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

- [ ] **Step 3: Commit**

```bash
git add client/src/components/GoogleWorkspace/DrivePanel.tsx
git commit -m "feat: add DrivePanel with file search, share, delete"
```

---

## Task 7: SheetsPanel Component

**Files:**
- Create: `client/src/components/GoogleWorkspace/SheetsPanel.tsx`

Read-only panel: open a spreadsheet by ID and display data.

- [ ] **Step 1: Create the file**

```tsx
import { useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Table2, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

export default function SheetsPanel() {
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [range, setRange] = useState("Sheet1!A1:Z100");
  const [queryId, setQueryId] = useState("");
  const [queryRange, setQueryRange] = useState("Sheet1!A1:Z100");

  const { data, isLoading } = trpc.googleWorkspace.sheets.readSheet.useQuery(
    { spreadsheetId: queryId, range: queryRange },
    { enabled: !!queryId }
  );

  const handleLoad = () => {
    if (!spreadsheetId.trim()) {
      toast.error("스프레드시트 ID를 입력하세요.");
      return;
    }
    setQueryId(spreadsheetId.trim());
    setQueryRange(range.trim() || "Sheet1!A1:Z100");
  };

  return (
    <div className="space-y-4">
      <h3 className="text-white font-semibold flex items-center gap-2">
        <Table2 className="w-4 h-4 text-cyan-400" />
        Google Sheets
      </h3>

      <Card className="bg-slate-800 border-slate-700 p-4 space-y-3">
        <Input
          placeholder="스프레드시트 ID (URL에서 복사)"
          value={spreadsheetId}
          onChange={(e) => setSpreadsheetId(e.target.value)}
          className="bg-slate-700 border-slate-600 text-white placeholder-slate-500"
        />
        <div className="flex gap-2">
          <Input
            placeholder="범위 (예: Sheet1!A1:Z100)"
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="bg-slate-700 border-slate-600 text-white placeholder-slate-500"
          />
          <Button onClick={handleLoad} size="sm" className="bg-cyan-600 hover:bg-cyan-700 text-white shrink-0">
            <Search className="w-4 h-4" />
          </Button>
        </div>
      </Card>

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        </div>
      )}

      {data?.data && data.data.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full text-sm">
              <tbody>
                {data.data.map((row: any[], rowIdx: number) => (
                  <tr key={rowIdx} className={rowIdx % 2 === 0 ? "bg-slate-800" : "bg-slate-800/50"}>
                    {row.map((cell: any, cellIdx: number) => (
                      <td
                        key={cellIdx}
                        className={`px-3 py-2 border-r border-slate-700 last:border-r-0 truncate max-w-[200px] ${
                          rowIdx === 0 ? "text-cyan-300 font-medium" : "text-slate-300"
                        }`}
                      >
                        {String(cell ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {queryId && !isLoading && (!data?.data || data.data.length === 0) && (
        <p className="text-slate-500 text-sm text-center py-4">데이터가 없거나 접근 권한이 없습니다.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

- [ ] **Step 3: Commit**

```bash
git add client/src/components/GoogleWorkspace/SheetsPanel.tsx
git commit -m "feat: add SheetsPanel with spreadsheet reader"
```

---

## Task 8: Google Workspace Page

**Files:**
- Create: `client/src/pages/Google.tsx`

Orchestrates all panels in a tab layout.

- [ ] **Step 1: Create the file**

```tsx
import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, Calendar, HardDrive, Table2 } from "lucide-react";
import GoogleAuthCard from "@/components/GoogleWorkspace/GoogleAuthCard";
import GmailPanel from "@/components/GoogleWorkspace/GmailPanel";
import CalendarPanel from "@/components/GoogleWorkspace/CalendarPanel";
import DrivePanel from "@/components/GoogleWorkspace/DrivePanel";
import SheetsPanel from "@/components/GoogleWorkspace/SheetsPanel";

const TABS = [
  { id: "gmail", label: "Gmail", icon: Mail },
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "drive", label: "Drive", icon: HardDrive },
  { id: "sheets", label: "Sheets", icon: Table2 },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Google() {
  const [activeTab, setActiveTab] = useState<TabId>("gmail");

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black px-4 md:px-8 py-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-4xl mx-auto space-y-6"
      >
        {/* Header */}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent leading-tight">
            Google Workspace
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Gmail · Calendar · Drive · Sheets 통합 관리
          </p>
        </div>

        {/* Auth Card */}
        <GoogleAuthCard />

        {/* Tab Bar */}
        <div className="flex gap-1 bg-slate-800/50 p-1 rounded-lg border border-slate-700">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                  isActive
                    ? "bg-cyan-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-300 hover:bg-slate-700/50"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Panel */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="bg-slate-900/50 border border-slate-700 rounded-xl p-4 md:p-6"
        >
          {activeTab === "gmail" && <GmailPanel />}
          {activeTab === "calendar" && <CalendarPanel />}
          {activeTab === "drive" && <DrivePanel />}
          {activeTab === "sheets" && <SheetsPanel />}
        </motion.div>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Google.tsx
git commit -m "feat: add Google Workspace page with tab layout"
```

---

## Task 9: Wire Route and Sidebar Link

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/Sidebar.tsx`

- [ ] **Step 1: Add route in App.tsx**

Add the import after existing page imports:

```tsx
import Google from "./pages/Google";
```

Add the route inside `<Switch>` after the `/chat` route:

```tsx
<Route path={"/google"} component={Google} />
```

- [ ] **Step 2: Add Google Workspace link in Sidebar (desktop)**

In `client/src/components/Sidebar.tsx`, add `LayoutGrid` to the lucide import:

```tsx
import { ChevronRight, MessageCircle, LayoutGrid } from "lucide-react";
```

In the desktop sidebar, after the existing Chat Link `<Link>`, add:

```tsx
<Link href="/google">
  <a className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-colors mt-2">
    <LayoutGrid className="w-4 h-4" />
    Google Workspace
  </a>
</Link>
```

- [ ] **Step 3: Add same link to mobile sidebar**

In the mobile sidebar section, after the Chat Link `<Link>`, add the same block:

```tsx
<Link href="/google">
  <a
    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-colors mt-2"
    onClick={onClose}
  >
    <LayoutGrid className="w-4 h-4" />
    Google Workspace
  </a>
</Link>
```

- [ ] **Step 4: Open http://localhost:4000/google and verify the page loads with tabs**

- [ ] **Step 5: Verify sidebar shows both links on desktop and mobile**

- [ ] **Step 6: Commit**

```bash
git add client/src/App.tsx client/src/components/Sidebar.tsx
git commit -m "feat: add /google route and sidebar navigation link"
```

---

## Task 10: Final Push to GitHub

- [ ] **Step 1: Verify all 9 previous commits are in git log**

```bash
git log --oneline -12
```

- [ ] **Step 2: Push to GitHub**

```bash
git push
```

- [ ] **Step 3: Confirm push succeeded**

Expected output: `main -> main` with no errors.
