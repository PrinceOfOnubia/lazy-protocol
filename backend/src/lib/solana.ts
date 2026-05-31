import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { prisma } from "./prisma.js";

const rpcUrl = process.env.SOLANA_RPC_URL || process.env.VITE_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const connection = new Connection(rpcUrl, "confirmed");

export function rewardWallet() {
  const wallet = process.env.REWARD_WALLET;
  if (!wallet) {
    const error = new Error("Reward wallet is unavailable.");
    (error as Error & { status?: number }).status = 500;
    throw error;
  }
  return wallet;
}

export async function verifyFundingTx(input: { txHash: string; fromWallet: string; toWallet?: string; amountSol: number }) {
  const toWallet = input.toWallet || rewardWallet();
  const amountLamports = Math.round(input.amountSol * LAMPORTS_PER_SOL);
  if (!input.txHash) {
    const error = new Error("Funding transaction hash is required.");
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
  const existing = await prisma.fundingTransaction.findUnique({ where: { txHash: input.txHash } });
  if (existing) {
    const error = new Error("This transaction has already been used.");
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
  const tx = await connection.getParsedTransaction(input.txHash, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  if (!tx?.meta) {
    const error = new Error("Funding transaction was not found or is not confirmed.");
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
  const keys = tx.transaction.message.accountKeys.map((key) => key.pubkey.toBase58());
  const fromIndex = keys.indexOf(new PublicKey(input.fromWallet).toBase58());
  const toIndex = keys.indexOf(new PublicKey(toWallet).toBase58());
  if (fromIndex === -1 || toIndex === -1) {
    const error = new Error("Funding transaction sender or reward wallet does not match.");
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
  const senderDebit = tx.meta.preBalances[fromIndex] - tx.meta.postBalances[fromIndex];
  const recipientCredit = tx.meta.postBalances[toIndex] - tx.meta.preBalances[toIndex];
  if (senderDebit < amountLamports || recipientCredit < amountLamports) {
    const error = new Error("Funding transaction amount is too low.");
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
  return { toWallet, amountSol: input.amountSol };
}
