"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
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
  enrichedAt: string | null;
  createdAt: string;
  _count: { emailDrafts: number };
}

export default function ContactsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    email: "",
    linkedinUrl: "",
    firstName: "",
    lastName: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (!session) return;
    fetchContacts();
  }, [session]);

  async function fetchContacts(q = "") {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("search", q);
    const res = await fetch(`/api/contacts?${params}`);
    const data = await res.json();
    setContacts(data);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email && !form.linkedinUrl) {
      setError("Provide at least an email or LinkedIn URL");
      return;
    }
    setSaving(true);
    setError("");

    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (res.ok) {
      setForm({ email: "", linkedinUrl: "", firstName: "", lastName: "" });
      setShowForm(false);
      fetchContacts();
    } else {
      const data = await res.json();
      setError(data.error || "Failed to create contact");
    }
    setSaving(false);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchContacts(search);
  }

  if (status === "loading" || !session) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="h-5 w-5 rounded-full border-2 border-zinc-300 border-t-zinc-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="mt-1 text-sm text-zinc-500">{contacts.length} contacts in your directory</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
        >
          {showForm ? "Cancel" : "Add Contact"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 rounded-xl border border-zinc-200 bg-white p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">First Name</label>
              <input
                type="text"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                placeholder="Jane"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Last Name</label>
              <input
                type="text"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                placeholder="Smith"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                placeholder="jane@company.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">LinkedIn URL</label>
              <input
                type="url"
                value={form.linkedinUrl}
                onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                placeholder="https://linkedin.com/in/janesmith"
              />
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Contact"}
            </button>
          </div>
        </form>
      )}

      <form onSubmit={handleSearch} className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts by name, email, or company..."
          className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
        />
      </form>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-5 w-5 rounded-full border-2 border-zinc-300 border-t-zinc-600 animate-spin" />
        </div>
      ) : contacts.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white py-16 text-center">
          <p className="text-zinc-500">No contacts yet. Add your first contact to get started.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100">
          {contacts.map((contact) => (
            <Link
              key={contact.id}
              href={`/contacts/${contact.id}`}
              className="flex items-center justify-between px-5 py-4 hover:bg-zinc-50 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unnamed"}
                  </span>
                  {contact.enrichedAt && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                      Enriched
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-zinc-500">
                  {contact.email && <span>{contact.email}</span>}
                  {contact.company && <span>{contact.company}</span>}
                  {contact.title && <span>{contact.title}</span>}
                </div>
              </div>
              <div className="ml-4 flex items-center gap-3 shrink-0">
                {contact.linkedinUrl && (
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">LI</span>
                )}
                <span className="text-xs text-zinc-400">{contact._count.emailDrafts} drafts</span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="text-zinc-300"
                >
                  <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
