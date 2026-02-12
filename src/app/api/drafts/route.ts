import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, unauthorized } from "@/lib/session";
import { generateEmailDraft } from "@/lib/claude";
import { fetchThreadsForContact } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const contactId = req.nextUrl.searchParams.get("contactId");
  const status = req.nextUrl.searchParams.get("status");

  const where: Record<string, unknown> = {
    contact: { userId: user.id },
  };

  if (contactId) where.contactId = contactId;
  if (status) where.status = status;

  const drafts = await prisma.emailDraft.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      contact: true,
      sentEmail: true,
    },
  });

  return NextResponse.json(drafts);
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const body = await req.json();
  const { contactId, templateId, campaignContactId } = body;

  if (!contactId || !templateId) {
    return NextResponse.json(
      { error: "contactId and templateId are required" },
      { status: 400 }
    );
  }

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, userId: user.id },
  });

  if (!contact) {
    return NextResponse.json(
      { error: "Contact not found" },
      { status: 404 }
    );
  }

  const template = await prisma.template.findFirst({
    where: { id: templateId, userId: user.id },
  });

  if (!template) {
    return NextResponse.json(
      { error: "Template not found" },
      { status: 404 }
    );
  }

  // Fetch email history if contact has email
  let emailHistory: { from: string; subject: string; body: string; date: string }[] = [];
  if (contact.email) {
    try {
      const threads = await fetchThreadsForContact(user.id, contact.email, 3);
      emailHistory = threads.flatMap((t) =>
        t.messages.map((m) => ({
          from: m.from,
          subject: m.subject,
          body: m.body,
          date: m.date,
        }))
      );
    } catch {
      // Gmail fetch may fail if not connected — continue without history
    }
  }

  // Get campaign context if part of a campaign
  let campaignContext: string | undefined;
  if (campaignContactId) {
    const cc = await prisma.campaignContact.findFirst({
      where: { id: campaignContactId },
      include: { campaign: true },
    });
    campaignContext = cc?.campaign?.context ?? undefined;
  }

  const generated = await generateEmailDraft({
    contactName:
      [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
      contact.email ||
      "Contact",
    contactEmail: contact.email ?? undefined,
    contactCompany: contact.company ?? undefined,
    contactTitle: contact.title ?? undefined,
    linkedinData: (contact.linkedinData as Record<string, unknown>) ?? undefined,
    emailHistory,
    templateSubject: template.subjectTemplate,
    templateInstructions: template.bodyInstructions,
    campaignContext,
  });

  const draft = await prisma.emailDraft.create({
    data: {
      contactId,
      campaignContactId: campaignContactId || null,
      subject: generated.subject,
      body: generated.body,
      generationContext: {
        templateId,
        contactData: {
          name: contact.firstName,
          company: contact.company,
        },
      },
      status: "GENERATED",
    },
    include: { contact: true },
  });

  // Update campaign contact status if applicable
  if (campaignContactId) {
    await prisma.campaignContact.update({
      where: { id: campaignContactId },
      data: { status: "DRAFT_READY" },
    });
  }

  return NextResponse.json(draft, { status: 201 });
}
