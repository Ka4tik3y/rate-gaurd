import type { PendingApproval } from '@/types'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { timeAgo } from '@/lib/format'

export function ApprovalCard({
  approval,
  onApprove,
  onReject,
  busy,
}: {
  approval: PendingApproval
  onApprove: () => void
  onReject: () => void
  busy?: boolean
}) {
  return (
    <div className="rounded-lg border border-warn/40 bg-warn-dim/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium text-fg">{approval.clientId}</span>
            <StatusBadge value="PENDING_APPROVAL" />
          </div>
          <div className="mt-0.5 text-xs text-muted">{approval.detail}</div>
        </div>
        <span className="text-2xs text-faint">{timeAgo(approval.requestedAt)}</span>
      </div>
      <div className="mt-1 text-2xs text-muted">{approval.reason}</div>
      <div className="mt-3 flex gap-2">
        <button className="btn-primary flex-1 text-xs" onClick={onApprove} disabled={busy}>
          Approve
        </button>
        <button className="btn-ghost flex-1 text-xs" onClick={onReject} disabled={busy}>
          Reject
        </button>
      </div>
    </div>
  )
}
