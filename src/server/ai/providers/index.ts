import type { AiProvider, ProviderId } from "@/contracts/ai";
import { getProviderConfig } from "@/server/config/models";

const instances = new Map<ProviderId, AiProvider>();

export async function getProvider(id: ProviderId) {
  const existing = instances.get(id);
  if (existing) return existing;
  const config = getProviderConfig(id);
  if (!config) throw new Error(`Unknown provider: ${id}`);
  const provider = await config.loadAdapter();
  instances.set(id, provider);
  return provider;
}

