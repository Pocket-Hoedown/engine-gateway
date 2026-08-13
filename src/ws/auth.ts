async function digest(value: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

export async function hasBearerToken(
  header: string | undefined,
  expected: string,
): Promise<boolean> {
  const match = /^Bearer ([^\s]+)$/.exec(header ?? "");
  const [actual, target] = await Promise.all([digest(match?.[1] ?? ""), digest(expected)]);
  let difference = 0;
  for (let index = 0; index < actual.length; index++) difference |= actual[index] ^ target[index];
  return match !== null && expected.length > 0 && difference === 0;
}
