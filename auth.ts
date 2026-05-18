//@ts-nocheck
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth.config';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import {prisma} from "@/lib/db";
 

 
export const { auth,
   signIn,
    signOut,
    handlers: { GET, POST }, 
   } = NextAuth({
  ...authConfig,
  secret: process.env.NEXTAUTH_SECRET!,
  session: { strategy: 'jwt', maxAge: 300, updateAge: 60 },
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsedCredentials = z
          .object({ email: z.string().email(), password: z.string().min(6) })
          .safeParse(credentials); 
 
        if (parsedCredentials.success) {
          const { email, password } = parsedCredentials.data;
          const user = await prisma.user.findUnique({ where: { email } });
          if (!user) return null;

          // Check if account is disabled
          if (user.disabled) return null;

          // Check if account is locked
          if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
            return null;
          }

          const passwordsMatch = await bcrypt.compare(password, user.passwordHash ?? '');
 
          if (!passwordsMatch) {
            // Increment failed attempts
            const attempts = (user.failedLoginAttempts ?? 0) + 1;
            const updateData: { failedLoginAttempts: number; lockedUntil?: Date } = {
              failedLoginAttempts: attempts,
            };
            // Lock after 3 consecutive failures (30 min lockout)
            if (attempts >= 3) {
              updateData.lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
            }
            await prisma.user.update({
              where: { id: user.id },
              data: updateData,
            });
            return null;
          }

          // Successful login — reset failed attempts & record login time
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: 0,
              lockedUntil: null,
              lastLoginAt: new Date(),
            },
          });

          return user;
        }

        console.log('Invalid credentials');
        return null;
      },
    }),
  ],
});
