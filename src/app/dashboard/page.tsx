"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Stats {
  contacts: number;
  campaigns: number;
  drafts: number;
  sent: number;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({
    contacts: 0,
    campaigns: 0,
    drafts: 0,
    sent: 0,
  });
  const [recentDrafts, setRecentDrafts] = useState<
    { id: string; subject: string; status: string; contact: { firstName: string | null; lastName: string | null; email: string | null }; createdAt: string }[]
  >([]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (!session) return;

    Promise.all([
      fetch("/api/contacts").then((r) => r.json()),
      fetch("/api/campaigns").then((r) => r.json()),
      fetch("/api/drafts").then((r) => r.json()),
    ]).then(([contacts, campaigns, drafts]) => {
      setStats({
        contacts: contacts.length ?? 0,
        campaigns: campaigns.length ?? 0,
        drafts: drafts.filter((d: { status: string }) => d.status !== "SENT").length ?? 0,
        sent: drafts.filter((d: { status: string }) => d.status === "SENT").length ?? 0,
      });
      setRecentDrafts(drafts.slice(0, 5));
    });
  }, [session]);

  if (status === "loading" || !session) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="h-5 w-5 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin" />
      </div>
    );
  }

  const statCards = [
    { label: "Contacts", value: stats.contacts, href: "/contacts", color: "bg-brand-50 text-brand-600" },
    { label: "Campaigns", value: stats.campaigns, href: "/campaigns", color: "bg-brand-100 text-brand-700" },
    { label: "Pending Drafts", value: stats.drafts, href: "/contacts", color: "bg-amber-50 text-amber-700" },
    { label: "Emails Sent", value: stats.sent, href: "/contacts", color: "bg-emerald-50 text-emerald-700" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Welcome back, {session.user?.name?.split(" ")[0]}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-xl border border-brand-100 bg-white p-5 transition-shadow hover:shadow-md"
          >
            <div className="text-sm font-medium text-zinc-500">{card.label}</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight">{card.value}</div>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Drafts */}
        <div className="rounded-xl border border-brand-100 bg-white">
          <div className="flex items-center justify-between border-b border-brand-50 px-5 py-4">
            <h2 className="text-sm font-semibold">Recent Drafts</h2>
            <Link href="/contacts" className="text-xs text-brand-500 hover:text-brand-700">
              View all
            </Link>
          </div>
          <div className="divide-y divide-brand-50">
            {recentDrafts.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-zinc-400">
                No drafts yet. Create a contact and generate your first email.
              </div>
            ) : (
              recentDrafts.map((draft) => (
                <Link
                  key={draft.id}
                  href={`/compose/${draft.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-brand-50/50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{draft.subject}</div>
                    <div className="text-xs text-zinc-500">
                      {[draft.contact.firstName, draft.contact.lastName].filter(Boolean).join(" ") || draft.contact.email}
                    </div>
                  </div>
                  <span
                    className={`ml-3 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      draft.status === "SENT"
                        ? "bg-emerald-50 text-emerald-700"
                        : draft.status === "APPROVED"
                        ? "bg-brand-50 text-brand-600"
                        : "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {draft.status}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-xl border border-brand-100 bg-white">
          <div className="border-b border-brand-50 px-5 py-4">
            <h2 className="text-sm font-semibold">Quick Actions</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 p-5">
            <Link
              href="/contacts"
              className="rounded-lg border border-brand-100 px-4 py-3 text-sm font-medium transition-colors hover:bg-brand-50/50"
            >
              Add a new contact
            </Link>
            <Link
              href="/templates"
              className="rounded-lg border border-brand-100 px-4 py-3 text-sm font-medium transition-colors hover:bg-brand-50/50"
            >
              Create an email template
            </Link>
            <Link
              href="/campaigns/new"
              className="rounded-lg border border-brand-100 px-4 py-3 text-sm font-medium transition-colors hover:bg-brand-50/50"
            >
              Start a new campaign
            </Link>
            <Link
              href="/settings"
              className="rounded-lg border border-brand-100 px-4 py-3 text-sm font-medium transition-colors hover:bg-brand-50/50"
            >
              Check API connections
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
