import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export interface DraftGenerationInput {
  contactName: string;
  contactEmail?: string;
  contactCompany?: string;
  contactTitle?: string;
  linkedinData?: Record<string, unknown>;
  emailHistory?: { from: string; subject: string; body: string; date: string }[];
  templateSubject: string;
  templateInstructions: string;
  campaignContext?: string;
}

export interface GeneratedDraft {
  subject: string;
  body: string;
}

export async function generateEmailDraft(
  input: DraftGenerationInput
): Promise<GeneratedDraft> {
  const systemPrompt = `You are an expert email copywriter helping compose personalized outreach emails.
Write professional, warm, and concise emails. Personalize based on the contact's background.
Always return a JSON object with "subject" and "body" fields.
The body should be in HTML format with <p> tags for paragraphs and <br> for line breaks.`;

  const contextParts: string[] = [];

  contextParts.push(`## Contact Information
- Name: ${input.contactName}
- Email: ${input.contactEmail ?? "Unknown"}
- Company: ${input.contactCompany ?? "Unknown"}
- Title: ${input.contactTitle ?? "Unknown"}`);

  if (input.linkedinData) {
    const ld = input.linkedinData;
    contextParts.push(`## LinkedIn Profile
- Headline: ${ld.headline ?? "N/A"}
- Summary: ${ld.summary ?? "N/A"}
- Current experiences: ${JSON.stringify(
      (ld.experiences as Record<string, unknown>[])
        ?.filter(
          (e: Record<string, unknown>) => !e.ends_at
        )
        ?.slice(0, 3) ?? [],
      null,
      2
    )}`);
  }

  if (input.emailHistory?.length) {
    contextParts.push(`## Email History (most recent first)
${input.emailHistory
  .slice(0, 5)
  .map((e) => `- [${e.date}] From: ${e.from} | Subject: ${e.subject}\n  ${e.body.slice(0, 200)}...`)
  .join("\n")}`);
  }

  if (input.campaignContext) {
    contextParts.push(`## Campaign Context\n${input.campaignContext}`);
  }

  contextParts.push(`## Template Instructions
Subject template: ${input.templateSubject}
Instructions: ${input.templateInstructions}`);

  const userMessage = `Generate a personalized email for this contact based on the template instructions.

${contextParts.join("\n\n")}

Return ONLY a JSON object with "subject" and "body" fields. No other text.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    messages: [{ role: "user", content: userMessage }],
    system: systemPrompt,
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Parse the JSON from Claude's response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse AI response as JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    subject: parsed.subject,
    body: parsed.body,
  };
}
