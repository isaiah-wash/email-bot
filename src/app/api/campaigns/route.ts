import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, unauthorized } from "@/lib/session";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const campaigns = await prisma.campaign.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      template: true,
      _count: { select: { contacts: true } },
      contacts: {
        select: { status: true },
      },
    },
  });

  // Add status summary to each campaign
  const result = campaigns.map((c) => {
    const statusCounts = c.contacts.reduce(
      (acc, cc) => {
        acc[cc.status] = (acc[cc.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    const { contacts: _contacts, ...rest } = c;
    return { ...rest, statusCounts };
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const body = await req.json();
  const { name, description, context, templateId, contactIds } = body;

  if (!name) {
    return NextResponse.json(
      { error: "Campaign name is required" },
      { status: 400 }
    );
  }

  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id,
      name,
      description: description || null,
      context: context || null,
      templateId: templateId || null,
      contacts: contactIds?.length
        ? {
            create: contactIds.map((contactId: string) => ({
              contactId,
            })),
          }
        : undefined,
    },
    include: {
      template: true,
      contacts: { include: { contact: true } },
    },
  });

  return NextResponse.json(campaign, { status: 201 });
}
