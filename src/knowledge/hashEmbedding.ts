const VECTOR_SIZE = 64;

export function hashEmbedding(text: string): number[] {
  const vector = new Array<number>(VECTOR_SIZE).fill(0);
  for (const token of tokenize(text)) {
    const index = Math.abs(hash(token)) % VECTOR_SIZE;
    vector[index] += 1;
  }
  return normalize(vector);
}

export function tokenize(text: string): string[] {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function hash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) | 0;
  }
  return result;
}

function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0));
  if (magnitude === 0) {
    return vector;
  }
  return vector.map((item) => item / magnitude);
}
