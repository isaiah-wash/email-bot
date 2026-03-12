import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, unauthorized } from "@/lib/session";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const templates = await prisma.template.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      subjectTemplate: true,
      bodyInstructions: true,
      variables: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { campaigns: true } },
      // attachments intentionally excluded — can be large base64 data
    },
  });

  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const body = await req.json();
  const { name, subjectTemplate, bodyInstructions, variables, attachments } = body;

  if (!name || !subjectTemplate || !bodyInstructions) {
    return NextResponse.json(
      { error: "name, subjectTemplate, and bodyInstructions are required" },
      { status: 400 }
    );
  }

  const template = await prisma.template.create({
    data: {
      userId: user.id,
      name,
      subjectTemplate,
      bodyInstructions,
      variables: variables || null,
      attachments: attachments || null,
    },
  });

  if (body.campaignIds?.length) {
    await prisma.campaign.updateMany({
      where: { id: { in: body.campaignIds }, userId: user.id },
      data: { templateId: template.id },
    });
  }

  return NextResponse.json(template, { status: 201 });
}
