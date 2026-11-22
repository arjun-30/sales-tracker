import { useEffect, useState } from "react";
import { api } from "./api";
import { gstinProblem, normalizeGstin } from "./gstin";

// What the server says about a GSTIN (server/src/lib/gstVerify.ts).
export type GstinVerdict =
  | { result: "invalid"; gstin: string; problem: string; status?: string | null; legalName?: string | null }
  | {
      result: "verified";
      gstin: string;
      status: string;
      legalName: string | null;
      tradeName: string | null;
      address: string | null;
      state: string | null;
    }
  | { result: "unchecked"; gstin: string; reason: string };

export type GstinCheck =
  | { state: "empty" }
  // Still being typed, or a typing mistake: found on the phone, no call made.
  | { state: "typing"; problem: string }
  | { state: "checking" }
  | { state: "done"; verdict: GstinVerdict };

// Checks a complete, correctly typed GSTIN on the GST portal through the
// server. Nothing is sent until the 15 characters pass the offline check.
export function useGstinCheck(input: string): GstinCheck {
  const gstin = normalizeGstin(input);
  const problem = gstin ? gstinProblem(gstin) : null;
  const [result, setResult] = useState<{ gstin: string; verdict: GstinVerdict } | null>(null);

  useEffect(() => {
    if (!gstin || problem || result?.gstin === gstin) return;
    let live = true;
    const timer = setTimeout(() => {
      api<GstinVerdict>(`/api/gstin/${gstin}`)
        .then((verdict) => live && setResult({ gstin, verdict }))
        // No connection or the server is older: the order screen goes on with
        // the offline check, and the server checks again when the order is sent.
        .catch(() =>
          live &&
          setResult({
            gstin,
            verdict: { result: "unchecked", gstin, reason: "Could not check online. The format is right." },
          })
        );
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [gstin, problem, result?.gstin]);

  if (!gstin) return { state: "empty" };
  if (problem) return { state: "typing", problem };
  if (result?.gstin !== gstin) return { state: "checking" };
  return { state: "done", verdict: result.verdict };
}
