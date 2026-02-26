"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
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
  enrichedAt: string | null;
  createdAt: string;
  _count: { emailDrafts: number };
  tags: { tag: Tag }[];
}

interface ExistingContact {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
}

interface CsvContactRaw {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  linkedinUrl: string | null;
}

interface DuplicateEntry {
  csvContact: CsvContactRaw;
  existingContact: ExistingContact;
}

interface DuplicatePending {
  duplicates: DuplicateEntry[];
  allContacts: { email: string; firstName: string; lastName: string; linkedinUrl: string }[];
  errors: string[];
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Parse header — handle quoted fields
  const parseRow = (row: string): string[] => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') {
        if (inQuotes && row[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const headers = parseRow(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  return lines.slice(1).map((line) => {
    const values = parseRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = values[i] ?? "";
    });
    return obj;
  });
}

function mapCsvRow(row: Record<string, string>) {
  // Support common column name variants
  const email =
    row["email"] || row["emailaddress"] || row["mail"] || "";
  const firstName =
    row["firstname"] || row["first"] || row["fname"] || row["givenname"] || "";
  const lastName =
    row["lastname"] || row["last"] || row["lname"] || row["surname"] || row["familyname"] || "";
  const linkedinUrl =
    row["linkedinurl"] || row["linkedin"] || row["linkedinprofile"] || row["profileurl"] || "";

  // Handle "name" or "fullname" columns by splitting
  if (!firstName && !lastName) {
    const fullName = row["name"] || row["fullname"] || row["contactname"] || "";
    if (fullName) {
      const parts = fullName.trim().split(/\s+/);
      return {
        email,
        firstName: parts[0] || "",
        lastName: parts.slice(1).join(" ") || "",
        linkedinUrl,
      };
    }
  }

  return { email, firstName, lastName, linkedinUrl };
}

export default function ContactsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
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

  // Inline tag popover state (directory)
  const [activeTagPopover, setActiveTagPopover] = useState<string | null>(null);
  const [showCreateTagInDir, setShowCreateTagInDir] = useState(false);
  const [dirTagName, setDirTagName] = useState("");
  const [dirTagColor, setDirTagColor] = useState(TAG_COLORS[0].value);
  const [dirTagError, setDirTagError] = useState("");
  const tagPopoverRef = useRef<HTMLDivElement>(null);

  // Tag All state
  const [showTagAll, setShowTagAll] = useState(false);
  const [tagAllId, setTagAllId] = useState("");
  const [taggingAll, setTaggingAll] = useState(false);
  const tagAllRef = useRef<HTMLDivElement>(null);

  // CSV import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [duplicatePending, setDuplicatePending] = useState<DuplicatePending | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, "update" | "create">>({});

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (!session) return;
    fetchContacts();
    fetchTags();
  }, [session]);

  async function fetchTags() {
    const res = await fetch("/api/tags");
    const data = await res.json();
    if (Array.isArray(data)) setAllTags(data);
  }

  async function fetchContacts(q = "", tagIds: string[] = activeTags) {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("search", q);
    if (tagIds.length > 0) params.set("tagId", tagIds.join(","));
    const res = await fetch(`/api/contacts?${params}`);
    const data = await res.json();
    setContacts(data);
    setLoading(false);
  }

  function toggleTag(tagId: string) {
    setActiveTags((prev) => {
      const next = prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId];
      fetchContacts(search, next);
      return next;
    });
  }

  // Close directory tag popover on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (tagPopoverRef.current && !tagPopoverRef.current.contains(e.target as Node)) {
        setActiveTagPopover(null);
        setShowCreateTagInDir(false);
      }
    }
    if (activeTagPopover) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [activeTagPopover]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (tagAllRef.current && !tagAllRef.current.contains(e.target as Node)) {
        setShowTagAll(false);
      }
    }
    if (showTagAll) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showTagAll]);

  async function handleTagAll() {
    if (!tagAllId) return;
    setTaggingAll(true);
    await Promise.all(
      contacts.map((contact) =>
        fetch(`/api/contacts/${contact.id}/tags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tagId: tagAllId }),
        })
      )
    );
    setTaggingAll(false);
    setShowTagAll(false);
    setTagAllId("");
    fetchContacts(search);
  }

  async function handleDirAddTag(contactId: string, tagId: string) {
    const tag = allTags.find((t) => t.id === tagId);
    if (!tag) return;
    setContacts((prev) =>
      prev.map((c) => c.id === contactId ? { ...c, tags: [...c.tags, { tag }] } : c)
    );
    const res = await fetch(`/api/contacts/${contactId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    if (!res.ok) fetchContacts(search);
  }

  async function handleDirRemoveTag(contactId: string, tagId: string) {
    setContacts((prev) =>
      prev.map((c) =>
        c.id === contactId ? { ...c, tags: c.tags.filter((ct) => ct.tag.id !== tagId) } : c
      )
    );
    const res = await fetch(`/api/contacts/${contactId}/tags`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    if (!res.ok) fetchContacts(search);
  }

  async function handleDirCreateTag(contactId: string) {
    if (!dirTagName.trim()) return;
    setDirTagError("");
    const res = await fetch(`/api/contacts/${contactId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: dirTagName.trim(), color: dirTagColor }),
    });
    if (res.ok) {
      const newTag = await res.json();
      setAllTags((prev) => [...prev, newTag].sort((a, b) => a.name.localeCompare(b.name)));
      setContacts((prev) =>
        prev.map((c) => c.id === contactId ? { ...c, tags: [...c.tags, { tag: newTag }] } : c)
      );
      setDirTagName("");
      setDirTagColor(TAG_COLORS[0].value);
      setShowCreateTagInDir(false);
      setActiveTagPopover(null);
    } else {
      const data = await res.json();
      setDirTagError(data.error || "Failed to create tag");
    }
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
      fetchContacts(search);
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

  async function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);
    setError("");

    try {
      const text = await file.text();
      const rows = parseCsv(text);

      if (rows.length === 0) {
        setError("CSV file is empty or has no data rows");
        setImporting(false);
        return;
      }

      const csvContacts = rows.map(mapCsvRow);

      const res = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: csvContacts }),
      });

      const data = await res.json();

      if (res.ok) {
        if (data.requiresResolution) {
          // Pre-select "Replace Existing" for all duplicates
          const defaultResolutions: Record<string, "update" | "create"> = {};
          for (const dup of data.duplicates as DuplicateEntry[]) {
            if (dup.csvContact.email) defaultResolutions[dup.csvContact.email] = "update";
          }
          setResolutions(defaultResolutions);
          setDuplicatePending({
            duplicates: data.duplicates,
            allContacts: csvContacts,
            errors: data.errors,
          });
        } else {
          setImportResult(data);
          fetchContacts(search);
        }
      } else {
        setError(data.error || "Import failed");
      }
    } catch {
      setError("Failed to read or parse CSV file");
    }

    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDuplicateResolution() {
    if (!duplicatePending) return;
    setImporting(true);
    try {
      const res = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: duplicatePending.allContacts, resolutions }),
      });
      const data = await res.json();
      if (res.ok) {
        setImportResult(data);
        setDuplicatePending(null);
        setResolutions({});
        fetchContacts(search);
      } else {
        setError(data.error || "Import failed");
        setDuplicatePending(null);
        setResolutions({});
      }
    } catch {
      setError("Failed to complete import");
      setDuplicatePending(null);
      setResolutions({});
    }
    setImporting(false);
  }

  if (status === "loading" || !session) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="h-5 w-5 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin" />
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
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleCsvImport}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="rounded-lg border border-brand-100 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-brand-50/50 transition-colors disabled:opacity-50"
          >
            {importing ? "Importing..." : "Import CSV"}
          </button>
          {/* Tag All popover */}
          {allTags.length > 0 && contacts.length > 0 && (
            <div className="relative" ref={tagAllRef}>
              <button
                onClick={() => {
                  setShowTagAll((v) => !v);
                  setTagAllId("");
                }}
                className="rounded-lg border border-brand-100 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-brand-50/50 transition-colors"
              >
                Tag All
              </button>
              {showTagAll && (
                <div className="absolute right-0 top-10 z-20 w-60 rounded-xl border border-brand-100 bg-white shadow-lg p-3 space-y-2">
                  <p className="text-xs text-zinc-500">
                    Apply a tag to all {contacts.length} visible contact{contacts.length !== 1 ? "s" : ""}
                  </p>
                  <select
                    value={tagAllId}
                    onChange={(e) => setTagAllId(e.target.value)}
                    className="w-full rounded-lg border border-brand-100 bg-white px-2.5 py-1.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                  >
                    <option value="">Select a tag...</option>
                    {allTags.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleTagAll}
                    disabled={!tagAllId || taggingAll}
                    className="w-full rounded-lg bg-brand-500 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
                  >
                    {taggingAll ? "Applying..." : "Apply Tag"}
                  </button>
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
          >
            {showForm ? "Cancel" : "Add Contact"}
          </button>
        </div>
      </div>

      {importResult && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-emerald-800">
              <span className="font-medium">{importResult.imported}</span> contact{importResult.imported !== 1 ? "s" : ""} imported
              {importResult.skipped > 0 && (
                <span className="ml-2 text-zinc-500">
                  ({importResult.skipped} skipped as duplicates)
                </span>
              )}
            </div>
            <button
              onClick={() => setImportResult(null)}
              className="text-emerald-600 hover:text-emerald-800 text-sm"
            >
              Dismiss
            </button>
          </div>
          {importResult.errors.length > 0 && (
            <div className="mt-2 text-xs text-amber-700">
              {importResult.errors.slice(0, 5).map((err, i) => (
                <p key={i}>{err}</p>
              ))}
              {importResult.errors.length > 5 && (
                <p>...and {importResult.errors.length - 5} more</p>
              )}
            </div>
          )}
        </div>
      )}

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

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 rounded-xl border border-brand-100 bg-white p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">First Name</label>
              <input
                type="text"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                placeholder="Jane"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Last Name</label>
              <input
                type="text"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                placeholder="Smith"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                placeholder="jane@company.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">LinkedIn URL</label>
              <input
                type="url"
                value={form.linkedinUrl}
                onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
                className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                placeholder="https://linkedin.com/in/janesmith"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Contact"}
            </button>
          </div>
        </form>
      )}

      <form onSubmit={handleSearch} className="mb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts by name, email, or company..."
          className="w-full rounded-lg border border-brand-100 bg-white px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </form>

      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {allTags.map((tag) => {
            const active = activeTags.includes(tag.id);
            return (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border transition-opacity"
                style={{
                  backgroundColor: active ? tag.color : "transparent",
                  borderColor: tag.color,
                  color: active ? "white" : tag.color,
                }}
              >
                {tag.name}
              </button>
            );
          })}
          {activeTags.length > 0 && (
            <button
              onClick={() => {
                setActiveTags([]);
                fetchContacts(search, []);
              }}
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Duplicate resolution modal */}
      {duplicatePending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl flex flex-col max-h-[90vh]">
            <div className="p-6 pb-4">
              <h2 className="text-lg font-semibold">Duplicate Contacts Found</h2>
              <p className="mt-1 text-sm text-zinc-500">
                {duplicatePending.duplicates.length} email
                {duplicatePending.duplicates.length !== 1 ? "s" : ""} in your CSV already
                exist in your contacts. Choose how to handle each one.
              </p>
            </div>

            <div className="px-6 pb-2 flex gap-3">
              <button
                onClick={() => {
                  const all: Record<string, "update" | "create"> = {};
                  duplicatePending.duplicates.forEach((d) => {
                    if (d.csvContact.email) all[d.csvContact.email] = "update";
                  });
                  setResolutions(all);
                }}
                className="text-xs text-zinc-500 hover:text-zinc-800 underline underline-offset-2"
              >
                Replace all
              </button>
              <span className="text-xs text-zinc-300">|</span>
              <button
                onClick={() => {
                  const all: Record<string, "update" | "create"> = {};
                  duplicatePending.duplicates.forEach((d) => {
                    if (d.csvContact.email) all[d.csvContact.email] = "create";
                  });
                  setResolutions(all);
                }}
                className="text-xs text-zinc-500 hover:text-zinc-800 underline underline-offset-2"
              >
                Create all as new
              </button>
            </div>

            <div className="px-6 overflow-y-auto flex-1 space-y-3 py-2">
              {duplicatePending.duplicates.map((dup) => {
                const email = dup.csvContact.email!;
                const resolution = resolutions[email] ?? "update";
                const existingName =
                  [dup.existingContact.firstName, dup.existingContact.lastName]
                    .filter(Boolean)
                    .join(" ") || "Unnamed";
                const csvName =
                  [dup.csvContact.firstName, dup.csvContact.lastName]
                    .filter(Boolean)
                    .join(" ") || "Unnamed";
                return (
                  <div key={email} className="rounded-xl border border-brand-100 p-4">
                    <p className="text-sm font-medium text-zinc-700 mb-3">{email}</p>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="rounded-lg bg-zinc-50 p-3 text-xs text-zinc-500">
                        <p className="font-medium text-zinc-600 mb-1">Existing</p>
                        <p>{existingName}</p>
                        {dup.existingContact.title && <p>{dup.existingContact.title}</p>}
                        {dup.existingContact.company && <p>{dup.existingContact.company}</p>}
                      </div>
                      <div className="rounded-lg bg-brand-50/50 p-3 text-xs text-zinc-500">
                        <p className="font-medium text-zinc-600 mb-1">From CSV</p>
                        <p>{csvName}</p>
                        {dup.csvContact.linkedinUrl && (
                          <p className="text-brand-500">Includes LinkedIn</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          setResolutions((prev) => ({ ...prev, [email]: "update" }))
                        }
                        className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                          resolution === "update"
                            ? "bg-brand-500 text-white"
                            : "border border-brand-100 text-zinc-600 hover:bg-brand-50/50"
                        }`}
                      >
                        Replace Existing
                      </button>
                      <button
                        onClick={() =>
                          setResolutions((prev) => ({ ...prev, [email]: "create" }))
                        }
                        className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                          resolution === "create"
                            ? "bg-brand-500 text-white"
                            : "border border-brand-100 text-zinc-600 hover:bg-brand-50/50"
                        }`}
                      >
                        Create New Contact
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {duplicatePending.errors.length > 0 && (
              <div className="px-6 pt-2">
                <p className="text-xs text-amber-600">
                  {duplicatePending.errors.length} row
                  {duplicatePending.errors.length !== 1 ? "s" : ""} skipped due to
                  validation errors.
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 p-6 pt-4 border-t border-brand-50">
              <button
                onClick={() => {
                  setDuplicatePending(null);
                  setResolutions({});
                }}
                className="rounded-lg border border-brand-100 px-4 py-2 text-sm text-zinc-700 hover:bg-brand-50/50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDuplicateResolution}
                disabled={importing}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors disabled:opacity-50"
              >
                {importing ? "Importing..." : "Continue Import"}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-5 w-5 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin" />
        </div>
      ) : contacts.length === 0 ? (
        <div className="rounded-xl border border-brand-100 bg-white py-16 text-center">
          <p className="text-zinc-500">No contacts yet. Add your first contact to get started.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-brand-100 bg-white divide-y divide-brand-50">
          {contacts.map((contact) => (
            <div key={contact.id} className="relative flex items-center px-5 py-4 hover:bg-brand-50/50 transition-colors">
              <Link
                href={`/contacts/${contact.id}`}
                className="flex items-center justify-between flex-1 min-w-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">
                      {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unnamed"}
                    </span>
                    {contact.enrichedAt && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                        Enriched
                      </span>
                    )}
                    {contact.tags.map(({ tag }) => (
                      <span
                        key={tag.id}
                        className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                        style={{ backgroundColor: tag.color }}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-zinc-500">
                    {contact.email && <span>{contact.email}</span>}
                    {contact.company && <span>{contact.company}</span>}
                    {contact.title && <span>{contact.title}</span>}
                  </div>
                </div>
                <div className="ml-4 flex items-center gap-3 shrink-0">
                  {contact.linkedinUrl && (
                    <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-600">LI</span>
                  )}
                  <span className="text-xs text-zinc-400">{contact._count.emailDrafts} drafts</span>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    className="text-brand-200"
                  >
                    <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </Link>

              {/* Inline tag button */}
              <div
                className="relative ml-3 shrink-0"
                ref={activeTagPopover === contact.id ? tagPopoverRef : null}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (activeTagPopover === contact.id) {
                      setActiveTagPopover(null);
                    } else {
                      setActiveTagPopover(contact.id);
                      setShowCreateTagInDir(false);
                      setDirTagError("");
                      setDirTagName("");
                    }
                  }}
                  className="rounded-full border border-brand-100 px-2 py-0.5 text-xs text-zinc-400 hover:text-brand-500 hover:border-brand-300 transition-colors"
                  title="Add tag"
                >
                  + Tag
                </button>

                {activeTagPopover === contact.id && (
                  <div className="absolute right-0 top-7 z-20 w-56 rounded-xl border border-brand-100 bg-white shadow-lg">
                    {!showCreateTagInDir ? (
                      <>
                        <div className="max-h-48 overflow-y-auto">
                          {allTags.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-zinc-400">No tags yet.</p>
                          ) : (
                            allTags.map((tag) => {
                              const applied = contact.tags.some((ct) => ct.tag.id === tag.id);
                              return (
                                <button
                                  key={tag.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    applied
                                      ? handleDirRemoveTag(contact.id, tag.id)
                                      : handleDirAddTag(contact.id, tag.id);
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-brand-50/50 text-left"
                                >
                                  <span
                                    className="h-3 w-3 rounded-full shrink-0"
                                    style={{ backgroundColor: tag.color }}
                                  />
                                  <span className="flex-1">{tag.name}</span>
                                  {applied && <span className="text-brand-500">✓</span>}
                                </button>
                              );
                            })
                          )}
                        </div>
                        <div className="border-t border-brand-50 p-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowCreateTagInDir(true);
                            }}
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
                          value={dirTagName}
                          onChange={(e) => setDirTagName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleDirCreateTag(contact.id)}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="Tag name"
                          className="w-full rounded-lg border border-brand-100 px-2.5 py-1.5 text-xs focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                        />
                        <div className="flex gap-1.5 flex-wrap">
                          {TAG_COLORS.map((c) => (
                            <button
                              key={c.value}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDirTagColor(c.value);
                              }}
                              className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                              style={{
                                backgroundColor: c.value,
                                borderColor: dirTagColor === c.value ? "#1e293b" : "transparent",
                              }}
                              title={c.label}
                            />
                          ))}
                        </div>
                        {dirTagError && <p className="text-xs text-red-600">{dirTagError}</p>}
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDirCreateTag(contact.id);
                            }}
                            disabled={!dirTagName.trim()}
                            className="flex-1 rounded-lg bg-brand-500 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                          >
                            Create
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowCreateTagInDir(false);
                              setDirTagError("");
                            }}
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
          ))}
        </div>
      )}
    </div>
  );
}
