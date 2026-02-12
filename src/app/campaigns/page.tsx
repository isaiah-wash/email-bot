"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: string;
  template: { name: string } | null;
  _count: { contacts: number };
  statusCounts: Record<string, number>;
  createdAt: string;
}

export default function CampaignsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (!session) return;
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((data) => {
        setCampaigns(data);
        setLoading(false);
      });
  }, [session]);

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
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="mt-1 text-sm text-zinc-500">Batch email outreach campaigns</p>
        </div>
        <Link
          href="/campaigns/new"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
        >
          New Campaign
        </Link>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-5 w-5 rounded-full border-2 border-zinc-300 border-t-zinc-600 animate-spin" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white py-16 text-center">
          <p className="text-zinc-500">No campaigns yet. Create your first campaign to start batch outreach.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => (
            <Link
              key={campaign.id}
              href={`/campaigns/${campaign.id}`}
              className="rounded-xl border border-zinc-200 bg-white p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  campaign.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" :
                  campaign.status === "ACTIVE" ? "bg-blue-50 text-blue-700" :
                  "bg-zinc-100 text-zinc-600"
                }`}>
                  {campaign.status}
                </span>
                <span className="text-xs text-zinc-400">
                  {new Date(campaign.createdAt).toLocaleDateString()}
                </span>
              </div>
              <h3 className="text-sm font-semibold">{campaign.name}</h3>
              {campaign.description && (
                <p className="mt-1 text-xs text-zinc-500 line-clamp-2">{campaign.description}</p>
              )}
              <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500">
                <span>{campaign._count.contacts} contacts</span>
                {campaign.template && <span>Template: {campaign.template.name}</span>}
              </div>
              {Object.keys(campaign.statusCounts).length > 0 && (
                <div className="mt-3 flex gap-2">
                  {Object.entries(campaign.statusCounts).map(([s, count]) => (
                    <span key={s} className="text-xs text-zinc-400">
                      {count} {s.toLowerCase().replace("_", " ")}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
