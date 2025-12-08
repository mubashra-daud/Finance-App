"use client"

import React, { useEffect, useMemo, useState } from 'react'

type Tx = {
  id: number
  date: string
  description: string
  amount: number
  category?: string | null
  txn_type: string
  merchant?: string | null
}

type DashboardCategory = { name: string; total: number }

type DashboardResponse = {
  balance: number
  total_income: number
  total_expense: number
  monthly_burn_pred: number
  recent: Tx[]
  categories: DashboardCategory[]
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const currency = (n: number) => `$${n.toFixed(2)}`

export default function Dashboard() {
  const [dash, setDash] = useState<DashboardResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    description: '',
    amount: '0',
    category: '',
    txn_type: 'expense',
    merchant: '',
  })
  const [error, setError] = useState<string | null>(null)

  const fetchDashboard = async () => {
    try {
      setLoading(true)
      const res = await fetch(`${API_URL}/api/dashboard`)
      const data = await res.json()
      setDash(data)
    } catch (err) {
      console.error(err)
      setError('Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboard()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const payload = {
        ...form,
        amount: Number(form.amount),
        category: form.category || null,
        merchant: form.merchant || null,
      }
      const res = await fetch(`${API_URL}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to save transaction')
      setForm({ ...form, description: '', amount: '0', merchant: '', category: '' })
      await fetchDashboard()
    } catch (err: any) {
      setError(err.message || 'Failed to save')
    }
  }

  const totalByCategory = useMemo(() => dash?.categories || [], [dash])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <header className="flex flex-col gap-3 mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-300">Smart Personal Finance</p>
          <h1 className="text-3xl md:text-4xl font-bold">Budgeting platform with ML burn prediction</h1>
          <p className="text-slate-300 max-w-3xl">Track income and expenses, view live dashboards, and let the app auto-categorize transactions with a simple ruleset.</p>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <MetricCard title="Balance" value={dash ? currency(dash.balance) : '—'} accent="emerald" loading={loading} />
          <MetricCard title="Income" value={dash ? currency(dash.total_income) : '—'} accent="cyan" loading={loading} />
          <MetricCard title="Expenses" value={dash ? currency(dash.total_expense) : '—'} accent="rose" loading={loading} />
          <MetricCard title="Monthly burn (pred)" value={dash ? currency(dash.monthly_burn_pred) : '—'} accent="amber" loading={loading} />
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg shadow-emerald-500/5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-lg">Recent activity</h2>
                {loading && <span className="text-xs text-slate-400">Loading…</span>}
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-400">
                    <tr>
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Description</th>
                      <th className="py-2 pr-3">Merchant</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3 text-right">Amount</th>
                      <th className="py-2 pr-3">Category</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {dash?.recent?.length ? (
                      dash.recent.map((t) => (
                        <tr key={t.id}>
                          <td className="py-2 pr-3 whitespace-nowrap">{t.date}</td>
                          <td className="py-2 pr-3">{t.description}</td>
                          <td className="py-2 pr-3">{t.merchant || '—'}</td>
                          <td className="py-2 pr-3">{t.txn_type}</td>
                          <td
                            className={`py-2 pr-3 text-right font-medium ${
                              t.txn_type === 'expense' ? 'text-rose-300' : 'text-emerald-300'
                            }`}
                          >
                            {currency(t.amount)}
                          </td>
                          <td className="py-2 pr-3">{t.category || 'Uncategorized'}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="py-4 text-center text-slate-500" colSpan={6}>
                          No transactions yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg shadow-cyan-500/5">
              <h2 className="font-semibold text-lg mb-3">Spending by category</h2>
              <div className="space-y-3">
                {totalByCategory.length === 0 && <p className="text-slate-500 text-sm">No expenses yet.</p>}
                {totalByCategory.map((c) => (
                  <div key={c.name}>
                    <div className="flex justify-between text-sm text-slate-300">
                      <span>{c.name}</span>
                      <span>{currency(c.total)}</span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full mt-1">
                      <div className="h-2 rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400" style={{ width: `${Math.min(100, c.total)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg shadow-amber-500/5">
            <h2 className="font-semibold text-lg mb-4">Add transaction</h2>
            {error && <p className="text-sm text-rose-300 mb-2">{error}</p>}
            <form className="space-y-3" onSubmit={handleSubmit}>
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Date</label>
                <input
                  type="date"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Description</label>
                <input
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="e.g. Coffee at Blue Bottle"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm text-slate-300">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-slate-300">Type</label>
                  <select
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm"
                    value={form.txn_type}
                    onChange={(e) => setForm({ ...form, txn_type: e.target.value })}
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Merchant (optional)</label>
                <input
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm"
                  value={form.merchant}
                  onChange={(e) => setForm({ ...form, merchant: e.target.value })}
                  placeholder="Starbucks"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Category (optional)</label>
                <input
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="Food, Transport, Income..."
                />
              </div>
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-emerald-400 to-cyan-400 text-slate-950 font-semibold rounded-lg py-2 shadow-lg shadow-emerald-500/30 hover:shadow-cyan-400/40 transition"
              >
                Save transaction
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  )
}

function MetricCard({ title, value, accent, loading }: { title: string; value: string; accent: 'emerald' | 'cyan' | 'rose' | 'amber'; loading?: boolean }) {
  const ring = {
    emerald: 'from-emerald-400 to-cyan-400',
    cyan: 'from-cyan-400 to-sky-400',
    rose: 'from-rose-400 to-orange-400',
    amber: 'from-amber-300 to-lime-300',
  }[accent]

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg shadow-emerald-500/5">
      <p className="text-xs text-slate-400 uppercase tracking-wide">{title}</p>
      <p className="mt-2 text-2xl font-semibold">{loading ? 'Loading…' : value}</p>
      <div className={`mt-3 h-1 w-16 rounded-full bg-gradient-to-r ${ring}`} />
    </div>
  )
}
