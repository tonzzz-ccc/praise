// A small Excel (.xlsx) writer, so reports download as real workbooks without a library.
// An .xlsx file is a zip of XML parts; this writes them uncompressed (zip "stored" entries).
//
// downloadWorkbook('report.xlsx', [
//   { name: 'Summary', columns: [{ header: 'Award', width: 40 }, { header: 'Grant', width: 14, format: 'money' }],
//     rows: [['Dangal', 5000]], boldRows: [3] },
// ])
// Cells can be strings, numbers, null, or { value, format } for a one-off format. A format can be
// 'money' (#,##0.00), 'integer', or 'text' (the default).

const encoder = new TextEncoder()

const escapeXml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Control characters other than tab, newline and carriage return are not allowed in XML.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

function columnLetter(index) {
  let letter = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) letter = String.fromCharCode(65 + ((n - 1) % 26)) + letter
  return letter
}

// Style ids from styles.xml below: 0 normal, 1 bold, 2 money, 3 bold money, 4 integer, 5 bold integer.
const STYLE = { text: [0, 1], money: [2, 3], integer: [4, 5] }

function sheetXml({ columns, rows, boldRows = [] }) {
  const bold = new Set([0, ...boldRows])
  const all = [columns.map((column) => column.header), ...rows]
  const body = all
    .map((row, r) => {
      const cells = row
        .map((cell, c) => {
          // A cell can also be { value, format } to override its column's format.
          const isObject = cell !== null && typeof cell === 'object'
          const value = isObject ? cell.value : cell
          const format = (isObject && cell.format) || columns[c]?.format || 'text'
          if (value === null || value === undefined || value === '') return ''
          const ref = `${columnLetter(c)}${r + 1}`
          const isBold = bold.has(r) ? 1 : 0
          if (typeof value === 'number' && Number.isFinite(value) && r > 0) {
            const style = STYLE[format][isBold]
            return `<c r="${ref}" s="${style}"><v>${value}</v></c>`
          }
          return `<c r="${ref}" s="${STYLE.text[isBold]}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
        })
        .join('')
      return `<row r="${r + 1}">${cells}</row>`
    })
    .join('')
  const widths = columns.map((column, c) => `<col min="${c + 1}" max="${c + 1}" width="${column.width ?? 14}" customWidth="1"/>`).join('')
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${widths}</cols><sheetData>${body}</sheetData></worksheet>`
  )
}

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="6">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
  '<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="1" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
  '</cellXfs></styleSheet>'

// Excel sheet names: at most 31 characters, none of : \ / ? * [ ]
const sheetName = (name) =>
  String(name)
    .replace(/[:\\/?*[\]]/g, ' ')
    .slice(0, 31)

function workbookParts(sheets) {
  const parts = {
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('') +
      '</Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>',
    'xl/workbook.xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map((sheet, i) => `<sheet name="${escapeXml(sheetName(sheet.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      '</Relationships>',
    'xl/styles.xml': STYLES_XML,
  }
  sheets.forEach((sheet, i) => {
    parts[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(sheet)
  })
  return parts
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// A zip archive with every file "stored" (no compression).
function zip(files) {
  const chunks = []
  const central = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = encoder.encode(name)
    const data = encoder.encode(text)
    const crc = crc32(data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // UTF-8 names
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, data.length, true)
    local.setUint16(26, nameBytes.length, true)
    chunks.push(new Uint8Array(local.buffer), nameBytes, data)

    const entry = new DataView(new ArrayBuffer(46))
    entry.setUint32(0, 0x02014b50, true)
    entry.setUint16(4, 20, true)
    entry.setUint16(6, 20, true)
    entry.setUint16(8, 0x0800, true)
    entry.setUint32(16, crc, true)
    entry.setUint32(20, data.length, true)
    entry.setUint32(24, data.length, true)
    entry.setUint16(28, nameBytes.length, true)
    entry.setUint32(42, offset, true)
    central.push(new Uint8Array(entry.buffer), nameBytes)
    offset += 30 + nameBytes.length + data.length
  }
  const centralSize = central.reduce((size, chunk) => size + chunk.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, Object.keys(files).length, true)
  end.setUint16(10, Object.keys(files).length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export function buildWorkbook(sheets) {
  return zip(workbookParts(sheets))
}

export function downloadWorkbook(fileName, sheets) {
  const url = URL.createObjectURL(buildWorkbook(sheets))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
