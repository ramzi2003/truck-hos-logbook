type DutyStatus = 'OFF' | 'SB' | 'D' | 'ON'

export type RemarkEvent = {
  start_iso: string
  end_iso?: string
  type: 'pickup' | 'dropoff' | 'fuel' | 'break' | 'end_of_day' | 'restart' | 'drive'
  location: string
  reason: string
}

type LogbookDay = {
  date: string
  segments: {
    status: DutyStatus
    start_iso: string
    end_iso: string
  }[]
  remark_events?: RemarkEvent[]
}

export type LogbookFormData = {
  from_location?: string
  to_location?: string
  carrier_name?: string
  main_office_address?: string
  home_terminal_address?: string
  truck_numbers?: string
  total_miles_driving_today?: string
  total_mileage_today?: string
  dvl_or_manifest_no?: string
  shipper_and_commodity?: string
  /** 70 hour / 8 day or 60 hour / 7 day cycle – controls which recap section is filled on the sheet */
  hours_cycle?: '70' | '60'
  /** Staying in Sleeper Berth? yes or no */
  ending_shift_location?: 'yes' | 'no'
  /** At what time (when ending shift location is sleeper berth) */
  sleeper_berth_time?: string
}

export type RecapValues = {
  /** On duty hours today (Total lines 3 & 4) */
  onDutyToday: number
  /** 70 Hour / 8 Day: A = total on duty last 7 days including today */
  seventyA: number
  /** 70 Hour / 8 Day: B = hours available tomorrow (70 - A) */
  seventyB: number
  /** 70 Hour / 8 Day: C = total on duty last 8 days including today */
  seventyC: number
  /** 60 Hour / 7 Day: A = total on duty last 5 days including today */
  sixtyA: number
  /** 60 Hour / 7 Day: B = hours available tomorrow (60 - A) */
  sixtyB: number
  /** 60 Hour / 7 Day: C = total on duty last 7 days including today */
  sixtyC: number
}

type LogbookSheetProps = {
  /** Optional: show date in the header. */
  dateText?: string
  /** Optional: HOS log for this day – used to draw duty segments on the grid. */
  log?: LogbookDay
  /** Optional: handwritten‑style form data to print on the sheet. */
  formData?: LogbookFormData
  /** Optional: recap calculations (on duty today, 70hr/8day A/B/C, 60hr/7day A/B/C). */
  recapValues?: RecapValues
}

// Paper-style template, now with optional HOS overlay.
export function LogbookSheet({ dateText, log, formData, recapValues }: LogbookSheetProps) {
  // US Letter-ish aspect ratio in a convenient coordinate system
  const W = 850
  const H = 1100

  const pad = 22
  // Keep a single canonical left margin for all primary text
  const titleX = pad + 6
  const stroke = '#111'
  const thin = 1
  const thick = 2
  // Shift the date (month/day/year) block left to avoid overlapping the notes.
  const dateShiftX = -220

  // Info boxes (above the grid, like the paper form)
  // Make container narrower with more margin
  const contentMargin = 40
  const contentX = pad + contentMargin
  const contentW = W - pad * 2 - contentMargin * 2

  // Push the info section down to give the From/To lines more breathing room.
  const infoY = 142
  // Slightly taller so the truck/trailer label doesn't collide with borders below.
  const infoH = 104

  // Main duty grid
  const gridX = contentX
  // Add extra breathing room between the top info section and the duty chart.
  const gridY = infoY + infoH + 50
  // Make the duty table slightly wider while keeping the page margins comfortable.
  const gridW = contentW - 35 // was 55; a little wider, still leaves room for “Total Hours”
  const totalColW = 55

  // Duty chart should be a bit shorter with a small left margin inside the full grid width.
  // Make it start a little closer to the left edge (wider from the left side).
  const dutyGridLeftMargin = 30 // was effectively 40 before – now slightly closer to the left
  const dutyGridW = gridW - dutyGridLeftMargin
  const dutyGridX = gridX + dutyGridLeftMargin
  // Shift the "Total Hours" column a bit to the right of the main grid.
  const dutyTotalColOffset = 15
  const dutyTotalColX = dutyGridX + dutyGridW + dutyTotalColOffset
  const dutyHourW = dutyGridW / 24

  // Header band inside the chart (black bar with hour labels)
  const headerH = 55 // 2.5x the original 22
  // Make each cell in the duty grid roughly square:
  // row height equals column width (dutyHourW).
  const rowH = dutyHourW
  const gridBodyH = rowH * 4
  const gridH = headerH + gridBodyH
  const gridBodyY = gridY + headerH

  // 24h scale across gridW (used by sections below, not the duty chart)
  const _hourW = gridW / 24

  // Vertical offset so the whole logbook content sits a bit lower on the page.
  const topOffset = 24

  // Parse a usable date from either the log day or the provided dateText.
  const dateSource = log?.date ?? dateText
  let dateMonth: string | null = null
  let dateDay: string | null = null
  let dateYear: string | null = null

  if (dateSource) {
    const d = new Date(dateSource)
    if (!Number.isNaN(d.getTime())) {
      dateMonth = String(d.getUTCMonth() + 1).padStart(2, '0')
      dateDay = String(d.getUTCDate()).padStart(2, '0')
      dateYear = String(d.getUTCFullYear())
    }
  }

  const form = formData ?? {}

   // Remarks time bar
  const remarksTimeY = gridY + gridH + 44
  const remarksTimeH = 38
  // Sections below
  // Make the remarks box much shorter so the Shipping section sits higher on the page.
  const remarksBoxY = remarksTimeY + remarksTimeH + 4
  const remarksBoxH = 80

  // Shipping + instruction line live inside a single box (paper form style)
  // Keep this block close to Remarks but leave extra blank space above its text,
  // and plenty of blank space after "Shipper & Commodity".
  const shippingBoxY = remarksBoxY + remarksBoxH - 120
  const shippingBoxH = 230

  // Recap section with a bit more bottom margin below Shipping so they don't overlap.
  const recapY = shippingBoxY + shippingBoxH + 24
  const _recapH = 170

  // No “bottom extra” section in the paper form screenshot (those boxes are at the top),
  // so we don’t draw a separate bottom block.

  function hourLabel(h: number) {
    if (h === 0) return 'Midnight'
    if (h === 12) return 'Noon'
    if (h < 12) return String(h)
    return String(h - 12)
  }

  // Chart time: use the time-as-written from the ISO string (00 GMT convention).
  // Parse "YYYY-MM-DDTHH:mm:ss" so 07:00 → 7, 11:00 → 11. No timezone conversion.
  // Form "At what time?" is 24h (11 = 11 AM) and matches this.
  function isoToHoursSinceMidnight(iso: string) {
    const match = /T(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?/.exec(iso)
    if (!match) {
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return 0
      return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600
    }
    const h = parseInt(match[1], 10)
    const m = parseInt(match[2], 10)
    const s = parseInt(match[3] ?? "0", 10)
    return h + m / 60 + s / 3600
  }

  function statusToRowIndex(status: DutyStatus): number {
    switch (status) {
      case 'OFF':
        return 0
      case 'SB':
        return 1
      case 'D':
        return 2
      case 'ON':
        return 3
      default:
        return 0
    }
  }

  // Pre-compute total hours spent in each duty status so the "Total Hours"
  // column can be populated automatically from the duty table, including the
  // synthetic OFF-duty stretches before the first segment and after the last.
  const totalsByStatus: Record<DutyStatus, number> = {
    OFF: 0,
    SB: 0,
    D: 0,
    ON: 0,
  }
  if (log && log.segments.length) {
    // Totals should reflect the sleeper-berth end-of-day override:
    // - truncate any duty segments past sbTime
    // - count OFF only up to sbTime
    // - count SB from sbTime to 24:00
    const sleeperBerthActiveForTotals =
      (form.ending_shift_location ?? 'no') === 'yes' &&
      typeof form.sleeper_berth_time === 'string' &&
      form.sleeper_berth_time.trim() !== ''
    let sbTimeHForTotals = 24
    if (sleeperBerthActiveForTotals) {
      const t = (form.sleeper_berth_time ?? '').trim()
      const [h, m] = t.split(':').map(Number)
      const hh = Number.isNaN(h) ? 0 : h
      const mm = Number.isNaN(m) ? 0 : m
      sbTimeHForTotals = Math.max(0, Math.min(24, hh + mm / 60))
    }

    // Work in hours-since-midnight space to match the grid drawing.
    const segments = [...log.segments].map((seg) => ({
      ...seg,
      startH: isoToHoursSinceMidnight(seg.start_iso),
      endH: isoToHoursSinceMidnight(seg.end_iso),
    }))
    segments.sort((a, b) => a.startH - b.startH)

    let prevEnd = 0
    for (const seg of segments) {
      let start = Math.max(0, Math.min(24, seg.startH))
      let end = Math.max(0, Math.min(24, seg.endH))

      // If sleeper berth is active, anything after sbTime becomes SB (not the original segment).
      if (sleeperBerthActiveForTotals) {
        if (start >= sbTimeHForTotals) continue
        end = Math.min(end, sbTimeHForTotals)
      }
      if (end <= start) continue

      // Any gap before this segment is OFF duty.
      if (start > prevEnd) {
        totalsByStatus.OFF += start - prevEnd
      }

      totalsByStatus[seg.status] += end - start
      prevEnd = Math.max(prevEnd, end)
    }

    if (sleeperBerthActiveForTotals) {
      // OFF duty after the last segment only up to sbTime, then SB to midnight.
      if (prevEnd < sbTimeHForTotals) totalsByStatus.OFF += sbTimeHForTotals - prevEnd
      if (sbTimeHForTotals < 24) totalsByStatus.SB += 24 - sbTimeHForTotals
    } else {
      // OFF duty after the last segment until midnight.
      if (prevEnd < 24) {
        totalsByStatus.OFF += 24 - prevEnd
      }
    }
  }
  const totalStatusOrder: DutyStatus[] = ['OFF', 'SB', 'D', 'ON']
  const totalHoursSum =
    totalsByStatus.OFF + totalsByStatus.SB + totalsByStatus.D + totalsByStatus.ON

  // Sleeper berth end-of-day: when driver chooses "Staying in Sleeper Berth?" Yes and a time,
  // from that time to midnight we draw SB. The "duty -> Off Duty" vertical is always at last segment end.
  const sleeperBerthActive =
    (form.ending_shift_location ?? 'no') === 'yes' &&
    typeof form.sleeper_berth_time === 'string' &&
    form.sleeper_berth_time.trim() !== ''
  let sbTimeH: number = 0
  if (sleeperBerthActive) {
    // Parse "At what time?" as 24h: "11:00" = 11 (11 AM), "23:00" = 23 (11 PM). End of day = 24.
    const t = form.sleeper_berth_time!.trim()
    const [h, m] = t.split(':').map(Number)
    sbTimeH = (Number.isNaN(h) ? 0 : h) + (Number.isNaN(m) ? 0 : m) / 60
    sbTimeH = Math.max(0, Math.min(24, sbTimeH))
  }

  return (
    <svg
      className="logbook-sheet"
      viewBox={`0 0 ${W} ${H}`}
      width="8.5in"
      height="11in"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Drivers Daily Log sheet"
    >
      <g transform={`translate(0, ${topOffset})`}>
      {/* Header */}
      <text x={titleX} y={pad + 28} fontSize={28} fontWeight={700} fill={stroke}>
        Drivers Daily Log
      </text>
      <text x={pad + 60} y={pad + 50} fontSize={12} fill={stroke}>
        (24 hours)
      </text>

      {/* Date blanks - aligned horizontally with title - all equal size */}
      {(() => {
        const dateLineY = pad + 32
        const dateLabelY = pad + 48
        const dateLineW = 40 // Equal width for all three
        const dateGap = 12 // Gap between lines and slashes
        
        // Calculate positions from right to left
        const yearX2 = W - pad - 120 + dateShiftX
        const yearX1 = yearX2 - dateLineW
        const slash2X = yearX1 - dateGap
        
        const dayX2 = slash2X - dateGap
        const dayX1 = dayX2 - dateLineW
        const slash1X = dayX1 - dateGap
        
        const monthX2 = slash1X - dateGap
        const monthX1 = monthX2 - dateLineW
        
        // Center positions for labels
        const monthCenter = monthX1 + dateLineW / 2
        const dayCenter = dayX1 + dateLineW / 2
        const yearCenter = yearX1 + dateLineW / 2
        
        return (
          <>
            <line x1={monthX1} y1={dateLineY} x2={monthX2} y2={dateLineY} stroke={stroke} strokeWidth={thin} />
            <line x1={dayX1} y1={dateLineY} x2={dayX2} y2={dateLineY} stroke={stroke} strokeWidth={thin} />
            <line x1={yearX1} y1={dateLineY} x2={yearX2} y2={dateLineY} stroke={stroke} strokeWidth={thin} />
            <text x={slash1X} y={pad + 28} fontSize={12} fill={stroke}>
              /
            </text>
            <text x={slash2X} y={pad + 28} fontSize={12} fill={stroke}>
              /
            </text>
            <text x={monthCenter} y={dateLabelY} fontSize={10} fill={stroke} textAnchor="middle">
              (month)
            </text>
            <text x={dayCenter} y={dateLabelY} fontSize={10} fill={stroke} textAnchor="middle">
              (day)
            </text>
            <text x={yearCenter} y={dateLabelY} fontSize={10} fill={stroke} textAnchor="middle">
              (year)
            </text>
            {/* Actual date values written into the blanks when available */}
            {dateMonth && dateDay && dateYear && (
              <>
                <text x={monthCenter} y={dateLineY - 2} fontSize={11} fill={stroke} textAnchor="middle">
                  {dateMonth}
                </text>
                <text x={dayCenter} y={dateLineY - 2} fontSize={11} fill={stroke} textAnchor="middle">
                  {dateDay}
                </text>
                <text x={yearCenter} y={dateLineY - 2} fontSize={11} fill={stroke} textAnchor="middle">
                  {dateYear}
                </text>
              </>
            )}
          </>
        )
      })()}

      {/* Right header notes - aligned horizontally with date fields */}
      <text x={W - pad - 320} y={pad + 28} fontSize={10} fill={stroke}>
        Original - File at home terminal.
      </text>
      <text x={W - pad - 320} y={pad + 42} fontSize={10} fill={stroke}>
        Duplicate - Driver retains in his/her possession for 8 days.
      </text>

      {/* From/To - label sits on top of the underline (like paper form) */}
      {(() => {
        const lineY = 110
        const leftX = contentX
        const midX = contentX + contentW / 2
        const rightX = contentX + contentW

        // Text positioned above the line
        const textY = lineY - 4
        const valueY = lineY - 6

        return (
          <>
            {/* Underlines - full length */}
            <line x1={leftX} y1={lineY} x2={midX - 20} y2={lineY} stroke={stroke} strokeWidth={thin} />
            <line x1={midX + 10} y1={lineY} x2={rightX - 20} y2={lineY} stroke={stroke} strokeWidth={thin} />

            {/* "From:" positioned above the line */}
            <text x={leftX + 6} y={textY} fontSize={14} fontWeight={600} fill={stroke}>
              From:
            </text>

            {/* "To:" positioned above the line */}
            <text x={midX + 16} y={textY} fontSize={14} fontWeight={600} fill={stroke}>
              To:
            </text>

            {/* Filled values for From/To (driver's handwriting replacement),
                shifted to the right so they don't overlap the labels. */}
            {form.from_location && (
              <text
                x={leftX + 70}
                y={valueY}
                fontSize={11}
                fill={stroke}
              >
                {form.from_location}
              </text>
            )}
            {form.to_location && (
              <text
                x={midX + 60}
                y={valueY}
                fontSize={11}
                fill={stroke}
              >
                {form.to_location}
              </text>
            )}
          </>
        )
      })()}

      {/* Top info boxes (like the paper form) */}
      <g>
        {(() => {
          // Layout split: left 40% (boxes) / right 60% (lines) with larger gap between
          const leftW = contentW * 0.4
          const gap = 38
          const leftX = contentX
          const rightX = contentX + leftW + gap
          const rightW = contentW - leftW - gap

          // Left two small boxes across the left 40%
          const innerGap = 24
          const boxW = (leftW - innerGap) / 2
          const boxH = 34

          const box1X = leftX
          const box2X = leftX + boxW + innerGap

          // Truck/trailer box spans the full left column
          const truckBoxY = infoY + 58
          const truckBoxW = leftW

          // Right-side lines occupy the right 60%
          const rightPad = 10
          const lineX1 = rightX + rightPad
          const lineX2 = rightX + rightW - rightPad
          const midLineX = (lineX1 + lineX2) / 2

          return (
            <>
              {/* left two small boxes */}
              <rect x={box1X} y={infoY} width={boxW} height={boxH} fill="none" stroke={stroke} strokeWidth={thin} />
              <rect x={box2X} y={infoY} width={boxW} height={boxH} fill="none" stroke={stroke} strokeWidth={thin} />

              {/* Text labels BELOW the boxes, centered under each */}
              <text x={box1X + boxW / 2} y={infoY + 50} fontSize={10} fill={stroke} textAnchor="middle">
                Total Miles Driving Today
              </text>
              <text x={box2X + boxW / 2} y={infoY + 50} fontSize={10} fill={stroke} textAnchor="middle">
                Total Mileage Today
              </text>

              {/* Values inside the small boxes – right-aligned and vertically centered */}
              {form.total_miles_driving_today && (
                <text
                  x={box1X + boxW - 62}
                  y={infoY + boxH / 2 + 4}
                  fontSize={11}
                  fill={stroke}
                  textAnchor="end"
                >
                  {form.total_miles_driving_today}
                </text>
              )}
              {form.total_mileage_today && (
                <text
                  x={box2X + boxW - 62}
                  y={infoY + boxH / 2 + 4}
                  fontSize={11}
                  fill={stroke}
                  textAnchor="end"
                >
                  {form.total_mileage_today}
                </text>
              )}

              {/* right side - lines with text BELOW and CENTERED */}
              <line x1={lineX1} y1={infoY + 18} x2={lineX2} y2={infoY + 18} stroke={stroke} strokeWidth={thin} />
              <text x={midLineX} y={infoY + 30} fontSize={10} fill={stroke} textAnchor="middle">
                Name of Carrier or Carriers
              </text>

              <line x1={lineX1} y1={infoY + 54} x2={lineX2} y2={infoY + 54} stroke={stroke} strokeWidth={thin} />
              <text x={midLineX} y={infoY + 66} fontSize={10} fill={stroke} textAnchor="middle">
                Main Office Address
              </text>

              <line x1={lineX1} y1={infoY + 92} x2={lineX2} y2={infoY + 92} stroke={stroke} strokeWidth={thin} />
              <text x={midLineX} y={infoY + 104} fontSize={10} fill={stroke} textAnchor="middle">
                Home Terminal Address
              </text>

              {/* Values on the right‑hand lines */}
              {form.carrier_name && (
                <text
                  x={lineX1 + 4}
                  y={infoY + 16}
                  fontSize={11}
                  fill={stroke}
                >
                  {form.carrier_name}
                </text>
              )}
              {form.main_office_address && (
                <text
                  x={lineX1 + 4}
                  y={infoY + 52}
                  fontSize={11}
                  fill={stroke}
                >
                  {form.main_office_address}
                </text>
              )}
              {form.home_terminal_address && (
                <text
                  x={lineX1 + 4}
                  y={infoY + 90}
                  fontSize={11}
                  fill={stroke}
                >
                  {form.home_terminal_address}
                </text>
              )}

              {/* truck / trailer wide box - text BELOW, not inside */}
              <rect x={leftX} y={truckBoxY} width={truckBoxW} height={boxH} fill="none" stroke={stroke} strokeWidth={thin} />
              <text x={leftX + truckBoxW / 2} y={infoY + 104} fontSize={10} fill={stroke} textAnchor="middle">
                Truck/Tractor and Trailer Numbers or
              </text>
              <text x={leftX + truckBoxW / 2} y={infoY + 118} fontSize={10} fill={stroke} textAnchor="middle">
                License Plates/State (show each unit)
              </text>

              {/* Truck / trailer numbers text */}
              {form.truck_numbers && (
                <text
                  x={leftX + 6}
                  y={truckBoxY + 22}
                  fontSize={11}
                  fill={stroke}
                >
                  {form.truck_numbers}
                </text>
              )}
            </>
          )
        })()}
      </g>

      {/* Duty chart (match paper form style) */}
      {(() => {
        // Give the left-side labels some space, but never push drawing off-page (negative X).
        // (Earlier we extended left too far which clipped the design.)
        const desiredLabelColW = 70
        const maxLeftExtension = Math.max(0, gridX - pad - 6)
        const labelColW = Math.min(desiredLabelColW, maxLeftExtension)

        // Header extends slightly left but stays within the page.
        // Make it a bit wider to the RIGHT so "Total Hours" isn't hugging the edge.
        const headerInset = 4 // spacing from left, keep as before
        const headerExtraRight = 20 // extend header further to the right
        const headerX = dutyGridX - labelColW + headerInset
        const headerW = dutyGridW + totalColW + labelColW - headerInset * 2 + headerExtraRight

        // Left-side duty labels should start at the main page text margin (not next to the grid).
        // Use the same left margin as the rest of the form content.
        // Align the left-side duty labels with the main title ("Drivers Daily Log")
        // so all major text starts on the same vertical line.
        const labelX = titleX

        return (
          <>
            {/* Black header band spans through Total Hours */}
            <rect x={headerX} y={gridY} width={headerW} height={headerH} fill="#111" />

            {/* Midnight labels at both ends (stacked, aligned to bottom of header) */}
            {(() => {
              const headerTextSize = 10
              // Bottom of header is the white divider line at gridBodyY.
              // Place text just above it so it doesn't overlap.
              const headerLine2Y = gridBodyY - 4
              const headerLine1Y = headerLine2Y - 14

              const leftMidX = headerX + 8
              // Nudge the right-side "Midnight" a bit to the right so it visually groups with "Total Hours"
              const rightMidX = dutyGridX + dutyGridW - 10

              return (
                <>
                  <text x={leftMidX} y={headerLine1Y} fontSize={headerTextSize} fill="#fff">
                    Mid-
                  </text>
                  <text x={leftMidX} y={headerLine2Y} fontSize={headerTextSize} fill="#fff">
                    night
                  </text>

                  <text x={rightMidX} y={headerLine1Y} fontSize={headerTextSize} fill="#fff">
                    Mid-
                  </text>
                  <text x={rightMidX} y={headerLine2Y} fontSize={headerTextSize} fill="#fff">
                    night
                  </text>
                </>
              )
            })()}

            {/* Total Hours label inside the black header, pulled left so it isn't stuck to the border */}
            <text x={dutyTotalColX + 10} y={gridBodyY - 18} fontSize={10} fontWeight={700} fill="#fff">
              Total
            </text>
            <text x={dutyTotalColX + 10} y={gridBodyY - 4} fontSize={10} fontWeight={700} fill="#fff">
              Hours
            </text>

            {/* Body row lines (ONLY across the chart; Total Hours column has no borders) */}
            {Array.from({ length: 5 }).map((_, i) => (
              <line
                key={i}
                x1={dutyGridX}
                y1={gridBodyY + i * rowH}
                x2={dutyGridX + dutyGridW}
                y2={gridBodyY + i * rowH}
                stroke={stroke}
                strokeWidth={thin}
              />
            ))}

            {/* Left labels outside the chart, aligned within each row's vertical space */}
            {(() => {
              const row0Top = gridBodyY + rowH * 0
              const row1Top = gridBodyY + rowH * 1
              const row2Top = gridBodyY + rowH * 2
              const row3Top = gridBodyY + rowH * 3

              const singleLineYOffset = rowH * 0.55 // roughly middle of the row
              const firstLineYOffset = rowH * 0.35
              const secondLineYOffset = rowH * 0.7

              return (
                <>
                  {/* Row 1: single line, centered in row */}
                  <text x={labelX} y={row0Top + singleLineYOffset} fontSize={10} fill={stroke}>
                    1. Off Duty
                  </text>

                  {/* Row 2: two lines ("2. Sleeper" + "Berth") both within row 2 */}
                  <text x={labelX} y={row1Top + firstLineYOffset} fontSize={10} fill={stroke}>
                    2. Sleeper
                  </text>
                  <text x={labelX + 16} y={row1Top + secondLineYOffset} fontSize={10} fill={stroke}>
                    Berth
                  </text>

                  {/* Row 3: single line, centered */}
                  <text x={labelX} y={row2Top + singleLineYOffset} fontSize={10} fill={stroke}>
                    3. Driving
                  </text>

                  {/* Row 4: two lines ("4. On Duty" + "(not driving)") both within row 4 */}
                  <text x={labelX} y={row3Top + firstLineYOffset} fontSize={10} fill={stroke}>
                    4. On Duty
                  </text>
                  <text x={labelX} y={row3Top + secondLineYOffset} fontSize={10} fill={stroke}>
                    (not driving)
                  </text>
                </>
              )
            })()}
          </>
        )
      })()}

      {/* Time labels across top of main grid */}
      {Array.from({ length: 25 }).map((_, h) => {
        const x = dutyGridX + h * dutyHourW
        return (
          <g key={h}>
            {/* Vertical grid lines only in the chart body – same thickness and color as horizontal lines */}
            <line x1={x} y1={gridBodyY} x2={x} y2={gridY + gridH} stroke={stroke} strokeWidth={thin} />
            {h > 0 && h < 24 ? (
              <>
                {/* Hour labels centered exactly on the vertical grid line */}
                <text
                  x={x}
                  y={gridBodyY - 2}
                  fontSize={9}
                  fill="#fff"
                  textAnchor="middle"
                  dominantBaseline="ideographic"
                >
                  {hourLabel(h)}
                </text>
              </>
            ) : null}
          </g>
        )
      })}

      {/* Per-cell tick marks inside the duty grid.
          In each cell: 3 vertical lines.
          - Center line: 60% of row height
          - Side lines: 30% of row height
          - For rows 0 and 1: lines drop down from the top border
          - For rows 2 and 3: lines rise up from the bottom border */}
      {Array.from({ length: 24 }).map((_, col) => {
        const cellLeft = dutyGridX + col * dutyHourW
        const centerX = cellLeft + dutyHourW / 2
        const sideOffset = dutyHourW / 4
        const leftX = centerX - sideOffset
        const rightX = centerX + sideOffset

        return (
          <g key={col}>
            {Array.from({ length: 4 }).map((_, row) => {
              const cellTop = gridBodyY + row * rowH
              const cellBottom = cellTop + rowH

              const longLen = rowH * 0.6
              const shortLen = rowH * 0.3

              const fromTop = row < 2

              const centerY1 = fromTop ? cellTop : cellBottom - longLen
              const centerY2 = fromTop ? cellTop + longLen : cellBottom

              const sideY1 = fromTop ? cellTop : cellBottom - shortLen
              const sideY2 = fromTop ? cellTop + shortLen : cellBottom

              return (
                <g key={row}>
                  {/* Center (longer) line */}
                  <line
                    x1={centerX}
                    y1={centerY1}
                    x2={centerX}
                    y2={centerY2}
                    stroke={stroke}
                    strokeWidth={0.8}
                    opacity={0.55}
                  />
                  {/* Left (shorter) line */}
                  <line
                    x1={leftX}
                    y1={sideY1}
                    x2={leftX}
                    y2={sideY2}
                    stroke={stroke}
                    strokeWidth={0.8}
                    opacity={0.35}
                  />
                  {/* Right (shorter) line */}
                  <line
                    x1={rightX}
                    y1={sideY1}
                    x2={rightX}
                    y2={sideY2}
                    stroke={stroke}
                    strokeWidth={0.8}
                    opacity={0.35}
                  />
                </g>
              )
            })}
          </g>
        )
      })}

      {/* Planned duty segments overlay from the trip plan.
          Each segment is drawn as a horizontal line in the appropriate duty row,
          with a point at the start time (e.g. On Duty at 07:00, Driving at 08:00).
          Additionally, we draw an OFF‑duty line from midnight to the first segment
          start, with a point at that first start time and a vertical connector
          up/down to the first duty status row. */}
      {log && (
        <g className="duty-overlay">
          {/* Synthetic OFF‑duty before first work segment (truncate at sbTime when staying in sleeper berth) */}
          {(() => {
            if (!log.segments.length) return null

            // Find segment with earliest start time.
            let firstSeg = log.segments[0]
            let firstStart = isoToHoursSinceMidnight(firstSeg.start_iso) || 0
            for (const seg of log.segments) {
              const h = isoToHoursSinceMidnight(seg.start_iso) || 0
              if (h < firstStart) {
                firstStart = h
                firstSeg = seg
              }
            }

            if (!(firstStart > 0)) return null

            // When driver chose sleeper berth at a time, don't draw OFF past that time.
            const endCap = sleeperBerthActive && firstStart > sbTimeH ? sbTimeH : firstStart
            const clampedEnd = Math.max(0, Math.min(24, endCap))
            if (clampedEnd <= 0) return null

            const offY = gridBodyY + statusToRowIndex('OFF') * rowH + rowH / 2
            const firstStatusY =
              gridBodyY + statusToRowIndex(firstSeg.status) * rowH + rowH / 2
            const x1 = dutyGridX
            const x2 = dutyGridX + clampedEnd * dutyHourW

            return (
              <g>
                {/* OFF duty from midnight to first start (or to sbTime when sleeper berth active) */}
                <line x1={x1} y1={offY} x2={x2} y2={offY} stroke={stroke} strokeWidth={2} />
                {/* Vertical connector from OFF row to first duty row (only when first start is before sbTime) */}
                {!sleeperBerthActive || firstStart <= sbTimeH ? (
                  <line x1={x2} y1={offY} x2={x2} y2={firstStatusY} stroke={stroke} strokeWidth={2} />
                ) : null}
                {/* Point at first start time on OFF row */}
                <circle cx={x2} cy={offY} r={1} fill={stroke} />
              </g>
            )
          })()}

          {/* Actual HOS segments from the plan (truncate at sleeper berth time when active) */}
          {log.segments.map((seg, idx) => {
            const rowIndex = statusToRowIndex(seg.status)
            const startH = isoToHoursSinceMidnight(seg.start_iso)
            let endH = isoToHoursSinceMidnight(seg.end_iso)

            // When driver chose "Staying in Sleeper Berth" at a time, don't draw past that time.
            if (sleeperBerthActive && endH > sbTimeH) endH = sbTimeH

            // Clamp to the visible 24‑hour window.
            const clampedStart = Math.max(0, Math.min(24, startH))
            const clampedEnd = Math.max(0, Math.min(24, endH))

            if (clampedEnd <= 0 || clampedStart >= 24 || clampedEnd <= clampedStart) {
              return null
            }

            const y = gridBodyY + rowIndex * rowH + rowH / 2
            const x1 = dutyGridX + clampedStart * dutyHourW
            const x2 = dutyGridX + clampedEnd * dutyHourW

            return (
              <g key={idx}>
                {/* Horizontal duty line */}
                <line x1={x1} y1={y} x2={x2} y2={y} stroke={stroke} strokeWidth={2} />
                {/* Points at segment start and end (e.g. On Duty at 07:00, Driving at 08:00) */}
                <circle cx={x1} cy={y} r={1} fill={stroke} />
                <circle cx={x2} cy={y} r={1} fill={stroke} />
              </g>
            )
          })}

          {/* Vertical connectors wherever two segment points share the same time (e.g. ON → D). */}
          {log.segments.map((seg, idx) => {
            if (idx === 0) return null
            const prev = log.segments[idx - 1]
            const changeTime = isoToHoursSinceMidnight(seg.start_iso)
            const prevEnd = isoToHoursSinceMidnight(prev.end_iso)

            // Only connect when previous segment ends exactly when the next one starts.
            if (Math.abs(changeTime - prevEnd) > 1e-6) return null

            const clamped = Math.max(0, Math.min(24, changeTime))
            if (clamped <= 0 || clamped >= 24) return null

            const x = dutyGridX + clamped * dutyHourW
            const y1 = gridBodyY + statusToRowIndex(prev.status) * rowH + rowH / 2
            const y2 = gridBodyY + statusToRowIndex(seg.status) * rowH + rowH / 2

            return <line key={`v-${idx}`} x1={x} y1={y1} x2={x} y2={y2} stroke={stroke} strokeWidth={2} />
          })}

          {/* End-of-day: vertical from last duty status to Off Duty at LAST SEGMENT END (same place as when sleeper berth No).
              Then either OFF to midnight (No sleeper berth) or OFF horizontal to sbTime, vertical OFF->SB at sbTime, SB to midnight (Yes sleeper berth). */}
          {(() => {
            if (!log.segments.length) return null

            // Always use last segment end for the "duty -> Off Duty" vertical so it aligns with where the duty line actually ends.
            let lastSeg = log.segments[0]
            let lastEnd = isoToHoursSinceMidnight(lastSeg.end_iso) || 0
            for (const seg of log.segments) {
              const h = isoToHoursSinceMidnight(seg.end_iso) || 0
              if (h > lastEnd) {
                lastEnd = h
                lastSeg = seg
              }
            }
            if (!(lastEnd < 24 && lastEnd > 0)) return null
            const clampedEnd = Math.max(0, Math.min(24, lastEnd))
            if (clampedEnd <= 0 || clampedEnd >= 24) return null

            const transitionX = dutyGridX + clampedEnd * dutyHourW
            const transitionFromStatus = lastSeg.status
            const offY = gridBodyY + statusToRowIndex('OFF') * rowH + rowH / 2
            const fromStatusY = gridBodyY + statusToRowIndex(transitionFromStatus) * rowH + rowH / 2
            const xEnd = dutyGridX + 24 * dutyHourW

            // When sleeper berth Yes: OFF->SB vertical and SB horizontal are at sbTime (not at last segment end).
            const sbTimeX = sleeperBerthActive && sbTimeH > 0 && sbTimeH < 24
              ? dutyGridX + sbTimeH * dutyHourW
              : transitionX

            return (
              <g key="end-of-day">
                {/* Vertical from last duty status to Off Duty at last segment end (same as No sleeper berth). */}
                {transitionFromStatus !== 'OFF' && (
                  <line
                    x1={transitionX}
                    y1={fromStatusY}
                    x2={transitionX}
                    y2={offY}
                    stroke={stroke}
                    strokeWidth={2}
                  />
                )}
                <circle cx={transitionX} cy={offY} r={1} fill={stroke} />

                {sleeperBerthActive && sbTimeH > 0 && sbTimeH < 24 ? (
                  <>
                    {/* Horizontal OFF from last segment end to sleeper berth time (when last end is before sbTime). */}
                    {lastEnd < sbTimeH && (
                      <line
                        x1={transitionX}
                        y1={offY}
                        x2={sbTimeX}
                        y2={offY}
                        stroke={stroke}
                        strokeWidth={2}
                      />
                    )}
                    {/* Vertical Off Duty -> Sleeper Berth at sbTime */}
                    <line
                      x1={sbTimeX}
                      y1={offY}
                      x2={sbTimeX}
                      y2={gridBodyY + statusToRowIndex('SB') * rowH + rowH / 2}
                      stroke={stroke}
                      strokeWidth={2}
                    />
                    {/* Sleeper Berth from sbTime to midnight */}
                    <circle
                      cx={sbTimeX}
                      cy={gridBodyY + statusToRowIndex('SB') * rowH + rowH / 2}
                      r={1}
                      fill={stroke}
                    />
                    <line
                      x1={sbTimeX}
                      y1={gridBodyY + statusToRowIndex('SB') * rowH + rowH / 2}
                      x2={xEnd}
                      y2={gridBodyY + statusToRowIndex('SB') * rowH + rowH / 2}
                      stroke={stroke}
                      strokeWidth={2}
                    />
                    <circle
                      cx={xEnd}
                      cy={gridBodyY + statusToRowIndex('SB') * rowH + rowH / 2}
                      r={1}
                      fill={stroke}
                    />
                  </>
                ) : (
                  <>
                    {/* OFF duty from transition time to midnight */}
                    <line x1={transitionX} y1={offY} x2={xEnd} y2={offY} stroke={stroke} strokeWidth={2} />
                    <circle cx={xEnd} cy={offY} r={1} fill={stroke} />
                  </>
                )}
              </g>
            )
          })()}
        </g>
      )}

      {/* Total hours column – blank lines plus auto-calculated totals from the duty table */}
      {Array.from({ length: 4 }).map((_, i) => {
        const rowLineY = gridBodyY + rowH * (i + 1)
        const centerY = gridBodyY + rowH * i + rowH / 2
        const totalStatus = totalStatusOrder[i]
        const totalHours = totalsByStatus[totalStatus]
        // Always show a value (including 0.0) so rows like Sleeper Berth
        // display "0.0" instead of appearing empty.
        const totalText = totalHours.toFixed(1)
        return (
          <g key={i}>
            <line
              x1={dutyTotalColX + 8}
              y1={rowLineY}
              x2={dutyTotalColX + totalColW - 8}
              y2={rowLineY}
              stroke={stroke}
              strokeWidth={thin}
            />
            <text
              x={dutyTotalColX + totalColW - 10}
              y={centerY + 4}
              fontSize={11}
              fill={stroke}
              textAnchor="end"
            >
              {totalText}
            </text>
          </g>
        )
      })}

      {/* Short vertical lines below the table for each remark: start (and end if same day); connect at bottom; 45° line left-down from bottom of start; location on top side at beginning of 45° (city, state only) */}
      {log?.remark_events &&
        log.remark_events.length > 0 &&
        (() => {
          const baseY = gridY + gridH + 6
          const lineH = 10
          const diagLen = 55
          const diagD = diagLen / Math.SQRT2
          const locationLabel = (loc: string) => {
            const parts = loc.split(',').map((s) => s.trim()).filter(Boolean)
            if (parts.length > 2) return parts.slice(0, -1).join(', ')
            return loc
          }
          return (
            <g>
              {log.remark_events.map((ev, i) => {
                const startHour = isoToHoursSinceMidnight(ev.start_iso)
                const startX = dutyGridX + (startHour / 24) * dutyGridW
                const bottomY = baseY + lineH
                const hasEndSameDay =
                  ev.end_iso != null &&
                  ev.end_iso !== '' &&
                  (() => {
                    const endDateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(ev.end_iso)
                    return !log?.date || !endDateMatch?.[1] || endDateMatch[1] === log.date
                  })()
                const endX =
                  hasEndSameDay && ev.end_iso
                    ? dutyGridX + (isoToHoursSinceMidnight(ev.end_iso) / 24) * dutyGridW
                    : null
                const drawEnd = hasEndSameDay && endX != null && Math.abs(endX - startX) >= 1
                const locText = ev.location ? locationLabel(ev.location) : ''
                const locX = startX - 4
                const locY = bottomY - 4
                // Reason (Pickup, Break, etc.) on the below side of the 45° line
                const midX = startX - diagD / 2
                const midY = bottomY + diagD / 2
                const reasonOff = 14
                const reasonX = midX - 8
                const reasonY = midY + reasonOff
                const reasonText = ev.reason ?? ''
                return (
                  <g key={i}>
                    <line x1={startX} y1={baseY} x2={startX} y2={bottomY} stroke={stroke} strokeWidth={thin} />
                    <line x1={startX} y1={bottomY} x2={startX - diagD} y2={bottomY + diagD} stroke={stroke} strokeWidth={thin} />
                    {locText && (
                      <text
                        x={locX}
                        y={locY}
                        fontSize={8}
                        fill={stroke}
                        fontWeight={600}
                        textAnchor="end"
                        dominantBaseline="auto"
                        transform={`rotate(-45 ${locX} ${locY})`}
                      >
                        {locText}
                      </text>
                    )}
                    {reasonText && (
                      <text
                        x={reasonX}
                        y={reasonY}
                        fontSize={7}
                        fill={stroke}
                        fontWeight={600}
                        textAnchor="start"
                        dominantBaseline="hanging"
                        transform={`rotate(-45 ${reasonX} ${reasonY})`}
                      >
                        {reasonText}
                      </text>
                    )}
                    {drawEnd && (
                      <>
                        <line x1={endX} y1={baseY} x2={endX} y2={bottomY} stroke={stroke} strokeWidth={thin} />
                        <line x1={startX} y1={bottomY} x2={endX} y2={bottomY} stroke={stroke} strokeWidth={thin} />
                      </>
                    )}
                  </g>
                )
              })}
            </g>
          )
        })()}

      {/* Remarks label with double underline (no time table here); sum of Total Hours above the double underline */}
      {(() => {
        // Align "Remarks" text with "Shipping Documents" text
        const labelX = pad + 14
        const labelY = remarksTimeY - 10
        // Underlines have the same width as the Total Hours lines
        const underlineStartX = dutyTotalColX + 8
        const underlineEndX = dutyTotalColX + totalColW - 8
        const line1Y = labelY + 3
        const line2Y = labelY + 8

        return (
          <>
            <text x={labelX} y={labelY} fontSize={12} fontWeight={600} fill={stroke}>
              Remarks
            </text>
            {/* Sum of driving + on duty hours, slightly left and down from total; circled in red */}
            <circle
              cx={dutyTotalColX + totalColW - 84}
              cy={line1Y + 20}
              r={17}
              fill="none"
              stroke="red"
              strokeWidth={1.5}
            />
            <text
              x={dutyTotalColX + totalColW - 84}
              y={line1Y + 20}
              fontSize={11}
              fill={stroke}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {(totalsByStatus.D + totalsByStatus.ON).toFixed(1)}
            </text>
            {/* Sum of above Total Hours in the double-underlined space */}
            <text
              x={dutyTotalColX + totalColW - 10}
              y={line1Y - 4}
              fontSize={11}
              fill={stroke}
              textAnchor="end"
            >
              {totalHoursSum.toFixed(1)}
            </text>
            <line x1={underlineStartX} y1={line1Y} x2={underlineEndX} y2={line1Y} stroke={stroke} strokeWidth={thin} />
            <line x1={underlineStartX} y1={line2Y} x2={underlineEndX} y2={line2Y} stroke={stroke} strokeWidth={thin} />
          </>
        )
      })()}

      {/* Shipping documents section styled like reference: bold left border and bottom bars */}
      <line
        x1={pad + 6}
        y1={shippingBoxY}
        x2={pad + 6}
        y2={shippingBoxY + shippingBoxH}
        stroke={stroke}
        strokeWidth={thick}
      />
      <text x={pad + 14} y={shippingBoxY + 70} fontSize={12} fontWeight={700} fill={stroke}>
        Shipping
      </text>
      <text x={pad + 14} y={shippingBoxY + 86} fontSize={12} fontWeight={700} fill={stroke}>
        Documents:
      </text>
      {/* Shorter first underline with label below it */}
      <line
        x1={pad + 14}
        y1={shippingBoxY + 118}
        x2={pad + 154}
        y2={shippingBoxY + 118}
        stroke={stroke}
        strokeWidth={thin}
      />
      {form.dvl_or_manifest_no && (
        <text x={pad + 16} y={shippingBoxY + 112} fontSize={11} fill={stroke}>
          {form.dvl_or_manifest_no}
        </text>
      )}
      <text x={pad + 14} y={shippingBoxY + 132} fontSize={10} fill={stroke}>
        DVL or Manifest No.
      </text>
      <text x={pad + 14} y={shippingBoxY + 153} fontSize={10} fill={stroke}>
        or
      </text>
      {/* Shorter second underline with label below it */}
      <line
        x1={pad + 14}
        y1={shippingBoxY + 168}
        x2={pad + 154}
        y2={shippingBoxY + 168}
        stroke={stroke}
        strokeWidth={thin}
      />
      {form.shipper_and_commodity && (
        <text x={pad + 16} y={shippingBoxY + 162} fontSize={11} fill={stroke}>
          {form.shipper_and_commodity}
        </text>
      )}
      <text x={pad + 14} y={shippingBoxY + 182} fontSize={10} fill={stroke}>
        Shipper &amp; Commodity
      </text>

      {/* Instruction text centered in the gap between the bottom bold bars */}
      {(() => {
        // Center of the full shipping width
        const centerX = gridX + (gridW + totalColW) / 2
        // Half-width of the gap under the instruction text (smaller = narrower gap)
        const gapHalfW = 100

        const bottomY = shippingBoxY + shippingBoxH
        const leftBarStartX = pad + 6
        const leftBarEndX = centerX - gapHalfW
        const rightBarStartX = centerX + gapHalfW
        const rightBarEndX = gridX + gridW + totalColW

        return (
          <>
            <text x={centerX} y={bottomY - 24} fontSize={10} fill={stroke} textAnchor="middle">
              Enter name of place you reported and where released from work and when and where each change of duty occurred.
            </text>
            <text x={centerX} y={bottomY - 10} fontSize={10} fill={stroke} textAnchor="middle">
              Use time standard of home terminal.
            </text>

            {/* Bottom bold bars left and right of the centered instruction text */}
            <line
              x1={leftBarStartX}
              y1={bottomY}
              x2={leftBarEndX}
              y2={bottomY}
              stroke={stroke}
              strokeWidth={thick}
            />
            <line
              x1={rightBarStartX}
              y1={bottomY}
              x2={rightBarEndX}
              y2={bottomY}
              stroke={stroke}
              strokeWidth={thick}
            />
          </>
        )
      })()}

      {/* Recap section (no outer border), aligned with Shipping Documents text */}
      <text x={pad + 14} y={recapY + 20} fontSize={11} fill={stroke}>
        Recap:
      </text>
      <text x={pad + 14} y={recapY + 36} fontSize={10} fill={stroke}>
        complete at
      </text>
      <text x={pad + 14} y={recapY + 50} fontSize={10} fill={stroke}>
        end of day
      </text>

      {/* Recap grid columns - kept neatly between the 70 Hour / 8 Day and 60 Hour / 7 Day headers */}
      {(() => {
        // Start just to the right of the "On duty hours" text block
        const recapX = gridX + 110
        // Width is constrained further so the rightmost C column does not sit under the 60 Hour / 7 Day header
        const recapW = gridW + totalColW - 260
        const colW = recapW / 7
        return (
          <>
            {/* Top labels */}
            <text x={recapX + colW * 0 + 6} y={recapY + 20} fontSize={10} fill={stroke}>
              70 Hour /
            </text>
            <text x={recapX + colW * 0 + 10} y={recapY + 34} fontSize={10} fill={stroke}>
              8 Day
            </text>
            <text x={recapX + colW * 0 + 8} y={recapY + 48} fontSize={10} fill={stroke}>
              Drivers
            </text>

            {/* 60 Hour / 7 Day header positioned over the next recap column to the right of the 70-hour block */}
            <text x={recapX + colW * 4 + 6} y={recapY + 20} fontSize={10} fill={stroke}>
              60 Hour /
            </text>
            <text x={recapX + colW * 4 + 10} y={recapY + 34} fontSize={10} fill={stroke}>
              7 Day
            </text>
            <text x={recapX + colW * 4 + 8} y={recapY + 48} fontSize={10} fill={stroke}>
              Drivers
            </text>

            {/* "*If you took 34" header shifted one more column to the right */}
            <text x={recapX + colW * 8 + 6} y={recapY + 20} fontSize={10} fill={stroke}>
              *If you took
            </text>
            {/* Align "34" with the same left edge as the other header lines */}
            <text x={recapX + colW * 8 + 6} y={recapY + 34} fontSize={10} fill={stroke}>
              34
            </text>

            {/* Column headings A/B/C – sit just ABOVE the top border lines.
                First three (A, B, C) are for the 70-hour block.
                Last three (A, B, C) are for the 60-hour block and need to be shifted one column to the right. */}
            {(['A.', 'B.', 'C.', 'A.', 'B.', 'C.'] as const).map((t, idx) => {
              const isRightBlock = idx >= 3
              const colIndex = isRightBlock ? idx + 2 : idx + 1 // shift right block one extra column
              return (
                <text key={t + idx} x={recapX + colW * colIndex + 6} y={recapY + 46} fontSize={10} fill={stroke}>
                  {t}
                </text>
              )
            })}

            {/* Recap calculated values – always 70 hour / 8 day cycle */}
            {recapValues && (
              <>
                <text x={recapX + colW * 1.5} y={recapY + 46} fontSize={10} fill={stroke} textAnchor="middle">
                  {recapValues.seventyA.toFixed(1)}
                </text>
                <text x={recapX + colW * 2.5} y={recapY + 46} fontSize={10} fill={stroke} textAnchor="middle">
                  {recapValues.seventyB.toFixed(1)}
                </text>
                <text x={recapX + colW * 3.5} y={recapY + 46} fontSize={10} fill={stroke} textAnchor="middle">
                  {recapValues.seventyC.toFixed(1)}
                </text>
              </>
            )}

            {/* Left small label just to the right of Recap, with a top border */}
            {/* Top border aligned with the other recap column borders */}
            <line
              x1={pad + 80}
              y1={recapY + 50}
              x2={pad + 150}
              y2={recapY + 50}
              stroke={stroke}
              strokeWidth={thin}
            />
            {/* On duty hours today (Total lines 3 & 4) – value above the line */}
            <text x={pad + 115} y={recapY + 46} fontSize={10} fill={stroke} textAnchor="middle">
              {(recapValues?.onDutyToday ?? (totalsByStatus.D + totalsByStatus.ON)).toFixed(1)}
            </text>
            {/* Evenly spaced lines, pulled up closer to the top border */}
            <text x={pad + 84} y={recapY + 62} fontSize={10} fill={stroke}>
              On duty
            </text>
            <text x={pad + 84} y={recapY + 76} fontSize={10} fill={stroke}>
              hours
            </text>
            <text x={pad + 84} y={recapY + 90} fontSize={10} fill={stroke}>
              today,
            </text>
            <text x={pad + 84} y={recapY + 104} fontSize={10} fill={stroke}>
              Total lines
            </text>
            <text x={pad + 84} y={recapY + 118} fontSize={10} fill={stroke}>
              3 &amp; 4
            </text>

            {/* Descriptions in columns */}
            {/* First data column under 70 Hour / 8 Day – styled like the "On duty" block */}
            <line
              x1={recapX + colW * 1 + 2}
              y1={recapY + 50}
              x2={recapX + colW * 2 - 2}
              y2={recapY + 50}
              stroke={stroke}
              strokeWidth={thin}
            />
            <text x={recapX + colW * 1 + 6} y={recapY + 62} fontSize={9} fill={stroke}>
              A. Total
            </text>
            <text x={recapX + colW * 1 + 6} y={recapY + 76} fontSize={9} fill={stroke}>
              hours on
            </text>
            <text x={recapX + colW * 1 + 6} y={recapY + 90} fontSize={9} fill={stroke}>
              duty last 7
            </text>
            <text x={recapX + colW * 1 + 6} y={recapY + 104} fontSize={9} fill={stroke}>
              days
            </text>
            <text x={recapX + colW * 1 + 6} y={recapY + 118} fontSize={9} fill={stroke}>
              including
            </text>
            <text x={recapX + colW * 1 + 6} y={recapY + 132} fontSize={9} fill={stroke}>
              today.
            </text>

            {/* Second data column under 70 Hour / 8 Day – styled like the "On duty" block */}
            <line
              x1={recapX + colW * 2 + 2}
              y1={recapY + 50}
              x2={recapX + colW * 3 - 2}
              y2={recapY + 50}
              stroke={stroke}
              strokeWidth={thin}
            />
            <text x={recapX + colW * 2 + 6} y={recapY + 62} fontSize={9} fill={stroke}>
              B. Total
            </text>
            <text x={recapX + colW * 2 + 6} y={recapY + 76} fontSize={9} fill={stroke}>
              hours
            </text>
            <text x={recapX + colW * 2 + 6} y={recapY + 90} fontSize={9} fill={stroke}>
              available
            </text>
            <text x={recapX + colW * 2 + 6} y={recapY + 104} fontSize={9} fill={stroke}>
              tomorrow
            </text>
            <text x={recapX + colW * 2 + 6} y={recapY + 118} fontSize={9} fill={stroke}>
              70 hr.
            </text>
            <text x={recapX + colW * 2 + 6} y={recapY + 132} fontSize={9} fill={stroke}>
              minus A*
            </text>

            {/* First data column under 60 Hour / 7 Day – styled like the "On duty" block */}
            <line
              x1={recapX + colW * 3 + 2}
              y1={recapY + 50}
              x2={recapX + colW * 4 - 2}
              y2={recapY + 50}
              stroke={stroke}
              strokeWidth={thin}
            />
            <text x={recapX + colW * 3 + 6} y={recapY + 62} fontSize={9} fill={stroke}>
              C. Total
            </text>
            <text x={recapX + colW * 3 + 6} y={recapY + 76} fontSize={9} fill={stroke}>
              hours on
            </text>
            <text x={recapX + colW * 3 + 6} y={recapY + 90} fontSize={9} fill={stroke}>
              duty last 8
            </text>
            <text x={recapX + colW * 3 + 6} y={recapY + 104} fontSize={9} fill={stroke}>
              days
            </text>
            <text x={recapX + colW * 3 + 6} y={recapY + 118} fontSize={9} fill={stroke}>
              including
            </text>
            <text x={recapX + colW * 3 + 6} y={recapY + 132} fontSize={9} fill={stroke}>
              today.
            </text>

            {/* Second block (60 Hour / 7 Day) – add matching top borders for A/B/C just like the first block */}
            <line
              x1={recapX + colW * 5 + 2}
              y1={recapY + 50}
              x2={recapX + colW * 6 - 2}
              y2={recapY + 50}
              stroke={stroke}
              strokeWidth={thin}
            />
            <line
              x1={recapX + colW * 6 + 2}
              y1={recapY + 50}
              x2={recapX + colW * 7 - 2}
              y2={recapY + 50}
              stroke={stroke}
              strokeWidth={thin}
            />
            <line
              x1={recapX + colW * 7 + 2}
              y1={recapY + 50}
              x2={recapX + colW * 8 - 2}
              y2={recapY + 50}
              stroke={stroke}
              strokeWidth={thin}
            />

            {/* Shift this A column one step to the right, and prefix with "A." like the first block */}
            {/* Use the same vertical line positions as the first A/B/C block for perfect horizontal alignment */}
            <text x={recapX + colW * 5 + 6} y={recapY + 62} fontSize={9} fill={stroke}>
              A. Total
            </text>
            <text x={recapX + colW * 5 + 6} y={recapY + 76} fontSize={9} fill={stroke}>
              hours on
            </text>
            <text x={recapX + colW * 5 + 6} y={recapY + 90} fontSize={9} fill={stroke}>
              duty last 5
            </text>
            <text x={recapX + colW * 5 + 6} y={recapY + 104} fontSize={9} fill={stroke}>
              days
            </text>
            <text x={recapX + colW * 5 + 6} y={recapY + 118} fontSize={9} fill={stroke}>
              including
            </text>
            <text x={recapX + colW * 5 + 6} y={recapY + 132} fontSize={9} fill={stroke}>
              today.
            </text>

            {/* Shift this B column one step to the right as well, and prefix with "B." like the first block */}
            <text x={recapX + colW * 6 + 6} y={recapY + 62} fontSize={9} fill={stroke}>
              B. Total
            </text>
            <text x={recapX + colW * 6 + 6} y={recapY + 76} fontSize={9} fill={stroke}>
              hours
            </text>
            <text x={recapX + colW * 6 + 6} y={recapY + 90} fontSize={9} fill={stroke}>
              available
            </text>
            <text x={recapX + colW * 6 + 6} y={recapY + 104} fontSize={9} fill={stroke}>
              tomorrow
            </text>
            <text x={recapX + colW * 6 + 6} y={recapY + 118} fontSize={9} fill={stroke}>
              60 hr.
            </text>
            <text x={recapX + colW * 6 + 6} y={recapY + 132} fontSize={9} fill={stroke}>
              minus A*
            </text>

            {/* Final C column under "*If you took 34" – shift one column to the right to avoid overlap */}
            <text x={recapX + colW * 7 + 6} y={recapY + 62} fontSize={9} fill={stroke}>
              Total
            </text>
            <text x={recapX + colW * 7 + 6} y={recapY + 76} fontSize={9} fill={stroke}>
              hours on
            </text>
            <text x={recapX + colW * 7 + 6} y={recapY + 90} fontSize={9} fill={stroke}>
              duty last 7
            </text>
            <text x={recapX + colW * 7 + 6} y={recapY + 104} fontSize={9} fill={stroke}>
              days
            </text>
            <text x={recapX + colW * 7 + 6} y={recapY + 118} fontSize={9} fill={stroke}>
              including
            </text>
            <text x={recapX + colW * 7 + 6} y={recapY + 132} fontSize={9} fill={stroke}>
              today.
            </text>

            {/* Continuation text for "*If you took 34" – same style as header, immediately following the 34 line */}
            <text x={recapX + colW * 8 + 6} y={recapY + 48} fontSize={9} fill={stroke}>
              consecutive
            </text>
            <text x={recapX + colW * 8 + 6} y={recapY + 62} fontSize={9} fill={stroke}>
              hours off
            </text>
            <text x={recapX + colW * 8 + 6} y={recapY + 76} fontSize={9} fill={stroke}>
              duty you
            </text>
            <text x={recapX + colW * 8 + 6} y={recapY + 90} fontSize={9} fill={stroke}>
              have 60/70
            </text>
            <text x={recapX + colW * 8 + 6} y={recapY + 104} fontSize={9} fill={stroke}>
              hours
            </text>
            <text x={recapX + colW * 8 + 6} y={recapY + 118} fontSize={9} fill={stroke}>
              available
            </text>
          </>
        )
      })()}
      </g>
    </svg>
  )
}

