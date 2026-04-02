import { useState } from 'react';
import { DollarSign, Percent, Clock, BarChart3, Calculator, Loader2 } from 'lucide-react';

const COMPOUNDING_OPTIONS = [
  { value: 1, label: 'Annually' },
  { value: 2, label: 'Semi-Annually' },
  { value: 4, label: 'Quarterly' },
  { value: 12, label: 'Monthly' },
  { value: 365, label: 'Daily' },
];

export default function CalculatorForm({ onSubmit, isLoading }) {
  const [formData, setFormData] = useState({
    principal: '',
    annualRate: '',
    years: '',
    compoundingFrequency: 12,
  });

  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};
    if (!formData.principal || Number(formData.principal) <= 0) {
      newErrors.principal = 'Principal must be a positive number';
    }
    if (!formData.annualRate || Number(formData.annualRate) <= 0 || Number(formData.annualRate) > 100) {
      newErrors.annualRate = 'Rate must be between 0 and 100';
    }
    if (!formData.years || Number(formData.years) <= 0 || Number(formData.years) > 100) {
      newErrors.years = 'Years must be between 1 and 100';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      onSubmit({
        principal: parseFloat(formData.principal),
        annualRate: parseFloat(formData.annualRate),
        years: parseInt(formData.years, 10),
        compoundingFrequency: parseInt(formData.compoundingFrequency, 10),
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Principal */}
      <div>
        <label htmlFor="principal" className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
          <DollarSign className="w-4 h-4 text-indigo-500" />
          Principal Amount ($)
        </label>
        <input
          id="principal"
          name="principal"
          type="number"
          step="0.01"
          min="0"
          placeholder="e.g. 10000"
          value={formData.principal}
          onChange={handleChange}
          className={`w-full rounded-lg border px-4 py-2.5 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition
            ${errors.principal ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'}`}
        />
        {errors.principal && <p className="mt-1 text-sm text-red-500">{errors.principal}</p>}
      </div>

      {/* Annual Rate */}
      <div>
        <label htmlFor="annualRate" className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
          <Percent className="w-4 h-4 text-indigo-500" />
          Annual Interest Rate (%)
        </label>
        <input
          id="annualRate"
          name="annualRate"
          type="number"
          step="0.01"
          min="0"
          max="100"
          placeholder="e.g. 5.5"
          value={formData.annualRate}
          onChange={handleChange}
          className={`w-full rounded-lg border px-4 py-2.5 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition
            ${errors.annualRate ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'}`}
        />
        {errors.annualRate && <p className="mt-1 text-sm text-red-500">{errors.annualRate}</p>}
      </div>

      {/* Years */}
      <div>
        <label htmlFor="years" className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
          <Clock className="w-4 h-4 text-indigo-500" />
          Time Period (Years)
        </label>
        <input
          id="years"
          name="years"
          type="number"
          min="1"
          max="100"
          placeholder="e.g. 10"
          value={formData.years}
          onChange={handleChange}
          className={`w-full rounded-lg border px-4 py-2.5 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition
            ${errors.years ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'}`}
        />
        {errors.years && <p className="mt-1 text-sm text-red-500">{errors.years}</p>}
      </div>

      {/* Compounding Frequency */}
      <div>
        <label htmlFor="compoundingFrequency" className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
          <BarChart3 className="w-4 h-4 text-indigo-500" />
          Compounding Frequency
        </label>
        <select
          id="compoundingFrequency"
          name="compoundingFrequency"
          value={formData.compoundingFrequency}
          onChange={handleChange}
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
        >
          {COMPOUNDING_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label} ({opt.value}x/year)
            </option>
          ))}
        </select>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-white font-semibold shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Calculating...
          </>
        ) : (
          <>
            <Calculator className="w-5 h-5" />
            Calculate Compound Interest
          </>
        )}
      </button>
    </form>
  );
}
