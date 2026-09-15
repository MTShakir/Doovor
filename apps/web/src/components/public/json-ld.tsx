import { serializeJsonLd, type JsonLd } from '@repo/core/structured-data';

/**
 * A page's structured data, for search engines (PUB-02). The JSON is escaped so nothing typed into
 * a profile can end the script early.
 */
export function JsonLdScript({ data }: { data: JsonLd }) {
  // React has no other way to put raw JSON in a script tag; serializeJsonLd escapes "<".
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
