'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const ACTION_ICONS: Record<string, string> = {
  linkedin_message: '💬',
  email:            '✉️',
  call:             '📞',
  linkedin_comment: '👍',
  intro_request:    '🤝',
  meeting_prep:     '📋',
  follow_up:        '↩️',
  update_crm:       '📝',
  manual_research:  '🔎',
  wait:             '⏳',
}

interface ActionCardProps {
  action: any
  index: number
  priorityLabels: Record<number, { label: string; color: string }>
}

export default function ActionCard({ action, index, priorityLabels }: ActionCardProps) {
  const [done, setDone] = useState(false)
  const [open, setOpen] = useState(false)
  const supabase = createClient()

  const icon = ACTION_ICONS[action.action_type] || '📌'
  const priority = priorityLabels[action.priority] || priorityLabels[5]

  async function markDone() {
    setDone(true)
    if (action.id) {
      await supabase.from('actions').update({ status: 'done', done_at: new Date().toISOString() }).eq('id', action.id)
    }
  }

  async function markSkipped() {
    setDone(true)
    if (action.id) {
      await supabase.from('actions').update({ status: 'skipped' }).eq('id', action.id)
    }
  }

  if (done) {
    return (
      <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 opacity-50">
        <p className="text-sm text-gray-400 line-through">{action.company_name || 'Company'}</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 transition-colors">
      {/* Main row */}
      <div className="px-4 py-3 flex items-start gap-3">
        {/* Priority number */}
        <div className="shrink-0 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 mt-0.5">
          {index + 1}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base">{icon}</span>
            <Link
              href={`/companies/${action.company_id}`}
              className="font-semibold text-gray-900 hover:text-primary-600 transition-colors"
            >
              {action.company_name || '—'}
            </Link>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priority.color}`}>
              {priority.label}
            </span>
            <span className="text-xs text-gray-400">{action.estimated_minutes}m</span>
          </div>

          <p className="text-sm text-gray-600 mt-1">
            {action.action_type.replace(/_/g, ' ')} · {action.reason?.why_now}
          </p>

          {/* Suggested message preview */}
          {action.suggested_message && !open && (
            <button
              onClick={() => setOpen(true)}
              className="text-xs text-primary-600 hover:text-primary-700 mt-1.5"
            >
              Nachricht anzeigen →
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={markSkipped}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-50"
          >
            Skip
          </button>
          <button
            onClick={markDone}
            className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 font-medium"
          >
            Done ✓
          </button>
        </div>
      </div>

      {/* Expanded: suggested message + why reasoning */}
      {open && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
          {action.suggested_message && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">💬 Vorgeschlagene Nachricht</p>
              <div className="bg-white border border-gray-200 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap font-mono text-xs leading-relaxed">
                {action.suggested_message}
              </div>
            </div>
          )}

          {action.reason && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">🧠 Warum jetzt?</p>
              <div className="grid grid-cols-1 gap-1">
                {Object.entries(action.reason as Record<string, string>).map(([key, val]) => (
                  <div key={key} className="flex gap-2 text-xs">
                    <span className="text-gray-400 shrink-0 w-24 capitalize">{key.replace('why_', '')}:</span>
                    <span className="text-gray-700">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => setOpen(false)}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Schließen
          </button>
        </div>
      )}
    </div>
  )
}
