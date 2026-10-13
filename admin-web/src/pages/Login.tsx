import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle2, MapPinned, Receipt, TrendingUp } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Input, Label } from "../components/ui/Input";

const highlights = [
  { icon: MapPinned, title: "Live field map", text: "See every on-duty salesperson across Tamil Nadu in real time." },
  { icon: Receipt, title: "Orders in one place", text: "Confirm, deliver or cancel orders as they come in from the field." },
  { icon: TrendingUp, title: "Sales insight", text: "Track sales, visits and district coverage day by day." },
];

const PHONE_LENGTH = 10;

// Keeps a mobile number to 10 digits. A pasted "+91 98765 43210" or "098765 43210"
// loses its country/trunk prefix; any other extra digit typed past 10 is ignored.
function toMobileDigits(text: string) {
  let digits = text.replace(/\D/g, "");
  if ((digits.length === 12 && digits.startsWith("91")) || (digits.length === 11 && digits.startsWith("0"))) {
    digits = digits.slice(-PHONE_LENGTH);
  }
  return digits.slice(0, PHONE_LENGTH);
}

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const phoneComplete = phone.length === PHONE_LENGTH;

  if (user) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(phone, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden border-r border-sand-200 bg-sand-100 p-12 text-sand-900 lg:flex lg:flex-col lg:justify-between">
        <div>
          <img src="/roalux-logo.png" alt="Roalux" className="h-14 w-auto" />
          <div className="mt-4 text-[13px] font-medium uppercase tracking-[0.2em] text-sand-500">Sales Console</div>
        </div>
        <div className="space-y-10">
          <h1 className="max-w-md text-[34px] font-semibold leading-tight tracking-tight">
            Your field sales team, on one screen.
          </h1>
          <ul className="max-w-md divide-y divide-sand-200 border-y border-sand-200">
            {highlights.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4 py-4">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                <div>
                  <div className="font-medium">{title}</div>
                  <div className="mt-0.5 text-sm text-sand-700">{text}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="text-xs text-sand-500">Admin access only</div>
      </div>

      <div className="flex items-center justify-center bg-white px-4 py-12">
        <div className="w-full max-w-sm">
          <img src="/roalux-logo.png" alt="Roalux" className="mb-10 h-12 w-auto lg:hidden" />
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">Sign in</h2>
          <p className="mt-1 text-sm text-neutral-500">Use your admin mobile number and password.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <Label>Mobile number</Label>
                <span
                  className={`text-xs font-semibold tabular-nums ${phoneComplete ? "text-emerald-600" : "text-neutral-400"}`}
                >
                  {phone.length}/{PHONE_LENGTH}
                </span>
              </div>
              <div className="flex h-10 overflow-hidden rounded-md border border-neutral-300 bg-white transition focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/15">
                <span className="flex items-center border-r border-neutral-200 bg-neutral-50 px-3 text-sm font-semibold text-neutral-700">
                  +91
                </span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(toMobileDigits(e.target.value))}
                  placeholder="98765 43210"
                  inputMode="numeric"
                  pattern="\d{10}"
                  title="Exactly 10 digits"
                  autoComplete="username"
                  autoFocus
                  required
                  className="w-full px-3 py-2 text-sm tracking-wider outline-none placeholder:text-neutral-400"
                />
                {phoneComplete ? <CheckCircle2 className="mr-3 h-4 w-4 shrink-0 self-center text-emerald-600" /> : null}
              </div>
            </div>
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            <Button type="submit" className="h-10 w-full" disabled={submitting || !phoneComplete || !password}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
