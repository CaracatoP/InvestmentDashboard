import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PieChart } from "../components/charts/PieChart";
import { PageHeader } from "../components/ui/PageHeader";
import { ProgressBar } from "../components/ui/ProgressBar";
import { useInvestmentStore } from "../stores/useInvestmentStore";
import { formatCurrency, formatPercentage } from "../utils/formatters";

const allocationColors = ["#22c55e", "#38bdf8", "#a78bfa", "#f59e0b", "#fb7185", "#14b8a6"];

export function PortfolioPage() {
  const portfolio = useInvestmentStore((state) => state.portfolio);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todas");

  const categories = useMemo(() => {
    const values = portfolio?.assets.map((asset) => asset.category) ?? [];
    return ["Todas", ...Array.from(new Set(values))];
  }, [portfolio?.assets]);

  const filteredAssets = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return (portfolio?.assets ?? []).filter((asset) => {
      const matchesSearch =
        asset.ticker.toLowerCase().includes(normalizedSearch) || asset.name.toLowerCase().includes(normalizedSearch);
      const matchesCategory = category === "Todas" || asset.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [category, portfolio?.assets, search]);

  const allocationChartData = useMemo(
    () =>
      (portfolio?.allocationComparison ?? []).map((item, index) => ({
        ...item,
        value: item.value ?? 0,
        color: item.color ?? allocationColors[index % allocationColors.length]
      })),
    [portfolio?.allocationComparison]
  );

  if (!portfolio) {
    return <div className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">Carregando carteira...</div>;
  }

  return (
    <div>
      <PageHeader
        eyebrow="Carteira"
        title="Controle completo dos ativos"
        description="Pesos, rentabilidade, dividend yield, preco medio e exposicao por categoria em uma tabela filtravel."
      />

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-lg border border-line bg-panel p-4 shadow-soft">
          <div className="mb-4 flex flex-col gap-3 md:flex-row">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-10 w-full rounded-lg border border-line bg-elevated pl-9 pr-3 text-sm text-ink outline-none transition focus:border-accent"
                placeholder="Buscar por nome ou ticker"
              />
            </label>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-10 rounded-lg border border-line bg-elevated px-3 text-sm text-ink outline-none transition focus:border-accent"
            >
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>

          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.14em] text-muted">
                <tr className="border-b border-line">
                  <th className="py-3 font-medium">Nome</th>
                  <th className="py-3 font-medium">Categoria</th>
                  <th className="py-3 font-medium">Qtd.</th>
                  <th className="py-3 font-medium">Preco medio</th>
                  <th className="py-3 font-medium">Preco atual</th>
                  <th className="py-3 font-medium">Investido</th>
                  <th className="py-3 font-medium">Atual</th>
                  <th className="py-3 font-medium">Lucro</th>
                  <th className="py-3 font-medium">Rent.</th>
                  <th className="py-3 font-medium">DY</th>
                  <th className="py-3 font-medium">Dividendos</th>
                  <th className="py-3 font-medium">Peso</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssets.map((asset) => (
                  <tr key={asset.ticker} className="border-b border-line/70 text-muted">
                    <td className="py-3">
                      <Link to={`/ativos/${asset.ticker}`} className="font-medium text-ink hover:text-accent">
                        {asset.ticker}
                      </Link>
                      <p className="text-xs text-muted">{asset.name}</p>
                    </td>
                    <td className="py-3">{asset.category}</td>
                    <td className="py-3">{asset.quantity}</td>
                    <td className="py-3">{formatCurrency(asset.averagePrice)}</td>
                    <td className="py-3">{formatCurrency(asset.currentPrice)}</td>
                    <td className="py-3">{formatCurrency(asset.investedValue)}</td>
                    <td className="py-3">{formatCurrency(asset.currentValue)}</td>
                    <td className={asset.profit >= 0 ? "py-3 text-accent" : "py-3 text-rose"}>{formatCurrency(asset.profit)}</td>
                    <td className={asset.returnPercentage >= 0 ? "py-3 text-accent" : "py-3 text-rose"}>
                      {formatPercentage(asset.returnPercentage)}
                    </td>
                    <td className="py-3">{formatPercentage(asset.dividendYield)}</td>
                    <td className="py-3">{formatCurrency(asset.dividendsReceived)}</td>
                    <td className="py-3">{formatPercentage(asset.portfolioWeight)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="space-y-4">
          <article className="rounded-lg border border-line bg-panel p-4">
            <p className="text-sm text-muted">Aporte recomendado</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">{portfolio.recommendation.ticker}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{portfolio.recommendation.reason}</p>
          </article>
          <article className="rounded-lg border border-line bg-panel p-4">
            <h2 className="text-base font-semibold text-ink">Carteira ideal x atual</h2>
            <div className="mt-4">
              <PieChart data={allocationChartData} height={220} />
            </div>
            <div className="mt-4 space-y-4">
              {portfolio.allocationComparison.map((item) => (
                <div key={item.category}>
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-muted">{item.category}</span>
                    <span className="text-ink">
                      {formatPercentage(item.currentPercentage)} / {formatPercentage(item.targetPercentage)}
                    </span>
                  </div>
                  <ProgressBar value={item.currentPercentage} tone={item.difference > 0 ? "amber" : "green"} />
                </div>
              ))}
            </div>
          </article>
        </aside>
      </section>
    </div>
  );
}
