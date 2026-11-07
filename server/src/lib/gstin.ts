// GSTIN checks that need no government API: the 15-character layout
// (2-digit state code, the holder's PAN, entity number, "Z", check character)
// and the check character itself, which catches a mistyped digit or two
// swapped characters. Whether the number is active on the GST portal needs a
// paid GSP API and is not checked here.

const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LAYOUT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// State codes in use: 01-38 (Jammu & Kashmir to Ladakh), 97 other territory,
// 99 centre jurisdiction.
function validStateCode(code: number): boolean {
  return (code >= 1 && code <= 38) || code === 97 || code === 99;
}

// The GSTN check character: a weighted mod-36 sum of the first 14 characters.
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = CHARSET.indexOf(first14[i]);
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARSET[(36 - (sum % 36)) % 36];
}

export function normalizeGstin(input: string): string {
  return input.replace(/\s/g, "").toUpperCase();
}

// null when valid, otherwise what is wrong, in words for the salesperson.
export function gstinProblem(input: string): string | null {
  const g = normalizeGstin(input);
  if (g.length !== 15) return "A GSTIN has 15 characters";
  if (!LAYOUT.test(g)) return "That is not a GSTIN: check the letters and numbers";
  if (!validStateCode(Number(g.slice(0, 2)))) return "The first two digits are not a state code";
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) return "That GSTIN has a typing mistake: check it again";
  return null;
}

// Tamil Nadu is 33; the state is shown next to a checked number.
export function gstinStateCode(gstin: string): string {
  return normalizeGstin(gstin).slice(0, 2);
}
