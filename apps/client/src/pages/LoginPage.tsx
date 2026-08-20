import { FormEvent, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Command } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";

const inputClass = "w-full rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-ink outline-none transition focus:border-accent";

function AuthShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4 py-8 text-ink">
      <main className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-soft">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent/15 text-accent">
            <Command size={20} />
          </div>
          <div>
            <p className="text-sm font-semibold text-accent">Invest Hub</p>
            <h1 className="text-2xl font-semibold">{title}</h1>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted">{description}</p>
        {children}
      </main>
    </div>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      await login({ email, password });
      const state = location.state as { from?: string } | null;
      navigate(state?.from || "/", { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Nao foi possivel entrar.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell title="Entrar" description="Acesse sua carteira pessoal com seguranca.">
      <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-4">
        <label className="block text-sm">
          <span className="text-muted">E-mail</span>
          <input className={`${inputClass} mt-1`} type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="text-muted">Senha</span>
          <input className={`${inputClass} mt-1`} type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error ? <p className="rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-sm text-rose">{error}</p> : null}
        <button type="submit" disabled={isSubmitting} className="h-11 w-full rounded-lg bg-accent px-4 text-sm font-semibold text-black transition hover:bg-accent/90 disabled:opacity-60">
          {isSubmitting ? "Entrando..." : "Entrar"}
        </button>
      </form>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <Link className="transition hover:text-accent" to="/cadastro">Ainda nao possui conta?</Link>
        <Link className="transition hover:text-accent" to="/esqueci-minha-senha">Esqueci minha senha</Link>
      </div>
    </AuthShell>
  );
}
