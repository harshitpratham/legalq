import bcrypt from "bcryptjs";
import type { User, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export type AuthRole = "admin" | "user";

export type AuthUser = {
  username: string;
  password: string;
  role: AuthRole;
  name: string;
};

export function userEmail(username: string): string {
  return `${username.toLowerCase()}@legalq.internal`;
}

export function toDbRole(role: AuthRole): UserRole {
  return role === "admin" ? "ADMIN" : "USER";
}

export function fromDbRole(role: UserRole | string): AuthRole {
  return role === "ADMIN" || role === "admin" ? "admin" : "user";
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

/** Env users used only to bootstrap an empty DB. */
export function getEnvAuthUsers(): AuthUser[] {
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

/** @deprecated Prefer getEnvAuthUsers — kept for any legacy imports */
export function getAuthUsers(): AuthUser[] {
  return getEnvAuthUsers();
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

let bootstrapPromise: Promise<void> | null = null;

/** Seed DB users from env when no active credentialed users exist. */
export async function ensureAuthUsersBootstrapped(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const credentialed = await prisma.user.count({
        where: { passwordHash: { not: null }, active: true },
      });
      if (credentialed > 0) return;

      const envUsers = getEnvAuthUsers();
      for (const u of envUsers) {
        const email = userEmail(u.username);
        const passwordHash = await hashPassword(u.password);
        await prisma.user.upsert({
          where: { email },
          update: {
            username: u.username.toLowerCase(),
            passwordHash,
            name: u.name,
            role: toDbRole(u.role),
            active: true,
          },
          create: {
            email,
            username: u.username.toLowerCase(),
            passwordHash,
            name: u.name,
            role: toDbRole(u.role),
            active: true,
          },
        });
      }
    })().catch((err) => {
      bootstrapPromise = null;
      throw err;
    });
  }
  await bootstrapPromise;
}

export type AuthenticatedDbUser = {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  role: AuthRole;
};

export async function authenticateDbUser(
  username: string,
  password: string
): Promise<AuthenticatedDbUser | null> {
  await ensureAuthUsersBootstrapped();

  const normalized = username.trim().toLowerCase();
  if (!normalized || !password) return null;

  const user = await prisma.user.findFirst({
    where: {
      active: true,
      passwordHash: { not: null },
      OR: [{ username: normalized }, { email: userEmail(normalized) }],
    },
  });

  if (!user?.passwordHash) return null;

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    username: user.username,
    role: fromDbRole(user.role),
  };
}

/** Legacy env-only lookup — used only as emergency fallback if DB auth fails before bootstrap. */
export function findAuthUser(username: string, password: string): (AuthUser & { email: string }) | null {
  const match = getEnvAuthUsers().find(
    (user) => user.username.toLowerCase() === username.toLowerCase() && user.password === password
  );
  if (!match) return null;
  return { ...match, email: userEmail(match.username) };
}

export function toPublicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    role: fromDbRole(user.role),
    active: user.active,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
