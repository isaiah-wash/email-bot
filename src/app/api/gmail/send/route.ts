import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, unauthorized } from "@/lib/session";
import { sendEmail } from "@/lib/gmail";

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const body = await req.json();
  const { draftId } = body;

  if (!draftId) {
    return NextResponse.json(
      { error: "draftId is required" },
      { status: 400 }
    );
  }

  const draft = await prisma.emailDraft.findFirst({
    where: { id: draftId },
    include: { contact: true },
  });

  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  if (draft.contact.userId !== user.id) {
    return unauthorized();
  }

  if (!draft.contact.email) {
    return NextResponse.json(
      { error: "Contact has no email address" },
      { status: 400 }
    );
  }

  try {
    const result = await sendEmail(
      user.id,
      draft.contact.email,
      draft.subject,
      draft.body
    );

    // Update draft status
    await prisma.emailDraft.update({
      where: { id: draftId },
      data: { status: "SENT" },
    });

    // Create sent email record
    const sentEmail = await prisma.sentEmail.create({
      data: {
        draftId,
        gmailMessageId: result.messageId,
        gmailThreadId: result.threadId,
      },
    });

    // Update campaign contact status if applicable
    if (draft.campaignContactId) {
      await prisma.campaignContact.update({
        where: { id: draft.campaignContactId },
        data: { status: "SENT" },
      });
    }

    return NextResponse.json(sentEmail);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send email";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
