import { createClient } from '@/lib/supabase/server'
import { formatDistanceToNow } from 'date-fns'
import { de } from 'date-fns/locale'
import TriggerQueueButton from './TriggerQueueButton'
import ActionCard from './ActionCard'

const PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Kritisch',  color: 'bg-red-100 text-red-700' },
  2: { label: 'Dringend',  color: 'bg-orange-100 text-orange-700' },
  3: { label: 'Wichtig',   color: 'bg-yellow-100 text-yellow-700' },
  4: { label: 'Normal',    color: 'bg-blue-100 text-blue-700' },
  5: { label: 'Optional',  color: 'bg-gray-100 text-gray-600' },
}

export default async function TodayPage({
  searchParams,
}: {
  searchParams: { minutes?: string }
}) {
  const supabase = createClient()
  const minutes = parseInt(searchParams.minutes || '30', 10)

  // Load today's queue via the SQL function
  const { data: queue, error: queueError } = await supabase.rpc('get_today_queue', {
    p_project_id: PROJECT_ID,
    p_minutes_available: minutes,
    p_limit: 20,
  })

  // Load recent signals for context panel
  const { data: recentSignals } = await supabase
    .from('signals')
    .select('*, companies(name, domain)')
    .eq('project_id', PROJECT_ID)
    .eq('status', 'active')
    .order('detected_at', { ascending: false })
    .limit(10)

  // Load quick stats
  const { count: hotCount } = await supabase
    .from('companies')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', PROJECT_ID)
    .in('account_status', ['hot', 'active_deal'])

  const { count: pendingActions } = await supabase
    .from('actions')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', PROJECT_ID)
    .eq('status', 'pending')

  const { count: activeSignals } = await supabase
    .from('signals')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', PROJECT_ID)
    .eq('status', 'active')

  const totalMinutes = (queue || []).reduce((sum: number, a: any) => sum + (a.estimated_minutes || 0), 0)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Today's Queue</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TimeSelector currentMinutes={minutes} />
          <TriggerQueueButton projectId={PROJECT_ID} />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label="Actions heute" value={queue?.length || 0} sub={`${totalMinutes} min`} />
        <StatCard label="Aktive Signale" value={activeSignals || 0} color="text-green-600" />
        <StatCard label="Hot Accounts" value={hotCount || 0} color="text-orange-600" />
        <StatCard label="Ausstehend" value={pendingActions || 0} />
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Action queue — 2/3 width */}
        <div className="col-span-2 space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Prioritäts-Queue · {minutes} Minuten Budget
          </h2>

          {queueError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
              Fehler beim Laden: {queueError.message}
            </div>
          )}

          {!queue?.length && !queueError && (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
              <p className="text-gray-400 text-sm">Keine Actions in der Queue.</p>
              <p className="text-gray-400 text-xs mt-1">Trigger the queue runner or add companies first.</p>
            </div>
          )}

          {(queue || []).map((action: any, i: number) => (
            <ActionCard key={action.id || i} action={action} index={i} priorityLabels={PRIORITY_LABELS} />
          ))}
        </div>

        {/* Recent signals — 1/3 width */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Neue Signale
          </h2>
          <div className="space-y-2">
            {(recentSignals || []).map((sig: any) => (
              <SignalBadge key={sig.id} signal={sig} />
            ))}
            {!recentSignals?.length && (
              <p className="text-xs text-gray-400 py-4 text-center">Noch keine Signale</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label, value, sub, color = 'text-gray-900'
}: {
  label: string; value: number; sub?: string; color?: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function TimeSelector({ currentMinutes }: { currentMinutes: number }) {
  const options = [15, 30, 60, 90]
  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
      {options.map(min => (
        <a
          key={min}
          href={`/today?minutes=${min}`}
          className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
            currentMinutes === min
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {min}m
        </a>
      ))}
    </div>
  )
}

const SIGNAL_ICONS: Record<string, string> = {
  hiring_acceleration: '🚀',
  commercial_hiring:   '💼',
  recruiter_vacancy:   '🔍',
  repeated_role:       '🔄',
  new_head_of_people:  '👑',
}

function SignalBadge({ signal }: { signal: any }) {
  const icon = SIGNAL_ICONS[signal.signal_type] || '📡'
  const company = signal.companies

  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
      <div className="flex items-start gap-2">
        <span className="text-base mt-0.5">{icon}</span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-900 truncate">{company?.name || '—'}</p>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{signal.reason}</p>
          <div className="flex items-center gap-2 mt-1">
            <div className="h-1 flex-1 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 rounded-full"
                style={{ width: `${signal.strength}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 shrink-0">{signal.strength}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
