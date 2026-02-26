"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

interface TemplateOption {
  id: string;
  name: string;
}

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  context: string | null;
  useAi: boolean;
  status: string;
  template: { id: string; name: string } | null;
  contacts: {
    id: string;
    status: string;
    contact: {
      id: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
      company: string | null;
    };
    drafts: {
      id: string;
      subject: string;
      status: string;
      sentEmail: { sentAt: string } | null;
    }[];
  }[];
}

interface Analytics {
  totalContacts: number;
  sent: number;
  draftReady: number;
  pending: number;
  sendRate: number;
  opened: number;
  openRate: number;
  repliesDetected: number;
  replyCheckedCount: number;
  replyRate: number;
  avgHoursToSend: number;
  sendTimeline: { date: string; count: number }[];
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-zinc-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-brand-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-zinc-500 w-20 text-right shrink-0">
        {value} / {max}
      </span>
    </div>
  );
}

function TimelineBar({ count, max, date }: { count: number; max: number; date: string }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  const label = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-zinc-500 w-12 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-zinc-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-zinc-500 w-8 text-right shrink-0">{count}</span>
    </div>
  );
}

export default function CampaignDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);
  const [sendAllResult, setSendAllResult] = useState<{ sent: number; failed: number } | null>(null);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [updatingTemplate, setUpdatingTemplate] = useState(false);

  const [activeTab, setActiveTab] = useState<"contacts" | "analytics">("contacts");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (!session) return;
    fetchCampaign();
    fetch("/api/templates").then((r) => r.json()).then(setTemplates);
  }, [session, campaignId]);

  async function fetchCampaign() {
    const res = await fetch(`/api/campaigns/${campaignId}`);
    if (!res.ok) {
      router.replace("/campaigns");
      return;
    }
    setCampaign(await res.json());
    setLoading(false);
  }

  async function handleGenerate() {
    setGenerating(true);
    const res = await fetch(`/api/campaigns/${campaignId}/generate`, {
      method: "POST",
    });
    if (res.ok) {
      fetchCampaign();
    }
    setGenerating(false);
  }

  async function handleTemplateChange(templateId: string) {
    setUpdatingTemplate(true);
    const res = await fetch(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: templateId || null }),
    });
    if (res.ok) {
      await fetchCampaign();
    }
    setUpdatingTemplate(false);
  }

  async function handleSendAll() {
    if (!confirm(`Send all ${draftReadyCount} draft emails now without reviewing? This cannot be undone.`)) return;
    setSendingAll(true);
    setSendAllResult(null);
    const res = await fetch(`/api/campaigns/${campaignId}/send-all`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setSendAllResult({ sent: data.sent, failed: data.failed });
      fetchCampaign();
    }
    setSendingAll(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this campaign?")) return;
    await fetch(`/api/campaigns/${campaignId}`, { method: "DELETE" });
    router.replace("/campaigns");
  }

  async function handleAnalyticsTab() {
    setActiveTab("analytics");
    if (analytics || analyticsLoading) return;
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/analytics`);
      if (!res.ok) throw new Error("Failed to load analytics");
      setAnalytics(await res.json());
    } catch (e) {
      setAnalyticsError(e instanceof Error ? e.message : "Failed to load analytics");
    } finally {
      setAnalyticsLoading(false);
    }
  }

  if (status === "loading" || loading || !session) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="h-5 w-5 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin" />
      </div>
    );
  }

  if (!campaign) return null;

  const pendingCount = campaign.contacts.filter((c) => c.status === "PENDING").length;
  const draftReadyCount = campaign.contacts.filter((c) => c.status === "DRAFT_READY").length;
  const sentCount = campaign.contacts.filter((c) => c.status === "SENT").length;

  const maxTimelineCount = analytics
    ? Math.max(...analytics.sendTimeline.map((d) => d.count), 1)
    : 1;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/campaigns" className="text-sm text-brand-500 hover:text-brand-700 mb-4 inline-block">
        &larr; Back to campaigns
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{campaign.name}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              campaign.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" :
              campaign.status === "ACTIVE" ? "bg-brand-50 text-brand-600" :
              "bg-zinc-100 text-zinc-600"
            }`}>
              {campaign.status}
            </span>
            {!campaign.useAi && (
              <span className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-50 text-amber-700">
                No AI
              </span>
            )}
          </div>
          {campaign.description && (
            <p className="mt-1 text-sm text-zinc-500">{campaign.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && campaign.template && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {generating ? "Generating..." : `Generate Drafts (${pendingCount})`}
            </button>
          )}
          {draftReadyCount > 0 && (
            <button
              onClick={handleSendAll}
              disabled={sendingAll}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {sendingAll ? "Sending..." : `Send All (${draftReadyCount})`}
            </button>
          )}
          <button
            onClick={handleDelete}
            className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      {sendAllResult && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center justify-between">
          <p className="text-sm text-emerald-800">
            <span className="font-medium">{sendAllResult.sent}</span> email{sendAllResult.sent !== 1 ? "s" : ""} sent
            {sendAllResult.failed > 0 && (
              <span className="ml-2 text-amber-700">· {sendAllResult.failed} failed</span>
            )}
          </p>
          <button onClick={() => setSendAllResult(null)} className="text-emerald-600 hover:text-emerald-800 text-sm">
            Dismiss
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-brand-100">
        <button
          onClick={() => setActiveTab("contacts")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "contacts"
              ? "border-brand-500 text-brand-600"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          Contacts
        </button>
        <button
          onClick={handleAnalyticsTab}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "analytics"
              ? "border-brand-500 text-brand-600"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          Analytics
        </button>
      </div>

      {/* Contacts tab */}
      {activeTab === "contacts" && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="rounded-xl border border-brand-100 bg-white p-4 text-center">
              <div className="text-2xl font-semibold">{pendingCount}</div>
              <div className="text-xs text-zinc-500 mt-0.5">Pending</div>
            </div>
            <div className="rounded-xl border border-brand-100 bg-white p-4 text-center">
              <div className="text-2xl font-semibold">{draftReadyCount}</div>
              <div className="text-xs text-zinc-500 mt-0.5">Drafts Ready</div>
            </div>
            <div className="rounded-xl border border-brand-100 bg-white p-4 text-center">
              <div className="text-2xl font-semibold">{sentCount}</div>
              <div className="text-xs text-zinc-500 mt-0.5">Sent</div>
            </div>
          </div>

          {campaign.context && (
            <div className="rounded-xl border border-brand-100 bg-white p-5 mb-6">
              <h2 className="text-sm font-semibold mb-2">Campaign Context</h2>
              <p className="text-sm text-zinc-600 whitespace-pre-wrap">{campaign.context}</p>
            </div>
          )}

          {/* Template Selector */}
          <div className="rounded-xl border border-brand-100 bg-white p-5 mb-6">
            <h2 className="text-sm font-semibold mb-2">Template</h2>
            <select
              value={campaign.template?.id || ""}
              onChange={(e) => handleTemplateChange(e.target.value)}
              disabled={updatingTemplate}
              className="w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm disabled:opacity-50"
            >
              <option value="">No template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {!campaign.template && (
              <p className="mt-1.5 text-xs text-zinc-400">Assign a template to enable draft generation</p>
            )}
          </div>

          {/* Contacts table */}
          <div className="rounded-xl border border-brand-100 bg-white">
            <div className="border-b border-brand-50 px-5 py-4">
              <h2 className="text-sm font-semibold">
                Contacts ({campaign.contacts.length})
              </h2>
            </div>
            <div className="divide-y divide-brand-50">
              {campaign.contacts.map((cc) => {
                const name = [cc.contact.firstName, cc.contact.lastName].filter(Boolean).join(" ") || "Unnamed";
                const latestDraft = cc.drafts[0];

                return (
                  <div key={cc.id} className="flex items-center justify-between px-5 py-4">
                    <div className="min-w-0">
                      <Link href={`/contacts/${cc.contact.id}`} className="text-sm font-medium hover:underline">
                        {name}
                      </Link>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {cc.contact.email || "No email"} {cc.contact.company && `· ${cc.contact.company}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        cc.status === "SENT" ? "bg-emerald-50 text-emerald-700" :
                        cc.status === "APPROVED" ? "bg-brand-50 text-brand-600" :
                        cc.status === "DRAFT_READY" ? "bg-amber-50 text-amber-700" :
                        "bg-zinc-100 text-zinc-600"
                      }`}>
                        {cc.status.replace("_", " ")}
                      </span>
                      {latestDraft && (
                        <Link
                          href={`/compose/${latestDraft.id}`}
                          className="text-xs text-brand-500 hover:underline"
                        >
                          {latestDraft.status === "SENT" ? "View" : "Review"}
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Analytics tab */}
      {activeTab === "analytics" && (
        <div>
          {analyticsLoading && (
            <div className="flex items-center justify-center py-20">
              <div className="h-5 w-5 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin" />
            </div>
          )}

          {analyticsError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {analyticsError}
            </div>
          )}

          {analytics && !analyticsLoading && (
            <div className="space-y-6">
              {/* Top metric cards */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-xl border border-brand-100 bg-white p-5 text-center">
                  <div className="text-2xl font-semibold">{analytics.sendRate}%</div>
                  <div className="text-xs text-zinc-500 mt-1">Send Rate</div>
                </div>
                <div className="rounded-xl border border-brand-100 bg-white p-5 text-center">
                  <div className="text-2xl font-semibold">{analytics.openRate}%</div>
                  <div className="text-xs text-zinc-500 mt-1">Open Rate</div>
                </div>
                <div className="rounded-xl border border-brand-100 bg-white p-5 text-center">
                  <div className="text-2xl font-semibold">{analytics.replyRate}%</div>
                  <div className="text-xs text-zinc-500 mt-1">Reply Rate</div>
                </div>
                <div className="rounded-xl border border-brand-100 bg-white p-5 text-center">
                  <div className="text-2xl font-semibold">{analytics.avgHoursToSend} hrs</div>
                  <div className="text-xs text-zinc-500 mt-1">Avg to Send</div>
                </div>
              </div>

              {/* Status breakdown */}
              <div className="rounded-xl border border-brand-100 bg-white p-5">
                <h2 className="text-sm font-semibold mb-4">Status Breakdown</h2>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs text-zinc-500 mb-1">
                      <span>Sent</span>
                    </div>
                    <ProgressBar value={analytics.sent} max={analytics.totalContacts} />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-zinc-500 mb-1">
                      <span>Opened</span>
                    </div>
                    <ProgressBar value={analytics.opened} max={analytics.sent} />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-zinc-500 mb-1">
                      <span>Replied</span>
                    </div>
                    <ProgressBar value={analytics.repliesDetected} max={analytics.replyCheckedCount} />
                  </div>
                </div>
              </div>

              {/* Send Timeline */}
              {analytics.sendTimeline.length > 0 && (
                <div className="rounded-xl border border-brand-100 bg-white p-5">
                  <h2 className="text-sm font-semibold mb-4">Send Timeline</h2>
                  <div className="space-y-2">
                    {analytics.sendTimeline.map((d) => (
                      <TimelineBar
                        key={d.date}
                        date={d.date}
                        count={d.count}
                        max={maxTimelineCount}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Disclaimer */}
              <p className="text-xs text-zinc-400 leading-relaxed">
                Open rate uses tracking pixels. Some clients (Apple Mail Privacy Protection, etc.) may inflate counts.
                Reply rate is based on the {analytics.replyCheckedCount} most recently sent thread{analytics.replyCheckedCount !== 1 ? "s" : ""}.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
