import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/db/prisma";
import { authenticateDbUser, fromDbRole } from "@/lib/auth/users";

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
        const match = await authenticateDbUser(
          credentials?.username ?? "",
          credentials?.password ?? ""
        );
        if (!match) return null;

        return {
          id: match.id,
          name: match.name,
          email: match.email,
          role: match.role,
        };
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
        token.role = user.role;
      } else if (token.id) {
        // Refresh role/active from DB so admin role changes take effect
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { role: true, active: true, name: true, email: true },
        });
        if (!dbUser || !dbUser.active) {
          token.role = undefined;
          token.id = undefined;
        } else {
          token.role = fromDbRole(dbUser.role);
          token.name = dbUser.name ?? undefined;
          token.email = dbUser.email;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id && token.role) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.role = token.role as "admin" | "user";
      }
      return session;
    },
  },
};

export async function getSessionUser() {
  const { getServerSession } = await import("next-auth");
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const user = await prisma.user.findFirst({
    where: { id: session.user.id, active: true },
  });
  return user;
}
