"use server";

import { cookies } from "next/headers";

export async function setAdminCookie() {
  const cookieStore = cookies();
  cookieStore.set("adminAuth", "true", {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7, // 1 week
  });
}

export async function logoutAdmin() {
  const cookieStore = cookies();
  cookieStore.delete("adminAuth");
}
