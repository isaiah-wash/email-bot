import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, unauthorized } from "@/lib/session";

export async function GET(
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
        include: {
          contact: true,
          drafts: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { sentEmail: true },
          },
        },
      },
    },
  });

  if (!campaign) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(campaign);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.campaign.findFirst({
    where: { id, userId: user.id },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  // Handle adding contacts
  if (body.addContactIds?.length) {
    await prisma.campaignContact.createMany({
      data: body.addContactIds.map((contactId: string) => ({
        campaignId: id,
        contactId,
      })),
      skipDuplicates: true,
    });
  }

  // Handle removing contacts
  if (body.removeContactIds?.length) {
    await prisma.campaignContact.deleteMany({
      where: {
        campaignId: id,
        contactId: { in: body.removeContactIds },
      },
    });
  }

  const campaign = await prisma.campaign.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && {
        description: body.description,
      }),
      ...(body.context !== undefined && { context: body.context }),
      ...(body.templateId !== undefined && { templateId: body.templateId }),
      ...(body.status !== undefined && { status: body.status }),
    },
    include: {
      template: true,
      contacts: { include: { contact: true } },
    },
  });

  return NextResponse.json(campaign);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const existing = await prisma.campaign.findFirst({
    where: { id, userId: user.id },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  await prisma.campaign.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
