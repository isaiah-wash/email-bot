"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  if (status === "loading" || !session) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="h-5 w-5 rounded-full border-2 border-zinc-300 border-t-zinc-600 animate-spin" />
      </div>
    );
  }

  const connections = [
    {
      name: "Google Account",
      description: "Gmail access for sending and reading emails",
      status: session ? "Connected" : "Not connected",
      connected: !!session,
      detail: session?.user?.email,
    },
    {
      name: "Proxycurl API",
      description: "LinkedIn profile enrichment",
      status: process.env.NEXT_PUBLIC_HAS_PROXYCURL ? "Configured" : "Check server env",
      connected: true,
      detail: "Set PROXYCURL_API_KEY in .env",
    },
    {
      name: "Claude API",
      description: "AI-powered email draft generation",
      status: process.env.NEXT_PUBLIC_HAS_ANTHROPIC ? "Configured" : "Check server env",
      connected: true,
      detail: "Set ANTHROPIC_API_KEY in .env",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">Manage your account and API connections</p>
      </div>

      {/* Account */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 mb-6">
        <h2 className="text-sm font-semibold mb-4">Account</h2>
        <div className="flex items-center gap-4">
          {session.user?.image && (
            <img src={session.user.image} alt="" className="h-12 w-12 rounded-full" />
          )}
          <div>
            <div className="font-medium">{session.user?.name}</div>
            <div className="text-sm text-zinc-500">{session.user?.email}</div>
          </div>
        </div>
      </div>

      {/* Connections */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-semibold mb-4">API Connections</h2>
        <div className="divide-y divide-zinc-100">
          {connections.map((conn) => (
            <div key={conn.name} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
              <div>
                <div className="text-sm font-medium">{conn.name}</div>
                <div className="text-xs text-zinc-500 mt-0.5">{conn.description}</div>
                {conn.detail && (
                  <div className="text-xs text-zinc-400 mt-0.5">{conn.detail}</div>
                )}
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                conn.connected
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700"
              }`}>
                {conn.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Environment Setup Guide */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 mt-6">
        <h2 className="text-sm font-semibold mb-3">Setup Guide</h2>
        <div className="space-y-3 text-sm text-zinc-600">
          <div>
            <div className="font-medium text-zinc-900">1. Google OAuth</div>
            <p className="text-xs mt-0.5">Create a project in Google Cloud Console, enable Gmail API, create OAuth credentials, and add AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET to your .env file.</p>
          </div>
          <div>
            <div className="font-medium text-zinc-900">2. Proxycurl</div>
            <p className="text-xs mt-0.5">Sign up at proxycurl.com, get your API key, and add PROXYCURL_API_KEY to your .env file.</p>
          </div>
          <div>
            <div className="font-medium text-zinc-900">3. Anthropic</div>
            <p className="text-xs mt-0.5">Get your API key from console.anthropic.com and add ANTHROPIC_API_KEY to your .env file.</p>
          </div>
          <div>
            <div className="font-medium text-zinc-900">4. Database</div>
            <p className="text-xs mt-0.5">Set DATABASE_URL in .env and run: npx prisma db push</p>
          </div>
        </div>
      </div>
    </div>
  );
}
