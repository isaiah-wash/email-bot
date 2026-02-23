"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";

const TAG_COLORS = [
  { label: "Indigo", value: "#6366f1" },
  { label: "Violet", value: "#8b5cf6" },
  { label: "Sky", value: "#0ea5e9" },
  { label: "Teal", value: "#14b8a6" },
  { label: "Emerald", value: "#10b981" },
  { label: "Amber", value: "#f59e0b" },
  { label: "Rose", value: "#f43f5e" },
  { label: "Zinc", value: "#71717a" },
];

interface Tag {
  id: string;
  name: string;
  color: string;
}

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
  tags: { tag: Tag }[];
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

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    linkedinUrl: "",
    company: "",
    title: "",
  });
  const [saving, setSaving] = useState(false);

  // Tag state
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [showTagPopover, setShowTagPopover] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0].value);
  const [showCreateTag, setShowCreateTag] = useState(false);
  const [tagError, setTagError] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (!session) return;
    fetchContact();
    fetchTemplates();
    fetchAllTags();
  }, [session, contactId]);

  // Close popover on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowTagPopover(false);
      }
    }
    if (showTagPopover) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showTagPopover]);

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

  async function fetchAllTags() {
    const res = await fetch("/api/tags");
    const data = await res.json();
    if (Array.isArray(data)) setAllTags(data);
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

  function startEditing() {
    if (!contact) return;
    setEditForm({
      firstName: contact.firstName || "",
      lastName: contact.lastName || "",
      email: contact.email || "",
      linkedinUrl: contact.linkedinUrl || "",
      company: contact.company || "",
      title: contact.title || "",
    });
    setEditing(true);
  }

  async function handleSaveEdit() {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    if (res.ok) {
      const updated = await res.json();
      setContact((prev) => prev ? { ...prev, ...updated } : prev);
      setEditing(false);
    } else {
      const data = await res.json();
      setError(data.error || "Failed to save changes");
    }
    setSaving(false);
  }

  async function handleAddTag(tagId: string) {
    if (!contact) return;
    // Optimistic update
    const tag = allTags.find((t) => t.id === tagId);
    if (!tag) return;
    setContact((prev) => prev ? { ...prev, tags: [...prev.tags, { tag }] } : prev);
    setShowTagPopover(false);

    const res = await fetch(`/api/contacts/${contactId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    if (!res.ok) {
      // Revert
      fetchContact();
    }
  }

  async function handleRemoveTag(tagId: string) {
    if (!contact) return;
    // Optimistic update
    setContact((prev) =>
      prev ? { ...prev, tags: prev.tags.filter((ct) => ct.tag.id !== tagId) } : prev
    );

    const res = await fetch(`/api/contacts/${contactId}/tags`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    if (!res.ok) {
      fetchContact();
    }
  }

  async function handleCreateTag() {
    if (!newTagName.trim()) return;
    setTagError("");

    const res = await fetch(`/api/contacts/${contactId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
    });

    if (res.ok) {
      const newTag = await res.json();
      setAllTags((prev) => [...prev, newTag].sort((a, b) => a.name.localeCompare(b.name)));
      setContact((prev) =>
        prev ? { ...prev, tags: [...prev.tags, { tag: newTag }] } : prev
      );
      setNewTagName("");
      setNewTagColor(TAG_COLORS[0].value);
      setShowCreateTag(false);
      setShowTagPopover(false);
    } else {
      const data = await res.json();
      setTagError(data.error || "Failed to create tag");
    }
  }

  if (status === "loading" || loading || !session) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="h-5 w-5 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin" />
      </div>
    );
  }

  if (!contact) return null;

  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unnamed Contact";
  const linkedinProfile = contact.linkedinData as Record<string, unknown> | null;
  const appliedTagIds = new Set(contact.tags.map((ct) => ct.tag.id));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/contacts" className="text-sm text-brand-500 hover:text-brand-700 mb-4 inline-block">
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
          <div className="rounded-xl border border-brand-100 bg-white p-6">
            <div className="flex items-start justify-between">
              <div>
                {!editing && (
                  <>
                    <h1 className="text-xl font-semibold">{name}</h1>
                    {(contact.title || contact.company) && (
                      <p className="text-sm text-zinc-500 mt-0.5">
                        {[contact.title, contact.company].filter(Boolean).join(" at ")}
                      </p>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!editing && contact.linkedinUrl && (
                  <button
                    onClick={handleEnrich}
                    disabled={enriching}
                    className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                  >
                    {enriching ? "Enriching..." : contact.enrichedAt ? "Re-enrich from LinkedIn" : "Enrich from LinkedIn"}
                  </button>
                )}
                {!editing && (
                  <button
                    onClick={() => setShowGenerate(!showGenerate)}
                    className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
                  >
                    Generate Email
                  </button>
                )}
                {editing ? (
                  <>
                    <button
                      onClick={handleSaveEdit}
                      disabled={saving}
                      className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={() => setEditing(false)}
                      className="rounded-lg border border-brand-100 px-3 py-1.5 text-xs font-medium hover:bg-brand-50"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={startEditing}
                    className="rounded-lg border border-brand-100 px-3 py-1.5 text-xs font-medium hover:bg-brand-50"
                  >
                    Edit
                  </button>
                )}
                {!editing && (
                  <button
                    onClick={handleDelete}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>

            {!editing && showGenerate && (
              <div className="mt-4 flex items-center gap-3 rounded-lg border border-brand-100 bg-brand-50/50 p-4">
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="flex-1 rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Select a template...</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleGenerate}
                  disabled={!selectedTemplate || generating}
                  className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  {generating ? "Generating..." : "Generate"}
                </button>
              </div>
            )}

            {editing ? (
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">First Name</label>
                  <input
                    type="text"
                    value={editForm.firstName}
                    onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                    className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={editForm.lastName}
                    onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                    className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">LinkedIn URL</label>
                  <input
                    type="url"
                    value={editForm.linkedinUrl}
                    onChange={(e) => setEditForm({ ...editForm, linkedinUrl: e.target.value })}
                    className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Company</label>
                  <input
                    type="text"
                    value={editForm.company}
                    onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
                    className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Title</label>
                  <input
                    type="text"
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                </div>
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-zinc-500">Email</span>
                  <p className="mt-0.5 font-medium">{contact.email || "—"}</p>
                </div>
                <div>
                  <span className="text-zinc-500">LinkedIn</span>
                  <p className="mt-0.5 font-medium">
                    {contact.linkedinUrl ? (
                      <a href={contact.linkedinUrl} target="_blank" rel="noopener" className="text-brand-500 hover:underline">
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
            )}

            {!editing && contact.enrichedAt && (
              <p className="mt-4 text-xs text-zinc-400">
                Enriched on {new Date(contact.enrichedAt).toLocaleDateString()}
              </p>
            )}
          </div>

          {/* LinkedIn Data */}
          {linkedinProfile && (
            <div className="rounded-xl border border-brand-100 bg-white p-6">
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
          <div className="rounded-xl border border-brand-100 bg-white p-6">
            <h2 className="text-sm font-semibold mb-3">Email History</h2>
            {threads.length === 0 ? (
              <p className="text-sm text-zinc-400">
                {contact.email ? "No email threads found." : "Add an email address to see thread history."}
              </p>
            ) : (
              <div className="space-y-3">
                {threads.map((thread) => (
                  <div key={thread.id} className="rounded-lg border border-brand-50 p-3">
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
          {/* Tags */}
          <div className="rounded-xl border border-brand-100 bg-white p-5">
            <h2 className="text-sm font-semibold mb-3">Tags</h2>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {contact.tags.map(({ tag }) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                  <button
                    onClick={() => handleRemoveTag(tag.id)}
                    className="ml-0.5 opacity-75 hover:opacity-100 leading-none"
                    aria-label={`Remove ${tag.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {contact.tags.length === 0 && (
                <p className="text-xs text-zinc-400">No tags yet.</p>
              )}
            </div>

            {/* Add Tag popover */}
            <div className="relative" ref={popoverRef}>
              <button
                onClick={() => {
                  setShowTagPopover(!showTagPopover);
                  setShowCreateTag(false);
                  setTagError("");
                }}
                className="text-xs text-brand-500 hover:text-brand-700 font-medium"
              >
                + Add Tag
              </button>

              {showTagPopover && (
                <div className="absolute left-0 top-6 z-20 w-56 rounded-xl border border-brand-100 bg-white shadow-lg">
                  {!showCreateTag ? (
                    <>
                      <div className="max-h-48 overflow-y-auto">
                        {allTags.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-zinc-400">No tags yet.</p>
                        ) : (
                          allTags.map((tag) => (
                            <button
                              key={tag.id}
                              onClick={() =>
                                appliedTagIds.has(tag.id)
                                  ? handleRemoveTag(tag.id)
                                  : handleAddTag(tag.id)
                              }
                              className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-brand-50/50 text-left"
                            >
                              <span
                                className="h-3 w-3 rounded-full shrink-0"
                                style={{ backgroundColor: tag.color }}
                              />
                              <span className="flex-1">{tag.name}</span>
                              {appliedTagIds.has(tag.id) && (
                                <span className="text-brand-500">✓</span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                      <div className="border-t border-brand-50 p-2">
                        <button
                          onClick={() => setShowCreateTag(true)}
                          className="w-full rounded-lg px-3 py-1.5 text-xs text-brand-600 hover:bg-brand-50 text-left font-medium"
                        >
                          + Create new tag
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="p-3 space-y-2">
                      <input
                        autoFocus
                        type="text"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
                        placeholder="Tag name"
                        className="w-full rounded-lg border border-brand-100 px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                      />
                      <div className="flex gap-1.5 flex-wrap">
                        {TAG_COLORS.map((c) => (
                          <button
                            key={c.value}
                            onClick={() => setNewTagColor(c.value)}
                            className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                            style={{
                              backgroundColor: c.value,
                              borderColor: newTagColor === c.value ? "#1e293b" : "transparent",
                            }}
                            title={c.label}
                          />
                        ))}
                      </div>
                      {tagError && <p className="text-xs text-red-600">{tagError}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={handleCreateTag}
                          disabled={!newTagName.trim()}
                          className="flex-1 rounded-lg bg-brand-500 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                        >
                          Create
                        </button>
                        <button
                          onClick={() => { setShowCreateTag(false); setTagError(""); }}
                          className="flex-1 rounded-lg border border-brand-100 py-1.5 text-xs hover:bg-brand-50"
                        >
                          Back
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Drafts */}
          <div className="rounded-xl border border-brand-100 bg-white p-5">
            <h2 className="text-sm font-semibold mb-3">Email Drafts</h2>
            {contact.emailDrafts.length === 0 ? (
              <p className="text-sm text-zinc-400">No drafts yet.</p>
            ) : (
              <div className="space-y-2">
                {contact.emailDrafts.map((draft) => (
                  <Link
                    key={draft.id}
                    href={`/compose/${draft.id}`}
                    className="block rounded-lg border border-brand-50 p-3 hover:bg-brand-50/50 transition-colors"
                  >
                    <div className="text-sm font-medium truncate">{draft.subject}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs rounded-full px-2 py-0.5 ${
                        draft.status === "SENT" ? "bg-emerald-50 text-emerald-700" :
                        draft.status === "APPROVED" ? "bg-brand-50 text-brand-600" :
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
          <div className="rounded-xl border border-brand-100 bg-white p-5">
            <h2 className="text-sm font-semibold mb-3">Campaigns</h2>
            {contact.campaignContacts.length === 0 ? (
              <p className="text-sm text-zinc-400">Not part of any campaigns.</p>
            ) : (
              <div className="space-y-2">
                {contact.campaignContacts.map((cc) => (
                  <Link
                    key={cc.id}
                    href={`/campaigns/${cc.campaign.id}`}
                    className="block rounded-lg border border-brand-50 p-3 hover:bg-brand-50/50 transition-colors"
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
