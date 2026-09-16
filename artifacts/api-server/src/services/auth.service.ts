import { randomUUID } from "node:crypto";

export type RegisterInput = {
  email: string;
  password: string;
  username: string;
};

export type AuthSession = {
  userId: string;
  sessionId: string;
  accessToken: string;
  refreshToken: string;
};

/** Authentication provider boundary. Replace the provider calls here with the
 * managed auth implementation; route code remains provider-agnostic. */
export async function registerUser(input: RegisterInput): Promise<AuthSession> {
  if (!input.email || !input.password || !input.username) {
    throw new Error("invalid_registration");
  }

  const userId = randomUUID();
  return {
    userId,
    sessionId: randomUUID(),
    accessToken: "",
    refreshToken: "",
  };
}

export async function signIn(
  identifier: string,
  _password: string,
): Promise<AuthSession> {
  if (!identifier) throw new Error("invalid_credentials");
  return {
    userId: "",
    sessionId: randomUUID(),
    accessToken: "",
    refreshToken: "",
  };
}

export async function signOut(_scope: "current" | "all"): Promise<void> {
  return undefined;
}
