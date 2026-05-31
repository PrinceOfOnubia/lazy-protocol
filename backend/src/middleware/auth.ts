import type { Request } from "express";
import { prisma } from "../lib/prisma.js";

export function isAdminWallet(wallet?: string | null) {
  const adminWallets = new Set((process.env.ADMIN_WALLETS || "").split(",").map((item) => item.trim()).filter(Boolean));
  return Boolean(wallet && adminWallets.has(wallet));
}

export async function requireUser(req: Request) {
  const wallet = req.headers["x-wallet"] || req.body.wallet || req.query.wallet;
  if (!wallet) {
    const error = new Error("Wallet is required.");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }

  const account = await prisma.walletAccount.findUnique({
    where: { address: String(wallet) },
    include: { user: { include: { walletAccounts: true, xAccounts: true } } },
  });
  if (!account) {
    const error = new Error("Wallet profile not found. Connect wallet first.");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  return account.user;
}

export async function requireAdmin(req: Request) {
  const user = await requireUser(req);
  const wallet = user.walletAccounts[0]?.address;
  if (!isAdminWallet(wallet)) {
    const error = new Error("Admin wallet is not allowed.");
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
  return user;
}
