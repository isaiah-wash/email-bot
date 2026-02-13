"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Contact {
  id: string;
  email: string | null;
  linkedinUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
  linkedinData: Record<string, unknown> | null;
  enrichedAt: string | null;
  emailDrafts: {
    id: string;
    subject: string;
    status: string;
    createdAt: string;
    sentEmail: { sentAt: string } | null;
  }[];
  campaignContacts: {
    id: string;
    status: string;
    campaign: { id: string; name: string };
  }[];
}

interface Thread {
  id: string;
  subject: string;
  snippet: string;
  messages: { id: string; from: string; date: string; snippet: string }[];
}

export default function ContactDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const contactId = params.id as string;

  const [contact, setContact] = useState<Contact | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [showGenerate, setShowGenerate] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (!session) return;
    fetchContact();
    fetchTemplates();
  }, [session, contactId]);

  async function fetchContact() {
    setLoading(true);
    const res = await fetch(`/api/contacts/${contactId}`);
    if (!res.ok) {
      router.replace("/contacts");
      return;
    }
    const data = await res.json();
    setContact(data);
    setLoading(false);

    if (data.email) {
      fetch(`/api/gmail/threads?email=${encodeURIComponent(data.email)}`)
        .then((r) => r.json())
        .then((t) => { if (Array.isArray(t)) setThreads(t); })
        .catch(() => {});
    }
  }

  async function fetchTemplates() {
    const res = await fetch("/api/templates");
    const data = await res.json();
    if (Array.isArray(data)) setTemplates(data);
  }

  async function handleEnrich() {
    setEnriching(true);
    setError("");
    try {
      const res = await fetch(`/api/contacts/${contactId}/enrich`, { method: "POST" });
      if (res.ok) {
        fetchContact();
      } else {
        const data = await res.json();
        setError(data.error || "Enrichment failed");
      }
    } catch {
      setError("Failed to connect to enrichment service");
    }
    setEnriching(false);
  }

  async function handleGenerate() {
    if (!selectedTemplate) return;
    setGenerating(true);
    const res = await fetch("/api/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId, templateId: selectedTemplate }),
    });
    if (res.ok) {
      const draft = await res.json();
      router.push(`/compose/${draft.id}`);
    }
    setGenerating(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this contact and all associated data?")) return;
    await fetch(`/api/contacts/${contactId}`, { method: "DELETE" });
    router.replace("/contacts");
  }

  if (status === "loading" || loading || !session) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="h-5 w-5 rounded-full border-2 border-zinc-300 border-t-zinc-600 animate-spin" />
      </div>
    );
  }

  if (!contact) return null;

  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unnamed Contact";
  const linkedinProfile = contact.linkedinData as Record<string, unknown> | null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/contacts" className="text-sm text-zinc-500 hover:text-zinc-900 mb-4 inline-block">
        &larr; Back to contacts
      </Link>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => setError("")}
            className="text-red-500 hover:text-red-700 text-sm"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-zinc-200 bg-white p-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-semibold">{name}</h1>
                {contact.title && contact.company && (
                  <p className="text-sm text-zinc-500 mt-0.5">{contact.title} at {contact.company}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {contact.linkedinUrl && (
                  <button
                    onClick={handleEnrich}
                    disabled={enriching}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {enriching ? "Enriching..." : contact.enrichedAt ? "Re-enrich from LinkedIn" : "Enrich from LinkedIn"}
                  </button>
                )}
                <button
                  onClick={() => setShowGenerate(!showGenerate)}
                  className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                >
                  Generate Email
                </button>
                <button
                  onClick={handleDelete}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>

            {showGenerate && (
              <div className="mt-4 flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50 p-4">
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Select a template...</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleGenerate}
                  disabled={!selectedTemplate || generating}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {generating ? "Generating..." : "Generate"}
                </button>
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-zinc-500">Email</span>
                <p className="mt-0.5 font-medium">{contact.email || "—"}</p>
              </div>
              <div>
                <span className="text-zinc-500">LinkedIn</span>
                <p className="mt-0.5 font-medium">
                  {contact.linkedinUrl ? (
                    <a href={contact.linkedinUrl} target="_blank" rel="noopener" className="text-blue-600 hover:underline">
                      Profile
                    </a>
                  ) : "—"}
                </p>
              </div>
              <div>
                <span className="text-zinc-500">Company</span>
                <p className="mt-0.5 font-medium">{contact.company || "—"}</p>
              </div>
              <div>
                <span className="text-zinc-500">Title</span>
                <p className="mt-0.5 font-medium">{contact.title || "—"}</p>
              </div>
            </div>

            {contact.enrichedAt && (
              <p className="mt-4 text-xs text-zinc-400">
                Enriched on {new Date(contact.enrichedAt).toLocaleDateString()}
              </p>
            )}
          </div>

          {/* LinkedIn Data */}
          {linkedinProfile && (
            <div className="rounded-xl border border-zinc-200 bg-white p-6">
              <h2 className="text-sm font-semibold mb-3">LinkedIn Profile</h2>
              {linkedinProfile.headline ? (
                <p className="text-sm text-zinc-700">{String(linkedinProfile.headline)}</p>
              ) : null}
              {linkedinProfile.summary ? (
                <p className="mt-2 text-sm text-zinc-500 line-clamp-4">{String(linkedinProfile.summary)}</p>
              ) : null}
              {Array.isArray(linkedinProfile.experiences) && linkedinProfile.experiences.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-medium text-zinc-500 mb-2">Experience</h3>
                  <div className="space-y-2">
                    {(linkedinProfile.experiences as { title: string; company: string; ends_at: unknown }[]).slice(0, 3).map((exp, i) => (
                      <div key={i} className="text-sm">
                        <span className="font-medium">{exp.title}</span>
                        <span className="text-zinc-500"> at {exp.company}</span>
                        {!exp.ends_at && <span className="ml-2 text-xs text-emerald-600">Current</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Email History */}
          <div className="rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="text-sm font-semibold mb-3">Email History</h2>
            {threads.length === 0 ? (
              <p className="text-sm text-zinc-400">
                {contact.email ? "No email threads found." : "Add an email address to see thread history."}
              </p>
            ) : (
              <div className="space-y-3">
                {threads.map((thread) => (
                  <div key={thread.id} className="rounded-lg border border-zinc-100 p-3">
                    <div className="text-sm font-medium">{thread.subject}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{thread.snippet}</div>
                    <div className="text-xs text-zinc-400 mt-1">{thread.messages.length} messages</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Drafts */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <h2 className="text-sm font-semibold mb-3">Email Drafts</h2>
            {contact.emailDrafts.length === 0 ? (
              <p className="text-sm text-zinc-400">No drafts yet.</p>
            ) : (
              <div className="space-y-2">
                {contact.emailDrafts.map((draft) => (
                  <Link
                    key={draft.id}
                    href={`/compose/${draft.id}`}
                    className="block rounded-lg border border-zinc-100 p-3 hover:bg-zinc-50 transition-colors"
                  >
                    <div className="text-sm font-medium truncate">{draft.subject}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs rounded-full px-2 py-0.5 ${
                        draft.status === "SENT" ? "bg-emerald-50 text-emerald-700" :
                        draft.status === "APPROVED" ? "bg-blue-50 text-blue-700" :
                        "bg-zinc-100 text-zinc-600"
                      }`}>
                        {draft.status}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {new Date(draft.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Campaigns */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <h2 className="text-sm font-semibold mb-3">Campaigns</h2>
            {contact.campaignContacts.length === 0 ? (
              <p className="text-sm text-zinc-400">Not part of any campaigns.</p>
            ) : (
              <div className="space-y-2">
                {contact.campaignContacts.map((cc) => (
                  <Link
                    key={cc.id}
                    href={`/campaigns/${cc.campaign.id}`}
                    className="block rounded-lg border border-zinc-100 p-3 hover:bg-zinc-50 transition-colors"
                  >
                    <div className="text-sm font-medium">{cc.campaign.name}</div>
                    <span className="text-xs text-zinc-500">{cc.status}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
