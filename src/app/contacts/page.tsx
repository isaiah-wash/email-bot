"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
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

  // CSV import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);

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

      const contacts = rows.map(mapCsvRow);

      const res = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts }),
      });

      const data = await res.json();

      if (res.ok) {
        setImportResult(data);
        fetchContacts();
      } else {
        setError(data.error || "Import failed");
      }
    } catch {
      setError("Failed to read or parse CSV file");
    }

    setImporting(false);
    // Reset the file input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
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

      <form onSubmit={handleSearch} className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts by name, email, or company..."
          className="w-full rounded-lg border border-brand-100 bg-white px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </form>

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
            <Link
              key={contact.id}
              href={`/contacts/${contact.id}`}
              className="flex items-center justify-between px-5 py-4 hover:bg-brand-50/50 transition-colors"
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
          ))}
        </div>
      )}
    </div>
  );
}
