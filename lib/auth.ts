import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/db/prisma";

function getAuthCredentials() {
  return {
    username: process.env.AUTH_USERNAME ?? "admin",
    password: process.env.AUTH_PASSWORD ?? "legalq",
    displayName: process.env.AUTH_DISPLAY_NAME ?? "Legal Team",
  };
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const { username, password, displayName } = getAuthCredentials();
        if (
          credentials?.username === username &&
          credentials?.password === password
        ) {
          return {
            id: "static-legal-user",
            name: displayName,
            email: "legal-team@legalq.internal",
          };
        }
        return null;
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name ?? undefined;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
      }
      return session;
    },
  },
};

export async function getSessionUser() {
  const { getServerSession } = await import("next-auth");
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const user = await prisma.user.upsert({
    where: { email: session.user.email },
    update: {
      name: session.user.name ?? undefined,
    },
    create: {
      email: session.user.email,
      name: session.user.name ?? undefined,
    },
  });

  return user;
}
