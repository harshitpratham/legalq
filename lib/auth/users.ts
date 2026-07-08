export type AuthRole = "admin" | "user";

export type AuthUser = {
  username: string;
  password: string;
  role: AuthRole;
  name: string;
};

function userEmail(username: string): string {
  return `${username}@legalq.internal`;
}

function parseAuthUsersJson(raw: string): AuthUser[] | null {
  try {
    const parsed = JSON.parse(raw) as Array<Partial<AuthUser>>;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    const users: AuthUser[] = [];
    for (const entry of parsed) {
      if (
        typeof entry.username === "string" &&
        typeof entry.password === "string" &&
        (entry.role === "admin" || entry.role === "user") &&
        typeof entry.name === "string"
      ) {
        users.push({
          username: entry.username,
          password: entry.password,
          role: entry.role,
          name: entry.name,
        });
      }
    }

    return users.length > 0 ? users : null;
  } catch {
    return null;
  }
}

export function getAuthUsers(): AuthUser[] {
  const fromJson = process.env.AUTH_USERS ? parseAuthUsersJson(process.env.AUTH_USERS) : null;
  if (fromJson) return fromJson;

  const users: AuthUser[] = [
    {
      username: process.env.AUTH_USERNAME ?? "admin",
      password: process.env.AUTH_PASSWORD ?? "legalq",
      role: "admin",
      name: process.env.AUTH_DISPLAY_NAME ?? "Legal Admin",
    },
  ];

  const userUsername = process.env.AUTH_USER_USERNAME;
  const userPassword = process.env.AUTH_USER_PASSWORD;
  if (userUsername && userPassword) {
    users.push({
      username: userUsername,
      password: userPassword,
      role: "user",
      name: process.env.AUTH_USER_DISPLAY_NAME ?? "Legal Viewer",
    });
  }

  return users;
}

export function findAuthUser(username: string, password: string): (AuthUser & { email: string }) | null {
  const match = getAuthUsers().find(
    (user) => user.username === username && user.password === password
  );
  if (!match) return null;

  return {
    ...match,
    email: userEmail(match.username),
  };
}

export function toDbRole(role: AuthRole): "ADMIN" | "USER" {
  return role === "admin" ? "ADMIN" : "USER";
}
