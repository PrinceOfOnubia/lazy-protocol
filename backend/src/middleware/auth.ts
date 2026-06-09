import type { Request } from "express";
import { createPublicKey, verify } from "crypto";
import { prisma } from "../lib/prisma.js";

export function isAdminWallet(wallet?: string | null) {
  const adminWallets = new Set((process.env.ADMIN_WALLETS || "").split(",").map((item) => item.trim()).filter(Boolean));
  return Boolean(wallet && adminWallets.has(wallet));
}

function headerValue(value: Request["headers"][string]) {
  return Array.isArray(value) ? value[0] : value ? String(value) : "";
}

function adminError(message: string, status = 401) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

function ed25519PublicKeyFromSolanaWallet(wallet: string) {
  const raw = Buffer.from(bs58Decode(wallet));
  if (raw.length !== 32) throw adminError("Invalid admin wallet.", 400);
  const prefix = Buffer.from("302a300506032b6570032100", "hex");
  return createPublicKey({ key: Buffer.concat([prefix, raw]), format: "der", type: "spki" });
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function bs58Decode(value: string) {
  const bytes = [0];
  for (const char of value) {
    const carryStart = BASE58_ALPHABET.indexOf(char);
    if (carryStart < 0) throw adminError("Invalid admin wallet.", 400);
    let carry = carryStart;
    for (let i = 0; i < bytes.length; i += 1) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of value) {
    if (char !== "1") break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

function verifyAdminSignature(req: Request, wallet: string) {
  const message = headerValue(req.headers["x-admin-message"]);
  const signature = headerValue(req.headers["x-admin-signature"]);
  if (!message || !signature) throw adminError("Admin wallet signature is required.");
  if (!message.includes(`Wallet: ${wallet}`)) throw adminError("Admin signature wallet mismatch.", 403);
  const timestampMatch = message.match(/Timestamp:\s*([^|]+)$/m) || message.match(/Timestamp:\s*([^|]+)/);
  const timestamp = timestampMatch ? Date.parse(timestampMatch[1]) : NaN;
  if (!Number.isFinite(timestamp)) throw adminError("Admin signature timestamp is invalid.", 400);
  if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) throw adminError("Admin signature expired.");
  const valid = verify(null, Buffer.from(message), ed25519PublicKeyFromSolanaWallet(wallet), Buffer.from(signature, "base64"));
  if (!valid) throw adminError("Admin wallet signature is invalid.", 403);
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
  const wallet = String(req.headers["x-wallet"] || "");
  if (!isAdminWallet(wallet)) {
    const error = new Error("Admin wallet is not allowed.");
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
  if (!user.walletAccounts.some((account) => account.address === wallet)) {
    throw adminError("Admin wallet profile mismatch.", 403);
  }
  verifyAdminSignature(req, wallet);
  return user;
}
