export interface ChunkOptions {
  maxWords: number;
  overlapWords: number;
}

export function chunkText(text: string, options: ChunkOptions = { maxWords: 180, overlapWords: 30 }): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  if (options.overlapWords >= options.maxWords) {
    throw new Error("overlapWords must be smaller than maxWords");
  }

  const chunks: string[] = [];
  for (let start = 0; start < words.length; start += options.maxWords - options.overlapWords) {
    chunks.push(words.slice(start, start + options.maxWords).join(" "));
    if (start + options.maxWords >= words.length) {
      break;
    }
  }
  return chunks;
}
