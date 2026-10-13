import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AlertCircle, MapPinned, Receipt, TrendingUp } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Input, Label } from "../components/ui/Input";

const highlights = [
  { icon: MapPinned, title: "Live field map", text: "See every on-duty salesperson across Tamil Nadu in real time." },
  { icon: Receipt, title: "Orders in one place", text: "Confirm, deliver or cancel orders as they come in from the field." },
  { icon: TrendingUp, title: "Sales insight", text: "Track sales, visits and district coverage day by day." },
];

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      <div className="relative hidden overflow-hidden bg-ink-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="paint-stripe absolute inset-x-0 top-0 h-1.5" />
        <div className="absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-paint-magenta/15 blur-3xl" />
        <div className="absolute -bottom-40 -left-24 h-[28rem] w-[28rem] rounded-full bg-paint-blue/15 blur-3xl" />
        <div className="relative">
          <img src="/roalux-logo.png" alt="Roalux" className="h-16 w-auto" />
        </div>
        <div className="relative space-y-8">
          <h1 className="max-w-md text-4xl font-semibold leading-tight tracking-tight">
            Your field sales team, on one screen.
          </h1>
          <ul className="space-y-5">
            {highlights.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/10">
                  <Icon className="h-5 w-5 text-brand-300" />
                </div>
                <div>
                  <div className="font-medium">{title}</div>
                  <div className="text-sm text-slate-400">{text}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative text-xs text-slate-500">Admin access only</div>
      </div>

      <div className="flex items-center justify-center bg-slate-50 px-4 py-12">
        <div className="w-full max-w-sm">
          <img src="/roalux-logo.png" alt="Roalux" className="mb-10 h-12 w-auto lg:hidden" />
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use your admin phone number and password.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <Label>Phone number</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10-digit mobile number"
                inputMode="tel"
                autoComplete="username"
                autoFocus
                required
              />
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
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            <Button type="submit" className="w-full py-2.5" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
