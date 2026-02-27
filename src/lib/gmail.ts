import { google } from "googleapis";
import { prisma } from "./prisma";

async function getGmailClient(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });

  if (!account?.access_token) {
    throw new Error("No Google account found. Please sign in again.");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET
  );

  // Check if token needs refresh
  const now = Math.floor(Date.now() / 1000);
  if (account.expires_at && account.expires_at < now && account.refresh_token) {
    oauth2Client.setCredentials({ refresh_token: account.refresh_token });
    const { credentials } = await oauth2Client.refreshAccessToken();

    await prisma.account.update({
      where: { id: account.id },
      data: {
        access_token: credentials.access_token,
        expires_at: credentials.expiry_date
          ? Math.floor(credentials.expiry_date / 1000)
          : undefined,
        refresh_token: credentials.refresh_token ?? account.refresh_token,
      },
    });

    oauth2Client.setCredentials(credentials);
  } else {
    oauth2Client.setCredentials({ access_token: account.access_token });
  }

  return google.gmail({ version: "v1", auth: oauth2Client });
}

export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
}

export interface GmailThread {
  id: string;
  subject: string;
  snippet: string;
  messages: GmailMessage[];
}

function decodeBase64(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function getHeader(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function extractBody(payload: Record<string, unknown>): string {
  if (
    payload.mimeType === "text/plain" &&
    (payload.body as Record<string, unknown>)?.data
  ) {
    return decodeBase64((payload.body as Record<string, string>).data);
  }

  const parts = payload.parts as Record<string, unknown>[] | undefined;
  if (parts) {
    for (const part of parts) {
      if (
        part.mimeType === "text/plain" &&
        (part.body as Record<string, unknown>)?.data
      ) {
        return decodeBase64((part.body as Record<string, string>).data);
      }
    }
    // Fallback to HTML
    for (const part of parts) {
      if (
        part.mimeType === "text/html" &&
        (part.body as Record<string, unknown>)?.data
      ) {
        return decodeBase64((part.body as Record<string, string>).data);
      }
    }
  }

  return "";
}

export async function fetchThreadsForContact(
  userId: string,
  contactEmail: string,
  maxResults = 10
): Promise<GmailThread[]> {
  const gmail = await getGmailClient(userId);

  const listRes = await gmail.users.threads.list({
    userId: "me",
    q: contactEmail,
    maxResults,
  });

  const threads: GmailThread[] = [];

  for (const thread of listRes.data.threads ?? []) {
    const threadRes = await gmail.users.threads.get({
      userId: "me",
      id: thread.id!,
      format: "full",
    });

    const messages: GmailMessage[] = (threadRes.data.messages ?? []).map(
      (msg) => {
        const headers = (msg.payload?.headers ?? []) as {
          name: string;
          value: string;
        }[];
        return {
          id: msg.id!,
          threadId: msg.threadId!,
          from: getHeader(headers, "From"),
          to: getHeader(headers, "To"),
          subject: getHeader(headers, "Subject"),
          date: getHeader(headers, "Date"),
          snippet: msg.snippet ?? "",
          body: extractBody(msg.payload as Record<string, unknown>),
        };
      }
    );

    threads.push({
      id: thread.id!,
      subject: messages[0]?.subject ?? "",
      snippet: thread.snippet ?? "",
      messages,
    });
  }

  return threads;
}

export async function sendEmail(
  userId: string,
  to: string,
  subject: string,
  body: string,
  threadId?: string
): Promise<{ messageId: string; threadId: string }> {
  const gmail = await getGmailClient(userId);

  // Get user's email for From header
  const profile = await gmail.users.getProfile({ userId: "me" });
  const fromEmail = profile.data.emailAddress;

  const headers = [
    `From: ${fromEmail}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/html; charset=utf-8`,
  ];

  if (threadId) {
    headers.push(`In-Reply-To: ${threadId}`);
    headers.push(`References: ${threadId}`);
  }

  const message = headers.join("\r\n") + "\r\n\r\n" + body;

  const encodedMessage = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage,
      threadId: threadId || undefined,
    },
  });

  return {
    messageId: res.data.id!,
    threadId: res.data.threadId!,
  };
}
