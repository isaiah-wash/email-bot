"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Draft {
  id: string;
  subject: string;
  body: string;
  status: string;
  contact: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    title: string | null;
    linkedinUrl: string | null;
    linkedinData: Record<string, unknown> | null;
  };
  campaignContact: {
    campaign: { id: string; name: string };
  } | null;
  sentEmail: { sentAt: string; gmailMessageId: string } | null;
}

interface Thread {
  id: string;
  subject: string;
  messages: { id: string; from: string; to: string; date: string; body: string; snippet: string }[];
}

export default function ComposePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const draftId = params.draftId as string;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (!session) return;
    fetchDraft();
  }, [session, draftId]);

  async function fetchDraft() {
    const res = await fetch(`/api/drafts/${draftId}`);
    if (!res.ok) {
      router.replace("/dashboard");
      return;
    }
    const data = await res.json();
    setDraft(data);
    setSubject(data.subject);
    setBody(data.body);
    setLoading(false);

    if (data.contact.email) {
      fetch(`/api/gmail/threads?email=${encodeURIComponent(data.contact.email)}`)
        .then((r) => r.json())
        .then((t) => { if (Array.isArray(t)) setThreads(t); })
        .catch(() => {});
    }
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/drafts/${draftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body, status: "EDITED" }),
    });
    if (res.ok) {
      const updated = await res.json();
      setDraft({ ...draft!, ...updated });
      showToast("Draft saved");
    }
    setSaving(false);
  }

  async function handleApproveAndSend() {
    if (!draft?.contact.email) {
      showToast("Contact has no email address");
      return;
    }
    setSending(true);

    // First approve
    await fetch(`/api/drafts/${draftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body, status: "APPROVED" }),
    });

    // Then send
    const res = await fetch("/api/gmail/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftId }),
    });

    if (res.ok) {
      showToast("Email sent!");
      fetchDraft();
    } else {
      const data = await res.json();
      showToast(data.error || "Failed to send");
    }
    setSending(false);
  }

  async function handleDiscard() {
    if (!confirm("Discard this draft?")) return;
    await fetch(`/api/drafts/${draftId}`, { method: "DELETE" });
    router.back();
  }

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 3000);
  }

  if (status === "loading" || loading || !session) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="h-5 w-5 rounded-full border-2 border-zinc-300 border-t-zinc-600 animate-spin" />
      </div>
    );
  }

  if (!draft) return null;

  const contact = draft.contact;
  const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unnamed";
  const isSent = draft.status === "SENT";
  const linkedinProfile = contact.linkedinData;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <button onClick={() => router.back()} className="text-sm text-zinc-500 hover:text-zinc-900">
          &larr; Back
        </button>
        {draft.campaignContact && (
          <Link
            href={`/campaigns/${draft.campaignContact.campaign.id}`}
            className="text-xs text-zinc-500 hover:text-zinc-900"
          >
            Campaign: {draft.campaignContact.campaign.name}
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Editor Panel */}
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">
                {isSent ? "Sent Email" : "Draft Email"}
              </h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                isSent ? "bg-emerald-50 text-emerald-700" :
                draft.status === "APPROVED" ? "bg-blue-50 text-blue-700" :
                draft.status === "EDITED" ? "bg-amber-50 text-amber-700" :
                "bg-zinc-100 text-zinc-600"
              }`}>
                {draft.status}
              </span>
            </div>

            <div className="text-xs text-zinc-500 mb-4">
              To: {contact.email || "No email"}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={isSent}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:bg-zinc-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Body</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  disabled={isSent}
                  rows={16}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm leading-relaxed focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:bg-zinc-50 font-mono"
                />
              </div>
            </div>

            {!isSent && (
              <div className="mt-4 flex items-center justify-between">
                <button
                  onClick={handleDiscard}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Discard
                </button>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Draft"}
                  </button>
                  <button
                    onClick={handleApproveAndSend}
                    disabled={sending || !contact.email}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {sending ? "Sending..." : "Approve & Send"}
                  </button>
                </div>
              </div>
            )}

            {isSent && draft.sentEmail && (
              <div className="mt-4 text-xs text-zinc-400">
                Sent on {new Date(draft.sentEmail.sentAt).toLocaleString()}
              </div>
            )}
          </div>
        </div>

        {/* Context Sidebar */}
        <div className="lg:col-span-2 space-y-4">
          {/* Contact Info */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <h3 className="text-sm font-semibold mb-3">Contact</h3>
            <div className="space-y-2 text-sm">
              <div>
                <Link href={`/contacts/${contact.id}`} className="font-medium hover:underline">
                  {contactName}
                </Link>
              </div>
              {contact.title && contact.company && (
                <div className="text-zinc-500">{contact.title} at {contact.company}</div>
              )}
              {contact.email && <div className="text-zinc-500">{contact.email}</div>}
              {contact.linkedinUrl && (
                <a href={contact.linkedinUrl} target="_blank" rel="noopener" className="text-blue-600 text-xs hover:underline block">
                  LinkedIn Profile
                </a>
              )}
            </div>
          </div>

          {/* LinkedIn Data */}
          {linkedinProfile && (
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <h3 className="text-sm font-semibold mb-3">LinkedIn</h3>
              {(linkedinProfile as Record<string, unknown>).headline ? (
                <p className="text-sm text-zinc-700 mb-2">
                  {String((linkedinProfile as Record<string, unknown>).headline)}
                </p>
              ) : null}
              {(linkedinProfile as Record<string, unknown>).summary ? (
                <p className="text-xs text-zinc-500 line-clamp-4">
                  {String((linkedinProfile as Record<string, unknown>).summary)}
                </p>
              ) : null}
            </div>
          )}

          {/* Email Thread History */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <h3 className="text-sm font-semibold mb-3">Email History</h3>
            {threads.length === 0 ? (
              <p className="text-xs text-zinc-400">No previous conversations.</p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {threads.slice(0, 5).map((thread) => (
                  <div key={thread.id} className="border-b border-zinc-100 pb-2 last:border-0">
                    <div className="text-xs font-medium">{thread.subject}</div>
                    {thread.messages.slice(-2).map((msg) => (
                      <div key={msg.id} className="mt-1">
                        <div className="text-xs text-zinc-500">{msg.from.split("<")[0].trim()}</div>
                        <div className="text-xs text-zinc-400 line-clamp-2">{msg.snippet}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
