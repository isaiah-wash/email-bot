"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Contact {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
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
  });
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (!session) return;
    fetch("/api/contacts").then((r) => r.json()).then(setContacts);
    fetch("/api/templates").then((r) => r.json()).then(setTemplates);
  }, [session]);

  function toggleContact(id: string) {
    setSelectedContacts((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
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

        <div className="rounded-xl border border-brand-100 bg-white p-6">
          <h2 className="text-sm font-semibold mb-3">Select Contacts ({selectedContacts.length} selected)</h2>
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
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unnamed"}
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
