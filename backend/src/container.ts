import { env } from './config/env.js';
import { getDb } from './db/client.js';
import { documents } from './db/schema.js';
import type { LLMProvider } from './llm/provider.js';
import { MockProvider } from './llm/mock.provider.js';
import { LangChainProvider } from './llm/langchain.provider.js';
import { MiniSearchRetriever } from './retrieval/minisearch.retriever.js';
import type { Retriever } from './retrieval/retriever.js';

/**
 * Composition root. Everything depends on the LLMProvider / Retriever
 * interfaces; only here do we choose concrete implementations. Tests call
 * setProvider()/setRetriever() to inject the MockProvider and a fixed index.
 */

let _provider: LLMProvider | null = null;
let _retriever: MiniSearchRetriever | null = null;

/** True only when a real LLM endpoint is configured (an API key is present). */
export function isLlmConfigured(): boolean {
  return env.OPENAI_API_KEY.trim().length > 0;
}

/**
 * Choose a concrete provider. LangChain is used only when it's both requested
 * AND configured (a key is present); otherwise we fall back to the deterministic
 * mock so the app always works — missing/empty LLM env never breaks a run.
 */
export function makeProvider(preferLangchain: boolean): LLMProvider {
  if (preferLangchain && !isLlmConfigured()) {
    // eslint-disable-next-line no-console
    console.warn(
      '[TrustDesk] LLM_PROVIDER=langchain but OPENAI_API_KEY is not set — falling back to the deterministic mock provider.',
    );
    return new MockProvider();
  }
  return preferLangchain ? new LangChainProvider() : new MockProvider();
}

export function getProvider(): LLMProvider {
  if (!_provider) {
    _provider = makeProvider(env.LLM_PROVIDER === 'langchain');
  }
  return _provider;
}

export function setProvider(p: LLMProvider): void {
  _provider = p;
}

/** Build (and cache) the retriever over the current `documents` rows. */
export function getRetriever(): Retriever {
  if (!_retriever) _retriever = buildRetrieverFromDb();
  return _retriever;
}

export function getMiniSearchRetriever(): MiniSearchRetriever {
  getRetriever();
  return _retriever!;
}

export function setRetriever(r: MiniSearchRetriever): void {
  _retriever = r;
}

/** Rebuild the index — call after (re)loading documents. */
export function rebuildRetriever(): Retriever {
  _retriever = buildRetrieverFromDb();
  return _retriever;
}

function buildRetrieverFromDb(): MiniSearchRetriever {
  const rows = getDb().select().from(documents).all();
  return new MiniSearchRetriever(
    rows.map((d) => ({
      docId: d.docId,
      title: d.title,
      body: d.body,
      category: d.category,
      isAdversarial: d.isAdversarial,
    })),
  );
}
