import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getUnreadConversationCount, getConversationCount } from "@/lib/chat";

/**
 * `count` is what the navbar badge shows: threads with an unread message.
 * `total` is every thread the user is part of.
 *
 * The original returned the *total* count as `count`, so the badge lit up on
 * login and never cleared.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ count: 0, total: 0 });
  }

  return NextResponse.json({
    count: getUnreadConversationCount(user.id),
    total: getConversationCount(user.id),
  });
}
