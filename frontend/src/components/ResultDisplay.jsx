import { useState } from 'react';
import { TrendingUp, DollarSign, PiggyBank, ArrowUpRight, ChevronDown, ChevronUp, Calendar } from 'lucide-react';

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function computeYearlyBreakdown(principal, annualRate, years, compoundingFrequency) {
  const r = annualRate / 100;
  const n = compoundingFrequency;
  const rows = [];
  for (let y = 0; y <= years; y++) {
    const balance = principal * Math.pow(1 + r / n, n * y);
    const interest = balance - principal;
    rows.push({ year: y, balance, interest });
  }
  return rows;
}

function getFrequencyLabel(freq) {
  const map = { 1: 'Annually', 2: 'Semi-Annually', 4: 'Quarterly', 12: 'Monthly', 365: 'Daily' };
  return map[freq] || `${freq}x/year`;
}

export default function ResultDisplay({ result }) {
  const [showTable, setShowTable] = useState(false);

  if (!result) return null;

  const totalInterest = result.finalAmount - result.principal;
  const growthPercent = ((totalInterest / result.principal) * 100).toFixed(1);
  const breakdown = computeYearlyBreakdown(
    result.principal, result.annualRate, result.years, result.compoundingFrequency
  );
  const maxBalance = breakdown[breakdown.length - 1].balance;

  return (
    <div className="mt-8 space-y-6">
      {/* Hero result card */}
      <div className="rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 p-6 text-white shadow-lg">
        <div className="flex items-center gap-2 text-indigo-200 text-sm mb-1">
          <TrendingUp className="w-4 h-4" />
          Final Amount After {result.years} Year{result.years > 1 ? 's' : ''}
        </div>
        <p className="text-4xl font-extrabold tracking-tight">
          {formatCurrency(result.finalAmount)}
        </p>
        <p className="mt-2 text-indigo-200 text-sm">
          {formatCurrency(result.principal)} invested at {result.annualRate}% compounded {getFrequencyLabel(result.compoundingFrequency)}
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg p-3 shadow-sm border border-slate-200 text-center">
          <DollarSign className="w-4 h-4 text-slate-400 mx-auto mb-1" />
          <p className="text-xs text-slate-500">Principal</p>
          <p className="text-sm font-bold text-slate-800">{formatCurrency(result.principal)}</p>
        </div>
        <div className="bg-white rounded-lg p-3 shadow-sm border border-slate-200 text-center">
          <PiggyBank className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
          <p className="text-xs text-slate-500">Interest Earned</p>
          <p className="text-sm font-bold text-emerald-600">{formatCurrency(totalInterest)}</p>
        </div>
        <div className="bg-white rounded-lg p-3 shadow-sm border border-slate-200 text-center">
          <ArrowUpRight className="w-4 h-4 text-purple-500 mx-auto mb-1" />
          <p className="text-xs text-slate-500">Total Growth</p>
          <p className="text-sm font-bold text-purple-600">{growthPercent}%</p>
        </div>
        <div className="bg-white rounded-lg p-3 shadow-sm border border-slate-200 text-center">
          <Calendar className="w-4 h-4 text-indigo-500 mx-auto mb-1" />
          <p className="text-xs text-slate-500">Duration</p>
          <p className="text-sm font-bold text-indigo-600">{result.years} yr{result.years > 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Visual growth chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h4 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-indigo-500" />
          Growth Over Time
        </h4>
        <div className="space-y-2">
          {breakdown.map((row) => {
            const principalWidth = (result.principal / maxBalance) * 100;
            const totalWidth = (row.balance / maxBalance) * 100;
            return (
              <div key={row.year} className="flex items-center gap-3">
                <span className="text-xs text-slate-400 w-10 text-right shrink-0">
                  Yr {row.year}
                </span>
                <div className="flex-1 relative h-6 bg-slate-100 rounded-full overflow-hidden">
                  {/* Principal portion */}
                  <div
                    className="absolute inset-y-0 left-0 bg-indigo-200 rounded-full"
                    style={{ width: `${principalWidth}%` }}
                  />
                  {/* Total balance */}
                  <div
                    className="absolute inset-y-0 left-0 bg-indigo-500 rounded-full transition-all duration-500"
                    style={{ width: `${totalWidth}%`, opacity: 0.8 }}
                  />
                </div>
                <span className="text-xs font-medium text-slate-600 w-24 text-right shrink-0">
                  {formatCurrency(row.balance)}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-indigo-200 inline-block" /> Principal
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-indigo-500 inline-block opacity-80" /> Total Balance
          </span>
        </div>
      </div>

      {/* Year-by-year breakdown table (collapsible) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowTable(!showTable)}
          className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
        >
          <span>Year-by-Year Breakdown</span>
          {showTable ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showTable && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-t border-slate-200">
                  <th className="px-5 py-2 text-left font-medium text-slate-500">Year</th>
                  <th className="px-5 py-2 text-right font-medium text-slate-500">Balance</th>
                  <th className="px-5 py-2 text-right font-medium text-slate-500">Interest Earned</th>
                  <th className="px-5 py-2 text-right font-medium text-slate-500">Year Growth</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((row, idx) => {
                  const prevBalance = idx > 0 ? breakdown[idx - 1].balance : result.principal;
                  const yearGrowth = row.balance - prevBalance;
                  return (
                    <tr key={row.year} className="border-t border-slate-100 hover:bg-slate-50/50">
                      <td className="px-5 py-2 text-slate-700 font-medium">{row.year}</td>
                      <td className="px-5 py-2 text-right text-slate-800 font-semibold">{formatCurrency(row.balance)}</td>
                      <td className="px-5 py-2 text-right text-emerald-600">{formatCurrency(row.interest)}</td>
                      <td className="px-5 py-2 text-right text-purple-600">
                        {row.year === 0 ? '—' : `+${formatCurrency(yearGrowth)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {result.calculationId && (
        <p className="text-xs text-slate-400 text-right">
          Calculation ID: {result.calculationId}
        </p>
      )}
    </div>
  );
}
