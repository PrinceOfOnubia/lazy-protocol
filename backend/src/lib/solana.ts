import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import type { RewardCurrency } from "@prisma/client";
import { prisma } from "./prisma.js";

const rpcUrl = process.env.SOLANA_RPC_URL || process.env.VITE_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const connection = new Connection(rpcUrl, "confirmed");
const DEFAULT_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function asError(message: string, status = 400) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

export function rewardWallet() {
  const wallet = process.env.REWARD_WALLET;
  if (!wallet) {
    throw asError("Reward wallet is unavailable.", 500);
  }
  return wallet;
}

export function usdcMint() {
  return process.env.USDC_MINT || DEFAULT_USDC_MINT;
}

function rawTokenAmount(amount: number, decimals = 6) {
  return BigInt(Math.round(amount * 10 ** decimals));
}

function parsedInstructions(tx: NonNullable<Awaited<ReturnType<typeof connection.getParsedTransaction>>>) {
  const outer = tx.transaction.message.instructions;
  const inner = (tx.meta?.innerInstructions || []).flatMap((group) => group.instructions);
  return [...outer, ...inner];
}

async function verifySolTransfer(input: { tx: NonNullable<Awaited<ReturnType<typeof connection.getParsedTransaction>>>; fromWallet: string; toWallet: string; amount: number }) {
  const amountLamports = Math.round(input.amount * LAMPORTS_PER_SOL);
  const keys = input.tx.transaction.message.accountKeys.map((key) => key.pubkey.toBase58());
  const fromIndex = keys.indexOf(new PublicKey(input.fromWallet).toBase58());
  const toIndex = keys.indexOf(new PublicKey(input.toWallet).toBase58());
  if (fromIndex === -1 || toIndex === -1) throw asError("Funding transaction sender or reward wallet does not match.");
  const senderDebit = input.tx.meta!.preBalances[fromIndex] - input.tx.meta!.postBalances[fromIndex];
  const recipientCredit = input.tx.meta!.postBalances[toIndex] - input.tx.meta!.preBalances[toIndex];
  if (senderDebit < amountLamports || recipientCredit < amountLamports) throw asError("Funding transaction amount is too low.");
}

async function verifyUsdcTransfer(input: { tx: NonNullable<Awaited<ReturnType<typeof connection.getParsedTransaction>>>; fromWallet: string; toWallet: string; amount: number }) {
  const mint = usdcMint();
  const requiredRaw = rawTokenAmount(input.amount);
  for (const instruction of parsedInstructions(input.tx)) {
    if (!("parsed" in instruction) || instruction.program !== "spl-token") continue;
    const parsed = instruction.parsed as { type?: string; info?: Record<string, unknown> };
    if (!["transfer", "transferChecked"].includes(String(parsed.type))) continue;
    const info = parsed.info || {};
    const authority = String(info.authority || info.owner || "");
    const destination = String(info.destination || "");
    const instructionMint = info.mint ? String(info.mint) : "";
    const tokenAmount = info.tokenAmount as { amount?: string; decimals?: number } | undefined;
    const rawAmount = BigInt(String(tokenAmount?.amount || info.amount || "0"));
    if (authority !== input.fromWallet || rawAmount < requiredRaw) continue;
    const destinationAccount = await connection.getParsedAccountInfo(new PublicKey(destination), "confirmed");
    const data = destinationAccount.value?.data;
    if (!data || typeof data === "string" || !("parsed" in data)) continue;
    const tokenInfo = data.parsed.info as { owner?: string; mint?: string };
    if (tokenInfo.owner === input.toWallet && tokenInfo.mint === mint && (!instructionMint || instructionMint === mint)) return;
  }
  throw asError("USDC funding transaction could not be verified.");
}

export async function verifyFundingTx(input: { txHash: string; fromWallet: string; toWallet?: string; amount: number; currency: RewardCurrency }) {
  const toWallet = input.toWallet || rewardWallet();
  if (!input.txHash) throw asError("Funding transaction hash is required.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw asError("Funding amount must be positive.");
  const existing = await prisma.fundingTransaction.findUnique({ where: { txHash: input.txHash } });
  if (existing) throw asError("This transaction has already been used.");
  const tx = await connection.getParsedTransaction(input.txHash, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  if (!tx?.meta) throw asError("Funding transaction was not found or is not confirmed.");
  if (tx.meta.err) throw asError("Funding transaction failed onchain.");
  if (input.currency === "SOL") await verifySolTransfer({ tx, fromWallet: input.fromWallet, toWallet, amount: input.amount });
  else await verifyUsdcTransfer({ tx, fromWallet: input.fromWallet, toWallet, amount: input.amount });
  return { toWallet, amount: input.amount, currency: input.currency };
}
