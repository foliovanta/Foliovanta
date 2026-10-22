import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Authentication required" } },
      { status: 401 },
    );
  }

  return NextResponse.json(
    { data: { authenticated: true } },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
