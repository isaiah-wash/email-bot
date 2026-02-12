import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, unauthorized } from "@/lib/session";
import { generateEmailDraft } from "@/lib/claude";
import { fetchThreadsForContact } from "@/lib/gmail";

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

  const results: { contactId: string; success: boolean; error?: string }[] = [];

  for (const cc of campaign.contacts) {
    try {
      // Fetch email history if contact has email
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

      const generated = await generateEmailDraft({
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
        templateSubject: campaign.template.subjectTemplate,
        templateInstructions: campaign.template.bodyInstructions,
        campaignContext: campaign.context ?? undefined,
      });

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

      results.push({ contactId: cc.contactId, success: true });
    } catch (error) {
      results.push({
        contactId: cc.contactId,
        success: false,
        error: error instanceof Error ? error.message : "Generation failed",
      });
    }
  }

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
