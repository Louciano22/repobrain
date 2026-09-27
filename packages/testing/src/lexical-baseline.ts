/** Dependency-free binary token overlap: a deliberately simple reference, not a production search engine. */
export function lexicalBaseline(files: Record<string, string>, query: string): string[] {
  const tokens = (value: string) => new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
  const queryTokens = tokens(query);
  return Object.entries(files)
    .map(([filePath, content]) => ({
      filePath,
      overlap: [...queryTokens].filter((term) => tokens(`${filePath} ${content}`).has(term)).length
    }))
    .filter((entry) => entry.overlap > 0)
    .sort((left, right) => right.overlap - left.overlap || left.filePath.localeCompare(right.filePath, "en"))
    .map((entry) => entry.filePath);
}
