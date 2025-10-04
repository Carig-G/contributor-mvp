"use client";
import { useEffect, useState } from "react";
import { sb } from "../lib/supabase";


export default function AuthBox() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [session, setSession] = useState<any>(null);

// Replace the useEffect at the top with this:
useEffect(() => {
  sb().auth.getSession().then(({ data }) => setSession(data.session));
}, []);


  async function sendLink() {
    const { error } = await sb().auth.signInWithOtp({ email });
    if (!error) setSent(true);
    else alert(error.message);
  }

  // Ensure a user row exists for this account
  useEffect(() => {
    if (session) sb().rpc("ensure_user_row");
  }, [session]);

  if (session) return null;

  return (
    <div className="mx-auto my-4 max-w-md rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-800">
      {!sent ? (
        <>
          <div className="mb-2 font-medium">Private alpha sign-in</div>
          <input
            className="mb-2 w-full rounded border border-neutral-300 p-2 dark:border-neutral-700 dark:bg-neutral-900"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            className="rounded bg-black px-3 py-2 text-white dark:bg-white dark:text-black"
            onClick={sendLink}
          >
            Send magic link
          </button>
        </>
      ) : (
        <div>Check your email for a magic link…</div>
      )}
    </div>
  );
}
