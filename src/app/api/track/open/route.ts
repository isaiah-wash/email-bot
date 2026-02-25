import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 1x1 transparent GIF
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(req: NextRequest) {
  try {
    const draftId = req.nextUrl.searchParams.get("draftId");
    if (draftId) {
      await prisma.emailDraft.updateMany({
        where: { id: draftId, openedAt: null },
        data: { openedAt: new Date() },
      });
    }
  } catch {
    // Silent on errors — email clients must always receive a valid image
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}
