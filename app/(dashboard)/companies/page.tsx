import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import AddCompanyButton from './AddCompanyButton'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID

const STATUS_STYLES: Record<string, string> = {
  target:      'bg-gray-100 text-gray-600',
  warm:        'bg-yellow-100 text-yellow-700',
  hot:         'bg-orange-100 text-orange-700',
  active_deal: 'bg-green-100 text-green-700',
  customer:    'bg-blue-100 text-blue-700',
  inactive:    'bg-gray-50 text-gray-400',
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string }
}) {
  const supabase = createClient()

  let query = supabase
    .from('companies')
    .select('id, name, domain, account_status, account_score, icp_score, signal_score, current_metrics, last_signal_at')
    .eq('project_id', PROJECT_ID)
    .order('account_score', { ascending: false })
    .limit(100)

  if (searchParams.status) {
    query = query.eq('account_status', searchParams.status)
  }
  if (searchParams.q) {
    query = query.ilike('name', `%${searchParams.q}%`)
  }

  const { data: companies, error } = await query

  const statuses = ['target', 'warm', 'hot', 'active_deal', 'customer', 'inactive']

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
        <AddCompanyButton projectId={PROJECT_ID} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <a
          href="/companies"
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${!searchParams.status ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          Alle
        </a>
        {statuses.map(s => (
          <a
            key={s}
            href={`/companies?status=${s}`}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              searchParams.status === s
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s.replace('_', ' ')}
          </a>
        ))}

        {/* Search */}
        <form className="ml-auto" method="get">
          {searchParams.status && <input type="hidden" name="status" value={searchParams.status} />}
          <input
            name="q"
            defaultValue={searchParams.q}
            placeholder="Suche…"
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-48"
          />
        </form>
      </div>

      {/* Table */}
      {error && <p className="text-sm text-red-500 mb-4">Fehler: {error.message}</p>}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-500">Unternehmen</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Score</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">ICP</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Signale</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Jobs</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Letztes Signal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(companies || []).map(company => {
              const metrics = company.current_metrics as any || {}
              return (
                <tr key={company.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/companies/${company.id}`}
                      className="font-medium text-gray-900 hover:text-primary-600"
                    >
                      {company.name}
                    </Link>
                    <p className="text-xs text-gray-400">{company.domain}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[company.account_status] || ''}`}>
                      {company.account_status?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ScoreBar value={company.account_score || 0} />
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {company.icp_score ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {company.signal_score ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {metrics.open_jobs ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-gray-400">
                    {company.last_signal_at
                      ? formatRelative(company.last_signal_at)
                      : '—'}
                  </td>
                </tr>
              )
            })}
            {!companies?.length && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">
                  Keine Unternehmen gefunden. Füge dein erstes Unternehmen hinzu.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-3">{companies?.length || 0} Unternehmen geladen</p>
    </div>
  )
}

function ScoreBar({ value }: { value: number }) {
  const color = value >= 70 ? 'bg-green-500' : value >= 40 ? 'bg-yellow-500' : 'bg-gray-300'
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-gray-700 font-medium w-6 text-right">{value}</span>
    </div>
  )
}

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr)
  const diffDays = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'heute'
  if (diffDays === 1) return 'gestern'
  return `vor ${diffDays}d`
}
