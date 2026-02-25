import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, unauthorized } from "@/lib/session";
import { google } from "googleapis";

export const maxDuration = 60;

async function getGmailClient(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });

  if (!account?.access_token) {
    throw new Error("No Google account found.");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET
  );

  const now = Math.floor(Date.now() / 1000);
  if (account.expires_at && account.expires_at < now && account.refresh_token) {
    oauth2Client.setCredentials({ refresh_token: account.refresh_token });
    const { credentials } = await oauth2Client.refreshAccessToken();

    await prisma.account.update({
      where: { id: account.id },
      data: {
        access_token: credentials.access_token,
        expires_at: credentials.expiry_date
          ? Math.floor(credentials.expiry_date / 1000)
          : undefined,
        refresh_token: credentials.refresh_token ?? account.refresh_token,
      },
    });

    oauth2Client.setCredentials(credentials);
  } else {
    oauth2Client.setCredentials({ access_token: account.access_token });
  }

  return google.gmail({ version: "v1", auth: oauth2Client });
}

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id: campaignId } = await params;

  // Verify campaign ownership
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, userId: user.id },
    select: { id: true, createdAt: true },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // --- DB stats ---
  const [totalContacts, sent, draftReady, pending, openedCount, sentEmails] =
    await Promise.all([
      prisma.campaignContact.count({ where: { campaignId } }),
      prisma.campaignContact.count({ where: { campaignId, status: "SENT" } }),
      prisma.campaignContact.count({ where: { campaignId, status: "DRAFT_READY" } }),
      prisma.campaignContact.count({ where: { campaignId, status: "PENDING" } }),
      // Count drafts with openedAt set, linked to this campaign
      prisma.emailDraft.count({
        where: {
          campaignContact: { campaignId },
          openedAt: { not: null },
        },
      }),
      // Fetch sent emails for timeline + avg time calc
      prisma.sentEmail.findMany({
        where: { draft: { campaignContact: { campaignId } } },
        select: { sentAt: true, gmailThreadId: true },
        orderBy: { sentAt: "desc" },
      }),
    ]);

  const sendRate = totalContacts > 0 ? Math.round((sent / totalContacts) * 1000) / 10 : 0;
  const openRate = sent > 0 ? Math.round((openedCount / sent) * 1000) / 10 : 0;

  // Avg hours to send
  let avgHoursToSend = 0;
  if (sentEmails.length > 0) {
    const campaignCreated = campaign.createdAt.getTime();
    const totalMs = sentEmails.reduce(
      (sum, se) => sum + (se.sentAt.getTime() - campaignCreated),
      0
    );
    avgHoursToSend = Math.round((totalMs / sentEmails.length / 3_600_000) * 10) / 10;
  }

  // Send timeline grouped by day
  const timelineMap = new Map<string, number>();
  for (const se of sentEmails) {
    const date = se.sentAt.toISOString().slice(0, 10);
    timelineMap.set(date, (timelineMap.get(date) ?? 0) + 1);
  }
  const sendTimeline = Array.from(timelineMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // --- Reply detection (Gmail API, capped at 50) ---
  const recentSentEmails = sentEmails.slice(0, 50);
  const threadIds = recentSentEmails
    .map((se) => se.gmailThreadId)
    .filter((id): id is string => !!id);

  let repliesDetected = 0;
  const replyCheckedCount = threadIds.length;

  if (threadIds.length > 0) {
    try {
      const gmail = await getGmailClient(user.id);

      // Get sender's email once
      const profile = await gmail.users.getProfile({ userId: "me" });
      const senderEmail = profile.data.emailAddress?.toLowerCase() ?? "";

      const tasks = threadIds.map((threadId) => async () => {
        try {
          const thread = await gmail.users.threads.get({
            userId: "me",
            id: threadId,
            format: "metadata",
            metadataHeaders: ["From"],
          });

          const messages = thread.data.messages ?? [];
          if (messages.length <= 1) return false;

          // Check if any message is not from the sender
          return messages.some((msg) => {
            const from = (
              msg.payload?.headers?.find((h) => h.name?.toLowerCase() === "from")
                ?.value ?? ""
            ).toLowerCase();
            return !from.includes(senderEmail);
          });
        } catch {
          return false;
        }
      });

      const results = await runWithConcurrency(tasks, 5);
      repliesDetected = results.filter(Boolean).length;
    } catch {
      // Gmail API errors should not fail the whole response
    }
  }

  const replyRate =
    replyCheckedCount > 0
      ? Math.round((repliesDetected / replyCheckedCount) * 1000) / 10
      : 0;

  return NextResponse.json({
    totalContacts,
    sent,
    draftReady,
    pending,
    sendRate,
    opened: openedCount,
    openRate,
    repliesDetected,
    replyCheckedCount,
    replyRate,
    avgHoursToSend,
    sendTimeline,
  });
}
