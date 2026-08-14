import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, unauthorized } from "@/lib/session";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const [contacts, campaigns, pendingDrafts, sentDrafts, recentDrafts] = await Promise.all([
    prisma.contact.count({ where: { userId: user.id } }),
    prisma.campaign.count({ where: { userId: user.id } }),
    prisma.emailDraft.count({
      where: { contact: { userId: user.id }, status: { not: "SENT" } },
    }),
    prisma.emailDraft.count({
      where: { contact: { userId: user.id }, status: "SENT" },
    }),
    prisma.emailDraft.findMany({
      where: { contact: { userId: user.id } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        subject: true,
        status: true,
        createdAt: true,
        contact: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
    }),
  ]);

  return NextResponse.json({
    stats: { contacts, campaigns, drafts: pendingDrafts, sent: sentDrafts },
    recentDrafts,
  });
}
