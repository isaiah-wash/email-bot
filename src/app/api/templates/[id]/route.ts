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

  const template = await prisma.template.findFirst({
    where: { id, userId: user.id },
  });

  if (!template) {
    return NextResponse.json(
      { error: "Template not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(template);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.template.findFirst({
    where: { id, userId: user.id },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Template not found" },
      { status: 404 }
    );
  }

  const template = await prisma.template.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.subjectTemplate !== undefined && {
        subjectTemplate: body.subjectTemplate,
      }),
      ...(body.bodyInstructions !== undefined && {
        bodyInstructions: body.bodyInstructions,
      }),
      ...(body.variables !== undefined && { variables: body.variables }),
    },
  });

  return NextResponse.json(template);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const existing = await prisma.template.findFirst({
    where: { id, userId: user.id },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Template not found" },
      { status: 404 }
    );
  }

  await prisma.template.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
