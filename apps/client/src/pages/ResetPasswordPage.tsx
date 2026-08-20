import { FormEvent, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Command } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";

const inputClass = "w-full rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-ink outline-none transition focus:border-accent";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);
  const { resetPassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const result = await resetPassword({ token, password, confirmPassword });
      setFeedback({ type: "success", message: result.message });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Nao foi possivel redefinir a senha." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4 py-8 text-ink">
      <main className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-soft">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent/15 text-accent"><Command size={20} /></div>
          <div><p className="text-sm font-semibold text-accent">Invest Hub</p><h1 className="text-2xl font-semibold">Redefinir senha</h1></div>
        </div>
        <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="text-muted">Nova senha</span>
            <input className={`${inputClass} mt-1`} type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Digite sua nova senha" />
          </label>
          <label className="block text-sm">
            <span className="text-muted">Confirmar senha</span>
            <input className={`${inputClass} mt-1`} type="password" required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Digite novamente a nova senha" />
          </label>
          {feedback ? <p className={`rounded-lg px-3 py-2 text-sm ${feedback.type === "success" ? "bg-accent/10 text-accent" : "bg-rose/10 text-rose"}`}>{feedback.message}</p> : null}
          <button type="submit" disabled={isSubmitting || !token} className="h-11 w-full rounded-lg bg-accent px-4 text-sm font-semibold text-black transition hover:bg-accent/90 disabled:opacity-60">
            {isSubmitting ? "Salvando..." : "Salvar nova senha"}
          </button>
        </form>
        <Link className="mt-4 inline-block text-sm text-muted transition hover:text-accent" to="/login">Voltar para login</Link>
      </main>
    </div>
  );
}
