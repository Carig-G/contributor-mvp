"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Heart, Eye, Sparkles, Moon, SunMedium, ChevronLeft, Send } from "lucide-react";
import AuthBox from "./auth-box";
import { sb } from "../lib/supabase";


type Spark = { id: string; author_id: string; body: string; status: "OPEN"|"TAKEN"|"CLOSED"; created_at: string; selected_contributor_id: string | null; likes?: number; };
type MsgWithHandle = { id: string; spark_id: string; author_id: string; author_handle: string; body: string; idx: number; created_at: string; };

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/60 dark:focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-900";

const Card: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ className = "", children }) => (
  <motion.div layout whileHover={{ y: -2 }} className={`rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 ${className}`}>{children}</motion.div>
);

const Pill: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className = "", children, ...p }) => (
  <motion.button whileTap={{ scale: 0.98 }} className={`inline-flex items-center justify-center rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm shadow-sm dark:border-neutral-800 dark:bg-neutral-900 ${focusRing} ${className}`} {...p}>{children}</motion.button>
);

const Textarea: React.FC<{ placeholder?: string; onSend: (text: string) => Promise<void> | void }> = ({ placeholder = "Write your reply…", onSend }) => {
  const [text, setText] = useState(""); const disabled = text.trim().length === 0;
  return (
    <div>
      <textarea
        className={`h-28 w-full resize-none rounded-2xl border border-neutral-200 bg-white p-3 text-sm outline-none placeholder:text-neutral-400 focus:ring-2 focus:ring-black/10 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white ${focusRing}`}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-3 flex items-center justify-end gap-2">
        <button onClick={() => setText("")} className="text-sm text-neutral-500">Clear</button>
        <button
          disabled={disabled}
          onClick={async () => { if (!disabled) { await onSend(text); setText(""); } }}
          className={`rounded-full px-4 py-2 text-sm inline-flex items-center gap-2 ${disabled ? "bg-neutral-300 text-neutral-600" : "bg-black text-white dark:bg-white dark:text-black"}`}
        >
          <Send size={16}/> Send
        </button>
      </div>
    </div>
  );
};

const Bubble: React.FC<{ me?: boolean; handle: string; text: string }> = ({ me, handle, text }) => (
  <div className={`flex ${me ? "justify-end" : "justify-start"}`}>
    <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow ${me ? "bg-black text-white dark:bg-white dark:text-black" : "bg-white border border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800"}`}>
      <div className={`mb-1 text-[11px] ${me ? "text-white/70 dark:text-black/60" : "text-neutral-500 dark:text-neutral-400"}`}>{handle}</div>
      <div>{text}</div>
    </div>
  </div>
);

export default function Page() {
  const [dark, setDark] = useState(false);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);

  // Session
  const [session, setSession] = useState<any>(null);
  useEffect(() => {
    const c = sb();
    c.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = c.auth.onAuthStateChange((_e, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);
  // Ensure user row exists whenever we have a session
  useEffect(() => {
    if (session) sb().rpc("ensure_user_row");
  }, [session]);

// Feed
const [sparks, setSparks] = useState<Spark[]>([]);
const [view, setView] = useState<"feed" | "mine">("feed");
const myUserId = session?.user?.id as string | undefined;

// Load Feed (all sparks, newest first)
async function loadFeed() {
  const { data, error } = await sb()
    .from("sparks")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("loadFeed error:", error);
    return;
  }

  setSparks(data as any);
}

// Load Mine (only sparks where I'm author or selected contributor)
async function loadMine() {
  if (!myUserId) {
    setSparks([]);
    return;
  }

  const { data, error } = await sb()
    .from("sparks")
    .select("*")
    .or(`author_id.eq.${myUserId},selected_contributor_id.eq.${myUserId}`)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("loadMine error:", error);
    return;
  }

  setSparks(data as any);
}

// Choose which loader to run
useEffect(() => {
  if (view === "feed") loadFeed();
  else loadMine();
}, [session, view]);


  // New spark
  const [showNewSpark, setShowNewSpark] = useState(false);
async function createSpark(body: string) {
  try {
    // ensure a user row exists for this session
    const { error: e1 } = await sb().rpc("ensure_user_row");
    if (e1) throw e1;

    const { data, error } = await sb().rpc("create_spark", { p_body: body });
    if (error) throw error;

    await loadSparks();
    setShowNewSpark(false);
  } catch (e: any) {
    alert(e?.message ?? "Failed to create spark. Open DevTools > Console for details.");
    console.error("createSpark error:", e);
  }
}


  // Conversation
  const [selected, setSelected] = useState<Spark | null>(null);
  const [messages, setMessages] = useState<MsgWithHandle[]>([]);
  async function openSpark(s: Spark) {
    setSelected(s);
    const { data, error } = await sb().from("messages_with_handles").select("*").eq("spark_id", s.id).order("idx", { ascending: true });
    if (!error && data) setMessages(data as any);
  }

  async function claimAndReply(text: string) {
    if (!selected) return;
    const { data, error } = await sb().rpc("claim_spark_and_reply", { p_spark_id: selected.id, p_body: text });
    if (error) { alert(error.message); return; }
    setMessages((m) => [...m, data as any]);
    setSparks((prev) => prev.map((sp) => sp.id === selected.id ? { ...sp, status: "TAKEN" } : sp));
  }

  async function postMessage(text: string) {
    if (!selected) return;
    const { data, error } = await sb().rpc("post_message", { p_spark_id: selected.id, p_body: text });
    if (error) { alert(error.message); return; }
    setMessages((m) => [...m, data as any]);
  }

  async function followSpark(sparkId: string) {
    const { error } = await sb().rpc("follow_spark", { p_spark_id: sparkId });
    if (error) alert(error.message);
  }

async function toggleLike(sparkId: string) {
  const { data, error } = await sb().rpc("toggle_like", { p_spark_id: sparkId });
  if (error) {
    alert(error.message);
    return;
  }
  await loadSparks(); // refresh counts
}

  const isParticipant =
  !!selected &&
  !!myUserId &&
  (myUserId === selected.author_id || myUserId === selected.selected_contributor_id);
  const selectedMsgsSorted = useMemo(() => [...messages].sort((a, b) => a.idx - b.idx), [messages]);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-neutral-200 bg-white/70 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/70">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <div className="text-sm font-semibold tracking-tight">Contributor</div>
          <button onClick={() => setDark(!dark)} className={`rounded-full border border-neutral-200 p-1.5 dark:border-neutral-800 ${focusRing}`} aria-label="Toggle theme">
            {dark ? <SunMedium size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>
{/* TEMP: session badge + fix button */}
<div className="mx-auto max-w-md px-4 py-2 text-xs text-neutral-600 dark:text-neutral-300">
  {session ? (
    <div className="flex items-center justify-between">
      <div>
        Logged in as: <b>{session.user?.email}</b> · user_id: <code>{session.user?.id}</code>
      </div>
      <button
        className="rounded border px-2 py-1"
        onClick={async () => {
          try {
            const { data, error } = await sb().rpc("ensure_user_row");
            if (error) throw error;
            alert("User row ensured ✅");
          } catch (e:any) {
            alert("ensure_user_row failed: " + (e?.message ?? "unknown error"));
            console.error(e);
          }
        }}
      >
        Fix account
      </button>
    </div>
  ) : (
    <>Not logged in</>
  )}
</div>
<div className="mx-auto max-w-md px-4 py-2">
  <div className="flex gap-2">
    <button
      className={`rounded-full px-3 py-1 text-sm border ${
        view === "feed"
          ? "bg-black text-white dark:bg-white dark:text-black"
          : "bg-white dark:bg-neutral-900"
      } border-neutral-200 dark:border-neutral-800`}
      onClick={() => setView("feed")}
    >
      Feed
    </button>
    <button
      className={`rounded-full px-3 py-1 text-sm border ${
        view === "mine"
          ? "bg-black text-white dark:bg-white dark:text-black"
          : "bg-white dark:bg-neutral-900"
      } border-neutral-200 dark:border-neutral-800`}
      onClick={() => setView("mine")}
    >
      My Conversations
    </button>
  </div>
</div>

      {/* Auth (hidden once logged in) */}
      <AuthBox />

      {/* New Spark */}
      {session && (
        <div className="mx-auto max-w-md p-4 pt-0">
          <button
            onClick={() => setShowNewSpark(true)}
            className="w-full rounded-2xl border border-neutral-300 bg-white p-3 text-left text-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            Start a new spark…
          </button>
        </div>
      )}
      <AnimatePresence>
        {showNewSpark && (
          <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4">
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-4 shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
              <div className="mb-2 text-sm font-semibold">Create a spark</div>
              <Textarea placeholder="Write the opening line or question…" onSend={createSpark} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Feed */}
      <div className="mx-auto max-w-md space-y-3 p-4 pb-24">
        {sparks.length === 0 && <Card className="text-center text-sm text-neutral-600 dark:text-neutral-300">No sparks yet. Create one above.</Card>}
        {sparks.map((s) => (
          <Card key={s.id}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"><MessageCircle size={18} /></div>
              <div className="flex-1">
                <div className="mb-3 text-base font-medium">{s.body}</div>
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
                  <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 dark:border-neutral-800 dark:bg-neutral-800/60">
                    {s.status === "OPEN" ? "Open for a partner" : s.status === "TAKEN" ? "In progress" : "Closed"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {s.status === "OPEN" ? (
                    <Pill onClick={() => openSpark(s)}><Sparkles size={16} className="mr-2" />Contribute</Pill>
                  ) : (
                    <Pill onClick={() => openSpark(s)}><Eye size={16} className="mr-2" />Follow / Read</Pill>
                  )}
                  <Pill onClick={() => toggleLike(s.id)}>
  <Heart size={16} className="mr-2" />
  {s.likes ? `Like (${s.likes})` : "Like"}
</Pill>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Conversation overlay */}
      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-white dark:bg-neutral-950">
            <div className="mx-auto flex h-full max-w-md flex-col">
              <div className="flex items-center gap-3 border-b border-neutral-200 p-4 dark:border-neutral-800">
                <button onClick={() => setSelected(null)} className={`rounded-full border border-neutral-200 p-2 dark:border-neutral-800 ${focusRing}`} aria-label="Back">
                  <ChevronLeft size={18} />
                </button>
                <div className="text-base font-semibold">{selected.body}</div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {selectedMsgsSorted.length === 0 ? (
                  <Card className="text-center text-sm text-neutral-600 dark:text-neutral-300">Be the first to reply and start this dialogue.</Card>
                ) : (
                  selectedMsgsSorted.map((m) => (
                    <Bubble key={m.id} me={!!myUserId && m.author_id === myUserId} handle={m.author_handle} text={m.body} />
                  ))
                )}
              </div>

              <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
                <div className="flex items-center gap-2">
                  {selected.status === "OPEN" ? (
                    <Pill onClick={() => setShowComposer(true)} className="flex-1"><Sparkles size={16} className="mr-2" />Contribute</Pill>
                  ) : (
                    <Pill onClick={() => followSpark(selected.id)} className="flex-1"><Eye size={16} className="mr-2" />Follow This Conversation</Pill>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

{/* Composer */}
<AnimatePresence>
  {selected && (
    selected.status === "OPEN" || isParticipant ? (
      <ComposeReply
        open={selected !== null}
        isOpenSpark={selected.status === "OPEN"}
        onClose={() => {}}
        onSend={async (txt) => {
          if (!selected) return;
          if (selected.status === "OPEN") {
            await claimAndReply(txt);
            setSelected((s) => (s ? { ...s, status: "TAKEN" } : s));
          } else if (isParticipant) {
            await postMessage(txt);
          }
          await openSpark(selected);
        }}
      />
    ) : null
  )}
</AnimatePresence>

    </div>
  );
}

const ComposeReply: React.FC<{ open: boolean; isOpenSpark: boolean; onClose: () => void; onSend: (text: string) => Promise<void>; }> = ({ open, isOpenSpark, onClose, onSend }) => {
  const [show, setShow] = useState(false);
  useEffect(() => setShow(open), [open]);
  if (!show) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-3xl border border-neutral-200 bg-white p-4 shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
      <div className="mb-2 text-sm font-semibold">{isOpenSpark ? "Contribute your first reply" : "Reply"}</div>
      <Textarea onSend={onSend} />
    </div>
  );
};
