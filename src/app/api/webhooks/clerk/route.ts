import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const noStoreHeaders = {
  "Cache-Control": "no-store",
};

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHENTICATED",
          message: "Authentication required",
        },
      },
      {
        status: 401,
        headers: noStoreHeaders,
      },
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: {
        clerkUserId: userId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        role: true,
        status: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          error: {
            code: "USER_NOT_SYNCED",
            message: "User account is being synchronized",
          },
        },
        {
          status: 404,
          headers: noStoreHeaders,
        },
      );
    }

    if (user.status !== "ACTIVE") {
      const suspended = user.status === "SUSPENDED";

      return NextResponse.json(
        {
          error: {
            code: suspended ? "ACCOUNT_SUSPENDED" : "ACCOUNT_UNAVAILABLE",
            message: suspended
              ? "Your account is suspended"
              : "Your account is unavailable",
          },
        },
        {
          status: 403,
          headers: noStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      {
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
          role: user.role,
        },
      },
      {
        status: 200,
        headers: noStoreHeaders,
      },
    );
  } catch (error) {
    console.error("Failed to fetch authenticated user", error);

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Unable to retrieve user account",
        },
      },
      {
        status: 500,
        headers: noStoreHeaders,
      },
    );
  }
}