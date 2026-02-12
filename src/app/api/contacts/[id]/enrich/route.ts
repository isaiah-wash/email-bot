import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, unauthorized } from "@/lib/session";
import {
  enrichFromLinkedIn,
  extractEmailFromProfile,
  extractCompanyFromProfile,
  extractTitleFromProfile,
} from "@/lib/proxycurl";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id, userId: user.id },
  });

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  if (!contact.linkedinUrl) {
    return NextResponse.json(
      { error: "Contact has no LinkedIn URL to enrich from" },
      { status: 400 }
    );
  }

  try {
    const profile = await enrichFromLinkedIn(contact.linkedinUrl);

    const updateData: Record<string, unknown> = {
      linkedinData: profile as unknown as Record<string, unknown>,
      enrichedAt: new Date(),
    };

    // Fill in missing fields from profile
    if (!contact.firstName && profile.first_name) {
      updateData.firstName = profile.first_name;
    }
    if (!contact.lastName && profile.last_name) {
      updateData.lastName = profile.last_name;
    }
    if (!contact.email) {
      const email = extractEmailFromProfile(profile);
      if (email) updateData.email = email;
    }
    if (!contact.company) {
      const company = extractCompanyFromProfile(profile);
      if (company) updateData.company = company;
    }
    if (!contact.title) {
      const title = extractTitleFromProfile(profile);
      if (title) updateData.title = title;
    }

    const updated = await prisma.contact.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Enrichment failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
