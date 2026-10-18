import { APIError } from "better-auth/api";
import type { BetterAuthOptions } from "better-auth";
import {
  isValidStoredProfileImage,
  PROFILE_IMAGE_ERROR_MESSAGE,
} from "./profile-image";

function validateProfile<T extends { name?: string; image?: unknown }>(user: T): T {
  const data = { ...user };
  if (typeof data.name === "string") {
    const name = data.name.normalize("NFKC").trim();
    if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) {
      throw new APIError("BAD_REQUEST", {
        message: "Enter a valid name of 80 characters or fewer.",
      });
    }
    data.name = name;
  }
  if (data.image !== undefined && !isValidStoredProfileImage(data.image)) {
    throw new APIError("BAD_REQUEST", { message: PROFILE_IMAGE_ERROR_MESSAGE });
  }
  return data;
}

/** Apply the same checks to every session-creation path, including 2FA. */
export function createAuthSecurityHooks(
  isSuspended: (userId: string) => Promise<boolean>,
) {
  return {
    user: {
      create: { before: async user => ({ data: validateProfile(user) }) },
      update: { before: async user => ({ data: validateProfile(user) }) },
    },
    session: {
      create: {
        before: async session => {
          if (await isSuspended(session.userId)) {
            throw new APIError("FORBIDDEN", {
              code: "ACCOUNT_SUSPENDED",
              message: "This account is suspended. Contact TCGHaven support for help.",
            });
          }
          return { data: session };
        },
      },
    },
  } satisfies NonNullable<BetterAuthOptions["databaseHooks"]>;
}
