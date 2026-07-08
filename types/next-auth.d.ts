import "next-auth";
import "next-auth/jwt";
import type { AuthRole } from "@/lib/auth/users";

declare module "next-auth" {
  interface User {
    role: AuthRole;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: AuthRole;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    name?: string;
    role?: AuthRole;
  }
}
