import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthenticatedUser, unauthorized } from "@/lib/session";
import { CHAT_TOOLS, executeTool } from "@/lib/chat-tools";

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are the EmailBotemis assistant — a helpful AI that controls an email outreach application. You can manage contacts, email templates, campaigns, drafts, and send emails via Gmail.

When the user asks you to do something, use the available tools to carry out the action. After performing actions, summarize what you did clearly.

Key concepts:
- **Contacts** have email, LinkedIn URL, name, company, title. They can be "enriched" from LinkedIn to fill in company/title.
- **Templates** define how emails are generated — they have a subject template and body instructions for the AI.
- **Campaigns** group contacts together with a template. You can generate email drafts for all contacts in a campaign.
- **Drafts** are AI-generated emails. They go through statuses: GENERATED → EDITED → APPROVED → SENT.
- **Sending** requires a draft to be approved first, and the contact must have an email address.

When listing items, present them in a readable format. When creating or modifying items, confirm what was done.
If a multi-step action is requested (like "create a campaign and add all my enriched contacts"), break it into steps using the tools.`;

const MAX_TURNS = 10;

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { messages } = await req.json();

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(
      JSON.stringify({ error: "messages array is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      }

      try {
        // Build conversation for Anthropic
        const conversation: Anthropic.MessageParam[] = messages.map(
          (m: { role: string; content: string }) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })
        );

        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            tools: CHAT_TOOLS,
            messages: conversation,
          });

          // Process response content blocks
          let hasToolUse = false;
          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const block of response.content) {
            if (block.type === "text") {
              send({ type: "text", text: block.text });
            } else if (block.type === "tool_use") {
              hasToolUse = true;
              send({
                type: "tool_call",
                tool: block.name,
                input: block.input,
              });

              const result = await executeTool(
                block.name,
                block.input as Record<string, unknown>,
                user.id
              );

              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: result,
              });
            }
          }

          if (!hasToolUse) {
            // No tool calls — we're done
            send({ type: "done" });
            break;
          }

          // Append assistant response and tool results to conversation
          conversation.push({
            role: "assistant",
            content: response.content,
          });
          conversation.push({
            role: "user",
            content: toolResults,
          });

          // If this is the last turn, signal done
          if (turn === MAX_TURNS - 1) {
            send({ type: "done" });
          }
        }
      } catch (error) {
        send({
          type: "error",
          error:
            error instanceof Error ? error.message : "An error occurred",
        });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}
