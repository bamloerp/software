import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const { email, password, name, role = "ADMIN" } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: "email and password required" }, { status: 400 });
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { name, role, passwordHash },
    create: { email: email.toLowerCase(), name, role, passwordHash },
  });
  return NextResponse.json({ id: user.id, email: user.email, role: user.role });
}
