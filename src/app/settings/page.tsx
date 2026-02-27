"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
  _count: { contacts: number };
}

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [tags, setTags] = useState<Tag[]>([]);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [tagError, setTagError] = useState("");
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (!session) return;
    fetchTags();
  }, [session]);

  async function fetchTags() {
    const res = await fetch("/api/tags");
    const data = await res.json();
    if (Array.isArray(data)) setTags(data);
  }

  function startEditTag(tag: Tag) {
    setEditingTagId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
    setTagError("");
  }

  async function saveTagEdit(tagId: string) {
    setTagError("");
    const res = await fetch(`/api/tags/${tagId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), color: editColor }),
    });
    if (res.ok) {
      const updated = await res.json();
      setTags((prev) => prev.map((t) => (t.id === tagId ? updated : t)));
      setEditingTagId(null);
    } else {
      const data = await res.json();
      setTagError(data.error || "Failed to update tag");
    }
  }

  async function handleDeleteTag(tag: Tag) {
    if (
      !confirm(
        `Delete tag "${tag.name}"? It will be removed from all ${tag._count.contacts} contact${tag._count.contacts !== 1 ? "s" : ""}.`
      )
    )
      return;

    setDeletingTagId(tag.id);
    const res = await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
    if (res.ok) {
      setTags((prev) => prev.filter((t) => t.id !== tag.id));
    }
    setDeletingTagId(null);
  }

  if (status === "loading" || !session) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="h-5 w-5 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin" />
      </div>
    );
  }

  const connections = [
    {
      name: "Google Account",
      description: "Gmail access for sending and reading emails",
      status: session ? "Connected" : "Not connected",
      connected: !!session,
      detail: session?.user?.email,
    },
    {
      name: "Proxycurl API",
      description: "LinkedIn profile enrichment",
      status: process.env.NEXT_PUBLIC_HAS_PROXYCURL ? "Configured" : "Check server env",
      connected: true,
      detail: "Set PROXYCURL_API_KEY in .env",
    },
    {
      name: "Claude API",
      description: "AI-powered email draft generation",
      status: process.env.NEXT_PUBLIC_HAS_ANTHROPIC ? "Configured" : "Check server env",
      connected: true,
      detail: "Set ANTHROPIC_API_KEY in .env",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">Manage your account and API connections</p>
      </div>

      {/* Account */}
      <div className="rounded-xl border border-brand-100 bg-white p-6 mb-6">
        <h2 className="text-sm font-semibold mb-4">Account</h2>
        <div className="flex items-center gap-4">
          {session.user?.image && (
            <img src={session.user.image} alt="" className="h-12 w-12 rounded-full" />
          )}
          <div>
            <div className="font-medium">{session.user?.name}</div>
            <div className="text-sm text-zinc-500">{session.user?.email}</div>
          </div>
        </div>
      </div>

      {/* Connections */}
      <div className="rounded-xl border border-brand-100 bg-white p-6">
        <h2 className="text-sm font-semibold mb-4">API Connections</h2>
        <div className="divide-y divide-brand-50">
          {connections.map((conn) => (
            <div key={conn.name} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
              <div>
                <div className="text-sm font-medium">{conn.name}</div>
                <div className="text-xs text-zinc-500 mt-0.5">{conn.description}</div>
                {conn.detail && (
                  <div className="text-xs text-zinc-400 mt-0.5">{conn.detail}</div>
                )}
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                conn.connected
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700"
              }`}>
                {conn.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Environment Setup Guide */}
      <div className="rounded-xl border border-brand-100 bg-white p-6 mt-6">
        <h2 className="text-sm font-semibold mb-3">Setup Guide</h2>
        <div className="space-y-3 text-sm text-zinc-600">
          <div>
            <div className="font-medium text-brand-900">1. Google OAuth</div>
            <p className="text-xs mt-0.5">Create a project in Google Cloud Console, enable Gmail API, create OAuth credentials, and add AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET to your .env file.</p>
          </div>
          <div>
            <div className="font-medium text-brand-900">2. Proxycurl</div>
            <p className="text-xs mt-0.5">Sign up at proxycurl.com, get your API key, and add PROXYCURL_API_KEY to your .env file.</p>
          </div>
          <div>
            <div className="font-medium text-brand-900">3. Anthropic</div>
            <p className="text-xs mt-0.5">Get your API key from console.anthropic.com and add ANTHROPIC_API_KEY to your .env file.</p>
          </div>
          <div>
            <div className="font-medium text-brand-900">4. Database</div>
            <p className="text-xs mt-0.5">Set DATABASE_URL in .env and run: npx prisma db push</p>
          </div>
        </div>
      </div>

      {/* Tags Management */}
      <div className="rounded-xl border border-brand-100 bg-white p-6 mt-6">
        <h2 className="text-sm font-semibold mb-4">Tags</h2>
        {tags.length === 0 ? (
          <p className="text-sm text-zinc-400">No tags yet. Create tags from any contact page.</p>
        ) : (
          <div className="divide-y divide-brand-50">
            {tags.map((tag) => (
              <div key={tag.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                {editingTagId === tag.id ? (
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveTagEdit(tag.id)}
                        className="flex-1 rounded-lg border border-brand-100 px-2.5 py-1.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                      />
                      <button
                        onClick={() => saveTagEdit(tag.id)}
                        disabled={!editName.trim()}
                        className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingTagId(null)}
                        className="rounded-lg border border-brand-100 px-3 py-1.5 text-xs hover:bg-brand-50"
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {TAG_COLORS.map((c) => (
                        <button
                          key={c.value}
                          onClick={() => setEditColor(c.value)}
                          className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                          style={{
                            backgroundColor: c.value,
                            borderColor: editColor === c.value ? "#1e293b" : "transparent",
                          }}
                          title={c.label}
                        />
                      ))}
                    </div>
                    {tagError && <p className="text-xs text-red-600">{tagError}</p>}
                  </div>
                ) : (
                  <>
                    <span
                      className="h-4 w-4 rounded-full shrink-0"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="flex-1 text-sm">{tag.name}</span>
                    <span className="text-xs text-zinc-400 shrink-0">
                      {tag._count.contacts} contact{tag._count.contacts !== 1 ? "s" : ""}
                    </span>
                    <button
                      onClick={() => startEditTag(tag)}
                      className="shrink-0 rounded-lg border border-brand-100 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-brand-50 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteTag(tag)}
                      disabled={deletingTagId === tag.id}
                      className="shrink-0 rounded-lg border border-red-100 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingTagId === tag.id ? "Deleting..." : "Delete"}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
