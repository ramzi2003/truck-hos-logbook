type DutySegment = {
  status: 'OFF' | 'SB' | 'D' | 'ON'
  start_iso: string
  end_iso: string
}

type DailyLog = {
  date: string
  segments: DutySegment[]
}

type HosLogProps = {
  log: DailyLog
}

const STATUS_Y = {
  OFF: 10,
  SB: 40,
  D: 70,
  ON: 100,
}

export function HosLog({ log }: HosLogProps) {
  const width = 600
  const height = 120

  function timeToX(date: Date) {
    const h = date.getHours() + date.getMinutes() / 60
    return (h / 24) * width
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="hos-log">
      {/* Grid lines */}
      {[0, 6, 12, 18, 24].map((h) => (
        <line
          key={h}
          x1={(h / 24) * width}
          y1={0}
          x2={(h / 24) * width}
          y2={height}
          stroke="#e2e8f0"
          strokeWidth={1}
        />
      ))}
      {/* Status labels */}
      {(['OFF', 'SB', 'D', 'ON'] as const).map((status) => (
        <text key={status} x={4} y={STATUS_Y[status]} fontSize={10} fill="#64748b">
          {status}
        </text>
      ))}

      {/* Segments */}
      {log.segments.map((seg, idx) => {
        const start = new Date(seg.start_iso)
        const end = new Date(seg.end_iso)
        const x1 = timeToX(start)
        const x2 = timeToX(end)
        const y = STATUS_Y[seg.status]
        return (
          <line
            key={idx}
            x1={x1}
            y1={y}
            x2={x2}
            y2={y}
            stroke="#0f766e"
            strokeWidth={4}
            strokeLinecap="round"
          />
        )
      })}

      <text
        x={width - 8}
        y={14}
        fontSize={10}
        textAnchor="end"
        fill="#0f172a"
      >
        {log.date}
      </text>
    </svg>
  )
}

