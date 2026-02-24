import XLSX from 'xlsx'

const wb = XLSX.readFile('C:/Users/최석열/Desktop/automation/injection mold/신성오토텍_사출기_사양.xlsx')
const ws = wb.Sheets['사출기 제원표']
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

console.log('=== 전체 행 (raw) ===')
data.forEach((row, i) => {
  console.log(`Row ${i}:`, JSON.stringify(row))
})
