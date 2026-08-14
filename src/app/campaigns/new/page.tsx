"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface Contact {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  tags: { tag: Tag }[];
}

interface Template {
  id: string;
  name: string;
}

const PAGE_SIZE = 50;

export default function NewCampaignPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    description: "",
    context: "",
    templateId: "",
    useAi: true,
  });
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingMoreContacts, setLoadingMoreContacts] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  // Which contact ids came from which active tag, so untoggling a tag can
  // remove exactly those contacts without needing every contact loaded locally
  const [tagContactIds, setTagContactIds] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [contactSearch, setContactSearch] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (!session) return;
    fetch("/api/templates").then((r) => r.json()).then(setTemplates);
    fetch("/api/tags").then((r) => r.json()).then(setAllTags);
  }, [session]);

  async function fetchContacts(q: string, append = false) {
    if (append) setLoadingMoreContacts(true);
    else setLoadingContacts(true);

    const params = new URLSearchParams();
    if (q) params.set("search", q);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", append ? String(contacts.length) : "0");

    const res = await fetch(`/api/contacts?${params}`);
    const data = await res.json();
    setContacts((prev) => (append ? [...prev, ...data.contacts] : data.contacts));
    setContactsTotal(data.total);

    if (append) setLoadingMoreContacts(false);
    else setLoadingContacts(false);
  }

  // Debounced live search against the server — resets to page 1 on every change
  useEffect(() => {
    if (!session) return;
    const t = setTimeout(() => {
      fetchContacts(contactSearch.trim());
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactSearch, session]);

  function toggleContact(id: string) {
    setSelectedContacts((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  async function handleSelectAll() {
    const params = new URLSearchParams({ idsOnly: "true" });
    if (contactSearch.trim()) params.set("search", contactSearch.trim());
    const res = await fetch(`/api/contacts?${params}`);
    const { ids } = await res.json();
    setSelectedContacts((prev) => Array.from(new Set([...prev, ...ids])));
  }

  function handleClearSelection() {
    setSelectedContacts([]);
    setSelectedTags([]);
    setTagContactIds({});
  }

  async function handleTagToggle(tagId: string) {
    const isActive = selectedTags.includes(tagId);

    if (!isActive) {
      // Tag toggled ON: fetch every contact id for this tag and merge into selectedContacts
      setSelectedTags((prev) => [...prev, tagId]);
      const res = await fetch(`/api/contacts?tagId=${tagId}&idsOnly=true`);
      if (res.ok) {
        const { ids } = await res.json();
        setTagContactIds((prev) => ({ ...prev, [tagId]: ids }));
        setSelectedContacts((prev) => Array.from(new Set([...prev, ...ids])));
      }
    } else {
      // Tag toggled OFF: remove contacts that are ONLY covered by this tag
      const remainingTags = selectedTags.filter((id) => id !== tagId);
      setSelectedTags(remainingTags);

      const removedIds = tagContactIds[tagId] ?? [];
      setTagContactIds((prev) => {
        const next = { ...prev };
        delete next[tagId];
        return next;
      });

      setSelectedContacts((prev) =>
        prev.filter((contactId) => {
          if (!removedIds.includes(contactId)) return true; // didn't come from this tag, keep
          // Came from this tag — keep only if another still-active tag also covers it
          return remainingTags.some((t) => (tagContactIds[t] ?? []).includes(contactId));
        })
      );
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        contactIds: selectedContacts,
      }),
    });
    if (res.ok) {
      const campaign = await res.json();
      router.push(`/campaigns/${campaign.id}`);
    }
    setSaving(false);
  }

  if (status === "loading" || !session) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="h-5 w-5 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight mb-6">New Campaign</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-xl border border-brand-100 bg-white p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Campaign Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              placeholder="Q1 Outreach"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              placeholder="Cold outreach to potential enterprise clients"
            />
          </div>
          <label className="flex items-center justify-between rounded-lg border border-brand-100 px-3 py-3 cursor-pointer">
            <div>
              <div className="text-sm font-medium text-zinc-700">Do not use AI</div>
              <div className="text-xs text-zinc-500">Send template as-is without AI personalization</div>
            </div>
            <input
              type="checkbox"
              checked={!form.useAi}
              onChange={() => setForm({ ...form, useAi: !form.useAi })}
              className="h-4 w-4 rounded border-brand-200 text-brand-500 focus:ring-brand-400"
            />
          </label>
          {form.useAi && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">AI Context / Instructions</label>
              <textarea
                value={form.context}
                onChange={(e) => setForm({ ...form, context: e.target.value })}
                rows={4}
                className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                placeholder="We are offering a 20% discount on our Enterprise plan for Q1. Focus on how our product reduces manual work..."
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Template</label>
            <select
              value={form.templateId}
              onChange={(e) => setForm({ ...form, templateId: e.target.value })}
              className="w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm"
            >
              <option value="">No template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Select by Tag */}
        {allTags.length > 0 && (
          <div className="rounded-xl border border-brand-100 bg-white p-6">
            <h2 className="text-sm font-semibold mb-1">Select by Tag</h2>
            <p className="text-xs text-zinc-500 mb-3">Click a tag to add all contacts with that tag.</p>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => {
                const active = selectedTags.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => handleTagToggle(tag.id)}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border transition-opacity"
                    style={{
                      backgroundColor: active ? tag.color : "transparent",
                      borderColor: tag.color,
                      color: active ? "white" : tag.color,
                    }}
                  >
                    {active && <span className="text-white">✓</span>}
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-brand-100 bg-white p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Select Contacts ({selectedContacts.length} selected)</h2>
            <div className="flex items-center gap-3">
              {contactsTotal > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-xs font-medium text-brand-500 hover:text-brand-600"
                >
                  Select All{contactSearch.trim() ? " Matching" : ""}
                </button>
              )}
              {selectedContacts.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="text-xs font-medium text-zinc-400 hover:text-zinc-600"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <input
            type="text"
            value={contactSearch}
            onChange={(e) => setContactSearch(e.target.value)}
            placeholder="Search by email or name..."
            className="mb-3 w-full rounded-lg border border-brand-100 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
          {loadingContacts ? (
            <p className="text-sm text-zinc-400">Loading contacts...</p>
          ) : contacts.length === 0 ? (
            <p className="text-sm text-zinc-400">
              {contactSearch.trim() ? "No contacts match your search." : "No contacts available. Add contacts first."}
            </p>
          ) : (
            <>
              <div className="max-h-64 overflow-y-auto divide-y divide-brand-50">
                {contacts.map((contact) => (
                  <label
                    key={contact.id}
                    className="flex items-center gap-3 px-2 py-2.5 hover:bg-brand-50/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedContacts.includes(contact.id)}
                      onChange={() => toggleContact(contact.id)}
                      className="rounded border-brand-200 text-brand-500 focus:ring-brand-400"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium">
                          {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unnamed"}
                        </span>
                        {contact.tags.map(({ tag }) => (
                          <span
                            key={tag.id}
                            className="rounded-full px-1.5 py-0.5 text-xs font-medium text-white"
                            style={{ backgroundColor: tag.color }}
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {contact.email || "No email"} {contact.company && `· ${contact.company}`}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              {contacts.length < contactsTotal && (
                <button
                  type="button"
                  onClick={() => fetchContacts(contactSearch.trim(), true)}
                  disabled={loadingMoreContacts}
                  className="mt-3 w-full rounded-lg border border-brand-100 py-1.5 text-xs font-medium text-zinc-600 hover:bg-brand-50/50 disabled:opacity-50"
                >
                  {loadingMoreContacts ? "Loading..." : `Load More (${contacts.length} of ${contactsTotal})`}
                </button>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-brand-100 px-4 py-2 text-sm font-medium hover:bg-brand-50/50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !form.name}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Campaign"}
          </button>
        </div>
      </form>
    </div>
  );
}
