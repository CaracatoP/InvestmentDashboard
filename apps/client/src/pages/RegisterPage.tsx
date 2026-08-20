import { FormEvent, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Command } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";

const inputClass = "w-full rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-ink outline-none transition focus:border-accent";

function RegisterShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4 py-8 text-ink">
      <main className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-soft">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent/15 text-accent">
            <Command size={20} />
          </div>
          <div>
            <p className="text-sm font-semibold text-accent">Invest Hub</p>
            <h1 className="text-2xl font-semibold">Criar conta</h1>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted">Sua solicitacao fica pendente ate aprovacao administrativa.</p>
        {children}
      </main>
    </div>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const result = await register(form);
      setFeedback({ type: "success", message: result.message });
      setForm({ name: "", email: "", password: "", confirmPassword: "" });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Nao foi possivel solicitar cadastro." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <RegisterShell>
      <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-4">
        <label className="block text-sm">
          <span className="text-muted">Nome</span>
          <input className={`${inputClass} mt-1`} required minLength={2} maxLength={80} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
        </label>
        <label className="block text-sm">
          <span className="text-muted">E-mail</span>
          <input className={`${inputClass} mt-1`} type="email" required value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
        </label>
        <label className="block text-sm">
          <span className="text-muted">Senha</span>
          <input className={`${inputClass} mt-1`} type="password" required minLength={8} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
        </label>
        <label className="block text-sm">
          <span className="text-muted">Confirmar senha</span>
          <input className={`${inputClass} mt-1`} type="password" required minLength={8} value={form.confirmPassword} onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))} />
        </label>
        {feedback ? <p className={`rounded-lg px-3 py-2 text-sm ${feedback.type === "success" ? "bg-accent/10 text-accent" : "bg-rose/10 text-rose"}`}>{feedback.message}</p> : null}
        <button type="submit" disabled={isSubmitting} className="h-11 w-full rounded-lg bg-accent px-4 text-sm font-semibold text-black transition hover:bg-accent/90 disabled:opacity-60">
          {isSubmitting ? "Enviando..." : "Criar conta"}
        </button>
      </form>
      <p className="mt-4 text-sm text-muted">
        Ja possui conta? <Link className="text-accent transition hover:text-accent/80" to="/login">Entrar</Link>
      </p>
    </RegisterShell>
  );
}
