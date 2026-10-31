// Check if on main page to save user name
const isMainPage = window.location.href.includes('sic_menu.alumno')

let table, trs, elements, sorted_elements, userName
let isSortedByMark = true
let useAdjustedMarks = false
let uiContainer = null

// Format numbers: integers without decimals, otherwise use 2 decimals with comma
function fmt(v) {
  if (typeof v !== 'number') v = Number(v)
    if (isNaN(v)) return ''
      return (Math.abs(v - Math.round(v)) < 1e-9) ? `${Math.round(v)}` : `${v.toFixed(2).replace('.', ',')}`
}

if (isMainPage) {
  const userNameElement = document.querySelector('a[name="panel_155"]')
  if (userNameElement) {
    localStorage.setItem('notasUPV_userName', userNameElement.textContent.trim())
  }
} else {
  // Grades page logic
  table = document.querySelector('table')
  trs = [...table.querySelector('tbody').querySelectorAll('tr')]
  ;({ elements, sorted_elements } = getElements())
  userName = localStorage.getItem('notasUPV_userName')

  initGradesPage()
}

function getElements() {
  // Filter out header rows embedded inside tbody
  let validTrs = trs.filter(tr => tr.querySelectorAll('td').length >= 2)

  let extracted = validTrs.map(tr => {
    let tds = tr.querySelectorAll('td')

    // Offset support for cached layouts containing remnant empty/checkbox columns
    let startIndex = 0
    if (tds[0].querySelector('input[type="checkbox"]') || tds[0].style.width === '48px' || tds[0].textContent.trim() === '') {
      startIndex = 1
    }

    let name = tds[startIndex].textContent
    let markStr = tds[startIndex + 1].textContent.replace(',', '.')
    let mark = markStr.startsWith('.') ? '0' + markStr : markStr

    return { name: name.trim(), mark }
  })

  let elements = [...extracted]
  let sorted_elements = [...extracted].sort((a, b) => b.mark - a.mark || a.name.localeCompare(b.name))

  return { elements, sorted_elements }
}

function ensureTableHeader() {
  if (!table) return
    let thead = table.querySelector('thead')
    let headerRow = null

    if (!thead) {
      thead = document.createElement('thead')
      table.insertBefore(thead, table.firstChild)
    }

    headerRow = thead.querySelector('tr')
    if (!headerRow) {
      const th = table.querySelector('tr th')
      if (th) {
        headerRow = th.closest('tr')
        thead.appendChild(headerRow)
      } else {
        headerRow = document.createElement('tr')
        thead.appendChild(headerRow)
      }
    }

    const stats = getStats()
    const needAdjusted = stats && stats.highestPossible && stats.highestPossible !== 10

    // Fully rebuild the header row to accommodate dynamic toggling
    while (headerRow.firstChild) headerRow.removeChild(headerRow.firstChild)

      const nameTh = document.createElement('th')
      nameTh.textContent = 'Nombre'
      const notaTh = document.createElement('th')
      notaTh.textContent = 'Nota'
      notaTh.style.width = '96px'
      notaTh.style.textAlign = 'center'

      headerRow.appendChild(nameTh)
      headerRow.appendChild(notaTh)

      if (needAdjusted) {
        const adjTh = document.createElement('th')
        adjTh.textContent = 'Nota ajustada'
        adjTh.style.width = '96px'
        adjTh.style.textAlign = 'center'
        headerRow.appendChild(adjTh)
      }
}

function changeTable(dataElements) {
  const stats = getStats()
  const hp = stats.highestPossible
  const needsAdjusted = hp && hp !== 10

  const validTrs = trs.filter(tr => tr.querySelectorAll('td').length >= 2)

  validTrs.forEach((tr, i) => {
    const name_td = document.createElement('td')
    name_td.classList.add('alignleft')
    name_td.textContent = dataElements[i].name

    const mark_td = document.createElement('td')
    mark_td.classList.add('alignleft')
    mark_td.textContent = dataElements[i].mark.toString().replace('.', ',')
    mark_td.style.width = '96px'
    mark_td.style.textAlign = 'center'

    if (needsAdjusted) {
      const adjusted_td = document.createElement('td')
      adjusted_td.classList.add('alignleft')
      adjusted_td.style.width = '96px'
      adjusted_td.style.textAlign = 'center'
      const raw = parseFloat(dataElements[i].mark)
      adjusted_td.textContent = isNaN(raw) ? '' : fmt((raw / hp) * 10)
      tr.replaceChildren(name_td, mark_td, adjusted_td)
    } else {
      tr.replaceChildren(name_td, mark_td)
    }

    // Strip legacy highlight states if cached
    tr.style.backgroundColor = ''
    tr.style.fontWeight = ''
  })
}

function getStats() {
  const marks = sorted_elements.map(e => parseFloat(e.mark)).filter(m => !isNaN(m))
  const total = marks.length
  const sum = marks.reduce((a, b) => a + b, 0)
  const average = sum / total
  const stdDev = Math.sqrt(marks.reduce((acc, m) => acc + Math.pow(m - average, 2), 0) / total)

  const maxObserved = marks.length ? Math.max(...marks) : 10

  let highestPossible = 10
  if (useAdjustedMarks) {
    highestPossible = Math.ceil(maxObserved)
  } else {
    highestPossible = Math.max(10, Math.ceil(maxObserved))
  }

  const passThreshold = highestPossible * 0.5
  const sobresalienteThreshold = highestPossible * 0.9

  const underPass = marks.filter(m => m < passThreshold).length
  const mid = marks.filter(m => m >= passThreshold && m < sobresalienteThreshold).length
  const overSob = marks.filter(m => m >= sobresalienteThreshold).length

  let userGrade = null
  let userPosition = null
  if (userName) {
    const userEntry = sorted_elements.find(e => e.name.trim() === userName.trim())
    if (userEntry) {
      userGrade = parseFloat(userEntry.mark)
      userPosition = sorted_elements.findIndex(e => e.name.trim() === userName.trim()) + 1
    }
  }

  const percentile = userPosition ? Math.round((total - userPosition) / total * 100) : null

  return {
    average,
    stdDev,
    highestPossible,
    passThreshold,
    sobresalienteThreshold,
    underPass,
    mid,
    overSob,
    total,
    userGrade,
    userPosition,
    percentile,
    marks
  }
}

function createBellCurveGraph(stats) {
  const width = 300
  const height = 120
  const padding = 20
  const graphWidth = width - padding * 2
  const graphHeight = height - padding * 2

  const { average, stdDev, userGrade, passThreshold, sobresalienteThreshold, highestPossible } = stats
  const minX = 0
  const maxX = (highestPossible && highestPossible > 0) ? highestPossible : 10

  const normalPDF = (x, mean, std) => {
    if (std === 0) return x === mean ? 1 : 0
      return Math.exp(-0.5 * Math.pow((x - mean) / std, 2)) / (std * Math.sqrt(2 * Math.PI))
  }

  const points = []
  const steps = 100
  let maxY = 0
  for (let i = 0; i <= steps; i++) {
    const x = minX + (i / steps) * (maxX - minX)
    const y = normalPDF(x, average, stdDev || 0.5)
    if (y > maxY) maxY = y
      points.push({ x, y })
  }

  const scaleX = x => padding + ((x - minX) / (maxX - minX)) * graphWidth
  const scaleY = y => height - padding - (y / maxY) * graphHeight

  const pathData = points.map((p, i) =>
  `${i === 0 ? 'M' : 'L'} ${scaleX(p.x).toFixed(1)} ${scaleY(p.y).toFixed(1)}`
  ).join(' ')

  const areaPath = pathData + ` L ${scaleX(maxX)} ${height - padding} L ${scaleX(minX)} ${height - padding} Z`

  let userMarker = ''
  if (userGrade !== null) {
    const ux = scaleX(userGrade)
    const uy = scaleY(normalPDF(userGrade, average, stdDev || 0.5))
    userMarker = `
    <line x1="${ux}" y1="${height - padding}" x2="${ux}" y2="${uy}" stroke="#4edfff" stroke-width="2"/>
    <circle cx="${ux}" cy="${uy}" r="4" fill="#4edfff"/>
    `
  }

  const avgX = scaleX(average)
  const avgMarker = `
  <line x1="${avgX}" y1="${height - padding}" x2="${avgX}" y2="${scaleY(normalPDF(average, average, stdDev || 0.5))}" stroke="#666" stroke-width="1" stroke-dasharray="2"/>
  `

  return `
  <svg width="${width}" height="${height}" style="display: block; margin: 10px auto;">
  <line x1="${scaleX(passThreshold)}" y1="${padding}" x2="${scaleX(passThreshold)}" y2="${height - padding}" stroke="#e0e0e0" stroke-width="1" opacity="0.6"/>
  <line x1="${scaleX(sobresalienteThreshold)}" y1="${padding}" x2="${scaleX(sobresalienteThreshold)}" y2="${height - padding}" stroke="#e0e0e0" stroke-width="1" opacity="0.6"/>

  <path d="${areaPath}" fill="#e9e9e9" opacity="0.4"/>

  <path d="${pathData}" fill="none" stroke="#666" stroke-width="2"/>

  ${avgMarker}

  ${userMarker}

  <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#e0e0e0" stroke-width="1"/>

  <text x="${scaleX(0)}" y="${height - 5}" text-anchor="middle" font-size="9" fill="#888">0</text>
  <text x="${scaleX(passThreshold)}" y="${height - 5}" text-anchor="middle" font-size="9" fill="#888">${fmt(passThreshold)}</text>
  <text x="${scaleX(average)}" y="${height - 5}" text-anchor="middle" font-size="9" fill="#777">μ (${average.toFixed(2).replace('.', ',')})</text>
  <text x="${scaleX(sobresalienteThreshold)}" y="${height - 5}" text-anchor="middle" font-size="9" fill="#888">${fmt(sobresalienteThreshold)}</text>
  <text x="${scaleX(maxX)}" y="${height - 5}" text-anchor="middle" font-size="9" fill="#888">${fmt(maxX)}</text>
  </svg>
  `
}

function buildAndDownloadJSON() {
  const subjectEl = document.querySelector('h1.cabpagina')
  const subject = subjectEl ? subjectEl.textContent.trim() : (document.title || 'notas')
  const stats = getStats()
  const students = [...sorted_elements]
  .map(e => ({ name: e.name.trim(), grade: Number(parseFloat(e.mark).toFixed(2)) }))
  .sort((a, b) => a.grade - b.grade)

  const pf = Number(stats.passThreshold.toFixed(2))
  const sf = Number(stats.sobresalienteThreshold.toFixed(2))
  const hp = Number(stats.highestPossible)

  const json = {
    subject: subject,
    average: Number(stats.average.toFixed(2)),
    highestPossible: hp,
    passThreshold: pf,
    sobresalienteThreshold: sf,
    distribution: {
      [`0-${pf}`]: stats.underPass,
      [`${pf}-${sf}`]: stats.mid,
      [`${sf}-${hp}`]: stats.overSob
    },
    students: students
  }

  const filename = subject.replace(/[\\/:*?"<>|]+/g, '').trim() + '.json'
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function renderUI() {
  const stats = getStats()

  let userGradeHTML = ''
  if (stats.userGrade !== null) {
    const gradeColor = stats.userGrade >= stats.sobresalienteThreshold ? '#4CAF50' : stats.userGrade >= stats.passThreshold ? '#2196F3' : '#f44336'
    userGradeHTML = `
    <div style="display:flex; flex-direction:column; align-items:start;">
    <p style="margin:0; padding:0; font-size: 1.2em;">Tu nota:</p>
    <div style="font-size: 5em; font-weight: bold; color: ${gradeColor};">
    ${stats.userGrade.toString().replace('.', ',')}
    </div>
    <div style="color: #666; margin: 8px 0; text-align:left; font-size: 1em;">
    Estás en la posición <strong>${stats.userPosition}</strong> de ${stats.total}
    (top <strong>${100 - stats.percentile}%</strong>)
    </div>
    </div>
    `
  }

  const bellCurveGraph = createBellCurveGraph(stats)

  const total = stats.total || 0
  const pct = n => total ? Math.round((n / total) * 100) : 0

  if (!uiContainer) {
    uiContainer = document.createElement('div')
    table.insertAdjacentElement('beforebegin', uiContainer)
  }

  uiContainer.innerHTML = `
  <div style="text-align: center; margin-bottom: 12px; padding: 12px 24px; background: #f9f9f9; display:flex; flex-direction:row; align-items:center; justify-content:space-between; gap:20px;">
  ${userGradeHTML}
  <div style="display: flex; flex-direction: column; align-items: center; border-left: 1px solid #ddd; padding-left: 20px; margin-left: 20px;">
  ${bellCurveGraph}
  <div style="display: flex; justify-content: center; gap: 20px; margin: 10px 0;">
  <div style="text-align: center;">
  <div style="font-size: 1.3em; font-weight: bold; color: #666;">${stats.average.toFixed(2).replace('.', ',')}</div>
  <div style="font-size: 0.8em; color: #999;">Media</div>
  </div>
  <div style="text-align: center;">
  <div style="display:flex; align-items:center; justify-content:center;"><div style="font-size:1.3em; font-weight:bold; color:#f44336;">${stats.underPass}</div><div style="font-size:1.1em; color:#999; margin-left:6px;"> (${pct(stats.underPass)}%)</div></div>
  <div style="font-size: 0.8em; color: #999;">Suspensos (&lt; ${fmt(stats.passThreshold)})</div>
  </div>
  <div style="text-align: center;">
  <div style="display:flex; align-items:center; justify-content:center;"><div style="font-size:1.3em; font-weight:bold; color:#2196F3;">${stats.mid}</div><div style="font-size:1.1em; color:#999; margin-left:6px;"> (${pct(stats.mid)}%)</div></div>
  <div style="font-size: 0.8em; color: #999;">Aprobados (${fmt(stats.passThreshold)} - ${fmt(stats.sobresalienteThreshold)})</div>
  </div>
  <div style="text-align: center;">
  <div style="display:flex; align-items:center; justify-content:center;"><div style="font-size:1.3em; font-weight:bold; color:#4CAF50;">${stats.overSob}</div><div style="font-size:1.1em; color:#999; margin-left:6px;"> (${pct(stats.overSob)}%)</div></div>
  <div style="font-size: 0.8em; color: #999;">Sobresalientes (≥ ${fmt(stats.sobresalienteThreshold)})</div>
  </div>
  </div>
  </div>
  </div>
  <div style="display:flex; flex-direction:row; justify-content:space-between;margin-top: 10px; align-items: center; gap: 12px; margin: 12px 0;">
  <div style="display: flex; gap: 20px;">
  <label style="color: #666; cursor: pointer; display: flex; align-items: center; font-size: 1em;">
  Ordenar por nota
  <input type="checkbox" id="notas-upv-sort" ${isSortedByMark ? 'checked' : ''} style="margin-left: 6px; transform: scale(1.2); cursor: pointer;">
  </label>
  <label style="color: #666; cursor: pointer; display: flex; align-items: center; font-size: 1em;">
  Calcular notas ajustadas
  <input type="checkbox" id="notas-upv-adjusted" ${useAdjustedMarks ? 'checked' : ''} style="margin-left: 6px; transform: scale(1.2); cursor: pointer;">
  </label>
  </div>
  <div style="display:flex; gap:8px; align-items:center;">
  <button id="notas-upv-download" style="padding:6px 10px; border-radius:4px; border:1px solid #758761; background:#758761; color:white; cursor:pointer; font-size:0.95em;">Descargar JSON</button>
  </div>
  </div>
  `

  // Attach event handlers inside wrapper
  uiContainer.querySelector('#notas-upv-sort').addEventListener('change', function () {
    isSortedByMark = this.checked
    changeTable(isSortedByMark ? sorted_elements : elements)
  })

  uiContainer.querySelector('#notas-upv-adjusted').addEventListener('change', function () {
    useAdjustedMarks = this.checked
    ensureTableHeader() // Re-evaluate header logic based on the state
    renderUI() // Overwrite container dynamically
    changeTable(isSortedByMark ? sorted_elements : elements)
  })

  uiContainer.querySelector('#notas-upv-download').addEventListener('click', function () {
    try {
      buildAndDownloadJSON()
    } catch (err) {
      console.error('Notas UPV: error descargando JSON', err)
    }
  })
}

function modifyCSS() {
  if (window.navigator.userAgent.indexOf('Android') != -1) {
    document.querySelector('#contenido .cabpagina').style.paddingLeft = '10px'
    document.querySelector('#contenido .container').style.marginLeft = '10px'
    document.querySelector('#contenido .container').style.width = '90vw'
  }
}

function initGradesPage() {
  modifyCSS()
  ensureTableHeader()
  renderUI()
  changeTable(isSortedByMark ? sorted_elements : elements)
}
