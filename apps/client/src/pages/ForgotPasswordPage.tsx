import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { Command } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";

const inputClass = "w-full rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-ink outline-none transition focus:border-accent";

export function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const result = await forgotPassword(email);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel enviar as instrucoes.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4 py-8 text-ink">
      <main className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-soft">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent/15 text-accent"><Command size={20} /></div>
          <div><p className="text-sm font-semibold text-accent">Invest Hub</p><h1 className="text-2xl font-semibold">Esqueci minha senha</h1></div>
        </div>
        <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="text-muted">E-mail</span>
            <input className={`${inputClass} mt-1`} type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="seu@email.com" />
          </label>
          {message ? <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">{message}</p> : null}
          <button type="submit" disabled={isSubmitting} className="h-11 w-full rounded-lg bg-accent px-4 text-sm font-semibold text-black transition hover:bg-accent/90 disabled:opacity-60">
            {isSubmitting ? "Enviando..." : "Enviar instrucoes"}
          </button>
        </form>
        <Link className="mt-4 inline-block text-sm text-muted transition hover:text-accent" to="/login">Voltar para login</Link>
      </main>
    </div>
  );
}
