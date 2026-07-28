import MiniSearch from 'minisearch';
import type { Retriever, SearchHit, IndexableDoc } from './retriever.js';

/**
 * Full-text retriever backed by minisearch.
 *
 * Notes:
 *  - The `docId` (KB-*) is preserved verbatim as the minisearch document id.
 *  - Short tokens and common stopwords are dropped so that a question with no
 *    genuine policy overlap (e.g. a product-pricing query) retrieves NOTHING,
 *    which lets the draft grounding gate refuse/escalate instead of grabbing a
 *    doc on an incidental word like "is" or "one".
 *  - Adversarial docs ARE indexed and retrievable (so the pipeline can prove it
 *    ignores their instructions) but are flagged for exclusion from citations.
 */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'you', 'your', 'are', 'was', 'were', 'this', 'that', 'with',
  'have', 'has', 'had', 'not', 'but', 'can', 'will', 'would', 'could', 'should',
  'what', 'when', 'where', 'why', 'how', 'who', 'its', 'our', 'their', 'about',
  'from', 'into', 'onto', 'out', 'off', 'via', 'per', 'any', 'all', 'one', 'two',
  'please', 'hi', 'hello', 'thanks', 'thank', 'want', 'need', 'like', 'get', 'got',
  'still', 'now', 'just', 'also', 'them', 'they', 'been', 'being', 'does', 'did',
  'until', 'typical', 'current',
]);

function processTerm(term: string): string | null {
  const t = term.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (t.length < 3) return null;
  if (STOPWORDS.has(t)) return null;
  return t;
}

export class MiniSearchRetriever implements Retriever {
  readonly name = 'minisearch';
  private readonly index: MiniSearch;
  private readonly adversarial = new Set<string>();

  constructor(docs: IndexableDoc[]) {
    this.index = new MiniSearch({
      idField: 'docId',
      fields: ['title', 'body', 'category'],
      storeFields: ['title', 'body'],
      processTerm,
      searchOptions: {
        boost: { title: 2 },
        prefix: true,
        fuzzy: 0.1,
        combineWith: 'OR',
      },
    });
    this.index.addAll(
      docs.map((d) => ({
        docId: d.docId,
        title: d.title,
        body: d.body,
        category: d.category ?? '',
      })),
    );
    for (const d of docs) if (d.isAdversarial) this.adversarial.add(d.docId);
  }

  isAdversarial(docId: string): boolean {
    return this.adversarial.has(docId);
  }

  search(query: string, k: number): SearchHit[] {
    const results = this.index.search(query);
    if (results.length === 0) return [];
    const top = results[0]!.score;
    // Trim the long tail relative to the best hit; strong domain matches survive.
    const kept = results.filter((r) => r.score >= top * 0.2).slice(0, Math.max(0, k));
    return kept.map((r) => {
      const body = String((r as unknown as { body?: string }).body ?? '');
      return {
        docId: String(r.id),
        score: Number(r.score.toFixed(4)),
        snippet: body.length > 180 ? `${body.slice(0, 180)}…` : body,
      };
    });
  }
}
