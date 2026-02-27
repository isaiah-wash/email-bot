import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, unauthorized } from "@/lib/session";
import { generateEmailDraft } from "@/lib/claude";
import { fetchThreadsForContact } from "@/lib/gmail";

export const maxDuration = 300; // 5 minutes — required for large campaigns

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

  const { id } = await params;

  const campaign = await prisma.campaign.findFirst({
    where: { id, userId: user.id },
    include: {
      template: true,
      contacts: {
        where: { status: "PENDING" },
        include: { contact: true },
      },
    },
  });

  if (!campaign) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  if (!campaign.template) {
    return NextResponse.json(
      { error: "Campaign has no template assigned" },
      { status: 400 }
    );
  }

  const tasks = campaign.contacts.map((cc) => async () => {
    try {
      let generated: { subject: string; body: string };

      if (campaign.useAi) {
        // AI-powered personalized generation
        let emailHistory: {
          from: string;
          subject: string;
          body: string;
          date: string;
        }[] = [];
        if (cc.contact.email) {
          try {
            const threads = await fetchThreadsForContact(
              user.id,
              cc.contact.email,
              3
            );
            emailHistory = threads.flatMap((t) =>
              t.messages.map((m) => ({
                from: m.from,
                subject: m.subject,
                body: m.body,
                date: m.date,
              }))
            );
          } catch {
            // Continue without email history
          }
        }

        generated = await generateEmailDraft({
          contactName:
            [cc.contact.firstName, cc.contact.lastName]
              .filter(Boolean)
              .join(" ") ||
            cc.contact.email ||
            "Contact",
          contactEmail: cc.contact.email ?? undefined,
          contactCompany: cc.contact.company ?? undefined,
          contactTitle: cc.contact.title ?? undefined,
          linkedinData:
            (cc.contact.linkedinData as Record<string, unknown>) ?? undefined,
          emailHistory,
          templateSubject: campaign.template!.subjectTemplate,
          templateInstructions: campaign.template!.bodyInstructions,
          campaignContext: campaign.context ?? undefined,
        });
      } else {
        // No AI — use template subject and body instructions directly
        generated = {
          subject: campaign.template!.subjectTemplate,
          body: campaign.template!.bodyInstructions,
        };
      }

      await prisma.emailDraft.create({
        data: {
          contactId: cc.contactId,
          campaignContactId: cc.id,
          subject: generated.subject,
          body: generated.body,
          generationContext: {
            templateId: campaign.templateId,
            campaignId: campaign.id,
          },
          status: "GENERATED",
        },
      });

      await prisma.campaignContact.update({
        where: { id: cc.id },
        data: { status: "DRAFT_READY" },
      });

      return { contactId: cc.contactId, success: true } as const;
    } catch (error) {
      return {
        contactId: cc.contactId,
        success: false,
        error: error instanceof Error ? error.message : "Generation failed",
      } as const;
    }
  });

  const results = await runWithConcurrency(tasks, 5);

  // Update campaign status to ACTIVE
  await prisma.campaign.update({
    where: { id },
    data: { status: "ACTIVE" },
  });

  return NextResponse.json({
    generated: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  });
}
