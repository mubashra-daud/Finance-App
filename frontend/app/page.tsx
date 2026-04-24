"use client"

import React, { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

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
type CashflowPoint = { date: string; income: number; expense: number; net: number }
type TokenResponse = { access_token: string; token_type: string }

type DashboardResponse = {
  balance: number
  total_income: number
  total_expense: number
  monthly_burn_pred: number
  recent: Tx[]
  categories: DashboardCategory[]
  cashflow: CashflowPoint[]
}

// Normalize API base to avoid trailing spaces/slashes that can break fetch URLs.
const API_URL = ((process.env.NEXT_PUBLIC_API_URL as string | undefined) || 'http://localhost:8000')
  .trim()
  .replace(/\/$/, '')

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
  const [ruleForm, setRuleForm] = useState({ keyword: '', category: '' })
  const [token, setToken] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authForm, setAuthForm] = useState({ email: '', password: '' })
  const [guestMode, setGuestMode] = useState(false)

  const authHeaders = () => (token ? { Authorization: `Bearer ${token}` } : {})

  const handleAuth = async (mode: 'login' | 'register') => {
    setError(null)
    try {
      if (mode === 'register') {
        const res = await fetch(`${API_URL}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(authForm),
        })
        if (!res.ok) throw new Error('Registration failed')
        const data: TokenResponse = await res.json()
        setToken(data.access_token)
        setUserEmail(authForm.email)
        localStorage.setItem('finance_token', data.access_token)
        localStorage.setItem('finance_email', authForm.email)
      } else {
        const body = new URLSearchParams({ username: authForm.email, password: authForm.password })
        const res = await fetch(`${API_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        })
        if (!res.ok) throw new Error('Login failed')
        const data: TokenResponse = await res.json()
        setToken(data.access_token)
        setUserEmail(authForm.email)
        localStorage.setItem('finance_token', data.access_token)
        localStorage.setItem('finance_email', authForm.email)
      }
      setAuthForm({ email: '', password: '' })
    } catch (err: any) {
      setError(err.message || 'Authentication failed')
    }
  }

  const handleLogout = () => {
    setToken(null)
    setUserEmail(null)
    setGuestMode(false)
    localStorage.removeItem('finance_token')
    localStorage.removeItem('finance_email')
    localStorage.removeItem('finance_guest')
    setDash(null)
  }

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/category-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(ruleForm),
      })
      if (!res.ok) throw new Error('Failed to save rule')
      setRuleForm({ keyword: '', category: '' })
    } catch (err: any) {
      setError(err.message || 'Could not save rule')
    }
  }

  const fetchDashboard = async () => {
    try {
      setLoading(true)
      const res = await fetch(`${API_URL}/api/dashboard`, { headers: authHeaders() })
      if (res.status === 401) {
        handleLogout()
        throw new Error('Session expired, please login again')
      }
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
    const savedToken = localStorage.getItem('finance_token')
    const savedEmail = localStorage.getItem('finance_email')
    const savedGuest = localStorage.getItem('finance_guest') === '1'
    if (savedToken) setToken(savedToken)
    if (savedEmail) setUserEmail(savedEmail)
    if (savedGuest) setGuestMode(true)
  }, [])

  useEffect(() => {
    if (token || guestMode) {
      fetchDashboard()
    }
  }, [token, guestMode])

  // Background refresh for near real-time feel
  useEffect(() => {
    if (!token && !guestMode) return
    const id = setInterval(fetchDashboard, 15_000)
    return () => clearInterval(id)
  }, [token, guestMode])

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
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
  const cashflowSeries = useMemo(() => dash?.cashflow || [], [dash])

  if (!token && !guestMode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-900 text-slate-50">
        <div className="max-w-6xl mx-auto px-4 py-16 grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-4">
            <p className="text-sm uppercase tracking-[0.25em] text-emerald-300">Smart Personal Finance</p>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight">Stay on top of your cashflow.</h1>
            <p className="text-slate-300 text-lg">Track income & expenses, visualize burn, and auto-categorize transactions. Sign in to get your live dashboard.</p>
            <ul className="space-y-2 text-slate-200">
              <li>- Realtime KPIs & burn forecast</li>
              <li>- Cashflow trends & category insights</li>
              <li>- Your data, secured with JWT auth</li>
            </ul>
          </div>
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-2xl shadow-emerald-500/20 backdrop-blur">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">{authMode === 'login' ? 'Welcome back' : 'Create account'}</h2>
              <div className="flex gap-2 text-sm">
                <button
                  className={`px-3 py-1 rounded-full ${authMode === 'login' ? 'bg-emerald-500 text-slate-900' : 'bg-slate-800'}`}
                  onClick={() => setAuthMode('login')}
                >
                  Login
                </button>
                <button
                  className={`px-3 py-1 rounded-full ${authMode === 'register' ? 'bg-emerald-500 text-slate-900' : 'bg-slate-800'}`}
                  onClick={() => setAuthMode('register')}
                >
                  Register
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-rose-300 mb-2">{error}</p>}
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Email</label>
                <input
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm"
                  value={authForm.email}
                  onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                  type="email"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Password</label>
                <input
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm"
                  value={authForm.password}
                  onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                  type="password"
                  required
                />
              </div>
              <button
                onClick={() => handleAuth(authMode)}
                className="w-full bg-gradient-to-r from-emerald-400 to-cyan-400 text-slate-950 font-semibold rounded-lg py-2 shadow-lg shadow-emerald-500/30 hover:shadow-cyan-400/40 transition"
              >
                {authMode === 'login' ? 'Login & view dashboard' : 'Register & start tracking'}
              </button>
              <button
                onClick={() => {
                  setGuestMode(true)
                  localStorage.setItem('finance_guest', '1')
                  setError(null)
                  setDash(null)
                }}
                className="w-full border border-slate-700 text-slate-200 rounded-lg py-2 hover:border-emerald-400 transition"
              >
                Continue without login
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <header className="flex flex-col gap-3 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-emerald-300">Smart Personal Finance</p>
              <h1 className="text-3xl md:text-4xl font-bold">Budgeting platform with ML burn prediction</h1>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-300">
                {token ? `Signed in as ${userEmail}` : 'Guest session (data not tied to an account)'}
              </p>
              <div className="flex justify-end gap-3">
                {token && (
                  <button className="text-sm text-cyan-300 hover:text-emerald-200" onClick={handleLogout}>
                    Logout
                  </button>
                )}
                {!token && (
                  <button
                    className="text-sm text-emerald-300 hover:text-emerald-100"
                    onClick={() => {
                      setGuestMode(false)
                      localStorage.removeItem('finance_guest')
                    }}
                  >
                    Switch to login
                  </button>
                )}
              </div>
            </div>
          </div>
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

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg shadow-emerald-500/10">
            <h2 className="font-semibold text-lg mb-3">Auto-categorization rule</h2>
            <p className="text-sm text-slate-400 mb-3">Add a keyword → category rule just for you.</p>
            <form className="space-y-3" onSubmit={handleAddRule}>
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Keyword</label>
                <input
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm"
                  value={ruleForm.keyword}
                  onChange={(e) => setRuleForm({ ...ruleForm, keyword: e.target.value })}
                  placeholder="e.g. coffee, uber"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Category</label>
                <input
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm"
                  value={ruleForm.category}
                  onChange={(e) => setRuleForm({ ...ruleForm, category: e.target.value })}
                  placeholder="Food, Transport, Income..."
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 font-semibold rounded-lg py-2 shadow-lg shadow-emerald-500/30 hover:shadow-cyan-400/40 transition"
              >
                Save rule
              </button>
            </form>
          </div>
        </section>

        <section className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg shadow-cyan-500/5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-lg">Net cashflow (last 30 days)</h2>
              {loading && <span className="text-xs text-slate-400">Loading...</span>}
            </div>
            <div className="h-64">
              {cashflowSeries.length === 0 ? (
                <p className="text-sm text-slate-500">Add some transactions to see trends.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cashflowSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                    <YAxis stroke="#94a3b8" fontSize={12} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }}
                      formatter={(value: any) => currency(Number(value))}
                    />
                    <Line type="monotone" dataKey="net" stroke="#34d399" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="expense" stroke="#fb7185" strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="income" stroke="#38bdf8" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg shadow-emerald-500/5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-lg">Category breakdown</h2>
              {loading && <span className="text-xs text-slate-400">Loading...</span>}
            </div>
            <div className="h-64">
              {totalByCategory.length === 0 ? (
                <p className="text-sm text-slate-500">No expenses yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={totalByCategory} layout="vertical" margin={{ left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis type="number" stroke="#94a3b8" fontSize={12} />
                    <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={12} width={100} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }}
                      formatter={(value: any) => currency(Number(value))}
                    />
                    <Bar dataKey="total" fill="url(#catFill)" radius={6} />
                    <defs>
                      <linearGradient id="catFill" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#22d3ee" />
                        <stop offset="100%" stopColor="#a3e635" />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
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
      <p className="mt-2 text-2xl font-semibold">{loading ? 'Loading...' : value}</p>
      <div className={`mt-3 h-1 w-16 rounded-full bg-gradient-to-r ${ring}`} />
    </div>
  )
}
