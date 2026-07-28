export interface SearchHit {
  docId: string;
  score: number;
  snippet: string;
}

export interface IndexableDoc {
  docId: string;
  title: string;
  body: string;
  category?: string | null;
  isAdversarial?: boolean;
}

/**
 * Retrieval boundary (build-prompt §1.2). minisearch is one implementation;
 * a vector/hybrid store could implement the same interface without touching
 * the draft pipeline.
 */
export interface Retriever {
  readonly name: string;
  search(query: string, k: number): SearchHit[];
}
