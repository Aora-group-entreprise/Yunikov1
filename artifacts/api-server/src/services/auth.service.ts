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

/**
 * Managed authentication boundary.
 *
 * Authentication is intentionally not faked here: until the managed auth
 * provider is configured, these operations fail closed instead of returning
 * synthetic users or empty tokens.
 */
export async function registerUser(
  _input: RegisterInput,
): Promise<AuthSession> {
  throw new Error("managed_auth_not_configured");
}

export async function signIn(
  _identifier: string,
  _password: string,
): Promise<AuthSession> {
  throw new Error("managed_auth_not_configured");
}

export async function signOut(
  _scope: "current" | "all",
): Promise<void> {
  throw new Error("managed_auth_not_configured");
}
