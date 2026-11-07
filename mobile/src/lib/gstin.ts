// Same GSTIN check as the server (server/src/lib/gstin.ts), so a typing
// mistake shows on the phone before the order is sent.

const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LAYOUT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function checkChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = CHARSET.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARSET[(36 - (sum % 36)) % 36];
}

export const normalizeGstin = (input: string) => input.replace(/[^0-9A-Za-z]/g, "").toUpperCase().slice(0, 15);

// null when valid (or empty), otherwise what to fix.
export function gstinProblem(input: string): string | null {
  const g = normalizeGstin(input);
  if (!g) return null;
  if (g.length !== 15) return `A GSTIN has 15 characters (${g.length} typed)`;
  const state = Number(g.slice(0, 2));
  if (!LAYOUT.test(g)) return "That is not a GSTIN: check the letters and numbers";
  if (!((state >= 1 && state <= 38) || state === 97 || state === 99)) return "The first two digits are not a state code";
  if (checkChar(g.slice(0, 14)) !== g[14]) return "That GSTIN has a typing mistake: check it again";
  return null;
}
