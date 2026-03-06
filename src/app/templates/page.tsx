"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface Attachment {
  name: string;
  mimeType: string;
  data: string; // base64
}

interface Template {
  id: string;
  name: string;
  subjectTemplate: string;
  bodyInstructions: string;
  attachments: Attachment[] | null;
  _count: { campaigns: number };
  createdAt: string;
}

interface Campaign {
  id: string;
  name: string;
  template: { id: string } | null;
}

export default function TemplatesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    subjectTemplate: "",
    bodyInstructions: "",
  });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (!session) return;
    fetchTemplates();
    fetch("/api/campaigns").then((r) => r.json()).then(setCampaigns);
  }, [session]);

  async function fetchTemplates() {
    const res = await fetch("/api/templates");
    setTemplates(await res.json());
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const url = editingId ? `/api/templates/${editingId}` : "/api/templates";
    const method = editingId ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, attachments, campaignIds: selectedCampaignIds }),
    });

    if (res.ok) {
      setForm({ name: "", subjectTemplate: "", bodyInstructions: "" });
      setAttachments([]);
      setSelectedCampaignIds([]);
      setShowForm(false);
      setEditingId(null);
      fetchTemplates();
      fetch("/api/campaigns").then((r) => r.json()).then(setCampaigns);
    }
    setSaving(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // dataUrl is "data:<mimeType>;base64,<data>" — extract just the base64 part
        const base64 = dataUrl.split(",")[1];
        setAttachments((prev) => [
          ...prev,
          { name: file.name, mimeType: file.type || "application/octet-stream", data: base64 },
        ]);
      };
      reader.readAsDataURL(file);
    });
    // Reset input so the same file can be re-added if removed
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  async function startEdit(template: Template) {
    setForm({
      name: template.name,
      subjectTemplate: template.subjectTemplate,
      bodyInstructions: template.bodyInstructions,
    });
    setAttachments(template.attachments ?? []);
    setEditingId(template.id);
    setShowForm(true);
    // Fetch current campaign assignments for this template
    const res = await fetch(`/api/templates/${template.id}`);
    if (res.ok) {
      const data = await res.json();
      setSelectedCampaignIds(data.campaigns?.map((c: { id: string }) => c.id) || []);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this template?")) return;
    await fetch(`/api/templates/${id}`, { method: "DELETE" });
    fetchTemplates();
  }

  if (status === "loading" || !session) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="h-5 w-5 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="mt-1 text-sm text-zinc-500">Email templates with AI generation instructions</p>
        </div>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setEditingId(null);
            setForm({ name: "", subjectTemplate: "", bodyInstructions: "" });
            setAttachments([]);
            setSelectedCampaignIds([]);
          }}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
        >
          {showForm ? "Cancel" : "New Template"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-xl border border-brand-100 bg-white p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Template Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              placeholder="Cold Outreach — Enterprise"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Subject Template</label>
            <input
              type="text"
              required
              value={form.subjectTemplate}
              onChange={(e) => setForm({ ...form, subjectTemplate: e.target.value })}
              className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              placeholder="Quick question about {{company}}'s approach to..."
            />
            <p className="mt-1 text-xs text-zinc-400">Use {"{{variable}}"} for dynamic content</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">AI Instructions</label>
            <textarea
              required
              value={form.bodyInstructions}
              onChange={(e) => setForm({ ...form, bodyInstructions: e.target.value })}
              rows={6}
              className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              placeholder="Write a friendly cold outreach email. Reference the contact's current role and company. Mention how our product helps with [specific value prop]. Keep it under 150 words. End with a soft CTA asking for a 15-minute call."
            />
            <p className="mt-1 text-xs text-zinc-400">Instructions for Claude to generate the email body</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-2">
              Attachments ({attachments.length})
            </label>
            {attachments.length > 0 && (
              <ul className="mb-2 space-y-1">
                {attachments.map((a, i) => (
                  <li key={i} className="flex items-center justify-between rounded-lg border border-brand-100 bg-brand-50/50 px-3 py-2 text-sm">
                    <span className="truncate text-zinc-700">{a.name}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(i)}
                      className="ml-2 text-red-400 hover:text-red-600 shrink-0"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileChange}
              className="hidden"
              id="attachment-input"
            />
            <label
              htmlFor="attachment-input"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-brand-200 px-3 py-1.5 text-sm text-brand-600 hover:bg-brand-50 transition-colors"
            >
              + Add attachment
            </label>
            <p className="mt-1 text-xs text-zinc-400">Files are stored with the template and attached to every email sent from it</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-2">
              Assign to Campaigns ({selectedCampaignIds.length} selected)
            </label>
            {campaigns.length === 0 ? (
              <p className="text-sm text-zinc-400">No campaigns available.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-brand-100 divide-y divide-brand-50">
                {campaigns.map((campaign) => (
                  <label
                    key={campaign.id}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-brand-50/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCampaignIds.includes(campaign.id)}
                      onChange={() =>
                        setSelectedCampaignIds((prev) =>
                          prev.includes(campaign.id)
                            ? prev.filter((id) => id !== campaign.id)
                            : [...prev, campaign.id]
                        )
                      }
                      className="rounded border-brand-200 text-brand-500 focus:ring-brand-400"
                    />
                    <span className="text-sm">{campaign.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {saving ? "Saving..." : editingId ? "Update Template" : "Create Template"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-5 w-5 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin" />
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-brand-100 bg-white py-16 text-center">
          <p className="text-zinc-500">No templates yet. Create your first template to start generating emails.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {templates.map((template) => (
            <div key={template.id} className="rounded-xl border border-brand-100 bg-white p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold">{template.name}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">Subject: {template.subjectTemplate}</p>
                </div>
                <div className="flex items-center gap-2">
                  {template.attachments && template.attachments.length > 0 && (
                    <span className="text-xs text-zinc-400">
                      {template.attachments.length} attachment{template.attachments.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  <span className="text-xs text-zinc-400">{template._count.campaigns} campaigns</span>
                  <button
                    onClick={() => startEdit(template)}
                    className="text-xs text-brand-500 hover:text-brand-700"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="mt-3 rounded-lg bg-brand-50/50 p-3">
                <p className="text-xs text-zinc-600 whitespace-pre-wrap line-clamp-4">
                  {template.bodyInstructions}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
