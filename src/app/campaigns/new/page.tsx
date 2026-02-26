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
  const [templates, setTemplates] = useState<Template[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (!session) return;
    fetch("/api/contacts").then((r) => r.json()).then(setContacts);
    fetch("/api/templates").then((r) => r.json()).then(setTemplates);
    fetch("/api/tags").then((r) => r.json()).then(setAllTags);
  }, [session]);

  function toggleContact(id: string) {
    setSelectedContacts((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  function handleSelectAll() {
    if (selectedContacts.length === contacts.length && contacts.length > 0) {
      setSelectedContacts([]);
    } else {
      setSelectedContacts(contacts.map((c) => c.id));
    }
  }

  async function handleTagToggle(tagId: string) {
    const isActive = selectedTags.includes(tagId);

    if (!isActive) {
      // Tag toggled ON: fetch contacts for this tag and merge into selectedContacts
      setSelectedTags((prev) => [...prev, tagId]);
      const res = await fetch(`/api/contacts?tagId=${tagId}`);
      if (res.ok) {
        const tagContacts: Contact[] = await res.json();
        const newIds = tagContacts.map((c) => c.id);
        setSelectedContacts((prev) => {
          const merged = new Set([...prev, ...newIds]);
          return Array.from(merged);
        });
      }
    } else {
      // Tag toggled OFF: remove contacts that are ONLY covered by this tag
      const remainingTags = selectedTags.filter((id) => id !== tagId);
      setSelectedTags(remainingTags);

      if (remainingTags.length === 0) {
        // No other tags active — remove all tag-sourced contacts (keep manually checked ones)
        // We don't know which were manually checked vs tag-sourced, so keep all currently selected
        // but remove contacts that have this tag and no other selected tags
        setSelectedContacts((prev) =>
          prev.filter((contactId) => {
            const contact = contacts.find((c) => c.id === contactId);
            if (!contact) return true;
            const contactTagIds = contact.tags.map((ct) => ct.tag.id);
            // Keep if it doesn't have the removed tag
            return !contactTagIds.includes(tagId);
          })
        );
      } else {
        // Other tags still active — only remove contacts that had this tag but none of the remaining active tags
        setSelectedContacts((prev) =>
          prev.filter((contactId) => {
            const contact = contacts.find((c) => c.id === contactId);
            if (!contact) return true;
            const contactTagIds = contact.tags.map((ct) => ct.tag.id);
            // If contact has the removed tag but not any remaining active tag, remove it
            const hadRemovedTag = contactTagIds.includes(tagId);
            if (!hadRemovedTag) return true; // didn't come from this tag, keep
            const coveredByOtherTag = remainingTags.some((t) => contactTagIds.includes(t));
            return coveredByOtherTag;
          })
        );
      }
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
          <div className="flex items-center justify-between rounded-lg border border-brand-100 px-3 py-3">
            <div>
              <div className="text-sm font-medium text-zinc-700">Do not use AI</div>
              <div className="text-xs text-zinc-500">Send template as-is without AI personalization</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!form.useAi}
              onClick={() => setForm({ ...form, useAi: !form.useAi })}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                !form.useAi ? "bg-brand-500" : "bg-zinc-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform ${
                  !form.useAi ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
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
            {contacts.length > 0 && (
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-xs font-medium text-brand-500 hover:text-brand-600"
              >
                {selectedContacts.length === contacts.length && contacts.length > 0
                  ? "Deselect All"
                  : "Select All"}
              </button>
            )}
          </div>
          {contacts.length === 0 ? (
            <p className="text-sm text-zinc-400">No contacts available. Add contacts first.</p>
          ) : (
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
