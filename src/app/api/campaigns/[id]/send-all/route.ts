import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, unauthorized } from "@/lib/session";
import { sendDraft } from "@/lib/gmail";

export const maxDuration = 300;

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

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id: campaignId } = await params;

  // Fetch all DRAFT_READY contacts with their latest draft
  const campaignContacts = await prisma.campaignContact.findMany({
    where: {
      campaignId,
      status: "DRAFT_READY",
      campaign: { userId: user.id },
    },
    include: {
      contact: true,
      drafts: {
        where: { status: { not: "SENT" } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (campaignContacts.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, results: [] });
  }

  const baseUrl =
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const tasks = campaignContacts.map((cc) => async () => {
    const draft = cc.drafts[0];

    if (!draft) {
      return { contactId: cc.contactId, success: false, error: "No draft found" };
    }

    if (!cc.contact.email) {
      return { contactId: cc.contactId, success: false, error: "No email address" };
    }

    try {
      await sendDraft(
        user.id,
        draft.id,
        cc.contact.email,
        draft.subject,
        draft.body,
        baseUrl,
        cc.id
      );

      return { contactId: cc.contactId, success: true };
    } catch (error) {
      return {
        contactId: cc.contactId,
        success: false,
        error: error instanceof Error ? error.message : "Send failed",
      };
    }
  });

  const results = await runWithConcurrency(tasks, 5);

  // Mark campaign COMPLETED if nothing remains unsent
  const remainingUnsent = await prisma.campaignContact.count({
    where: { campaignId, status: { in: ["PENDING", "DRAFT_READY"] } },
  });

  if (remainingUnsent === 0) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "COMPLETED" },
    });
  }

  return NextResponse.json({
    sent: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  });
}
