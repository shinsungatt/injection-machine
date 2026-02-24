import XLSX from 'xlsx'

const wb = XLSX.readFile('C:/Users/최석열/Desktop/automation/injection mold/신성오토텍_사출기_사양.xlsx')
const ws = wb.Sheets['사출기 제원표']

// 실제 셀 주소별로 읽기 (병합셀 포함)
console.log('=== 병합셀 정보 ===')
console.log(ws['!merges'] ? JSON.stringify(ws['!merges'], null, 2) : '없음')

console.log('\n=== Row 3 (헤더) 셀별 raw 읽기 ===')
for (let col = 0; col <= 20; col++) {
  const addr = XLSX.utils.encode_cell({ r: 3, c: col })
  const cell = ws[addr]
  if (cell) {
    const colLetter = XLSX.utils.encode_col(col)
    console.log(`${colLetter}${4} (col=${col}):`, JSON.stringify(cell.v))
  }
}

console.log('\n=== 전체 데이터 (컬럼 레터 표시) ===')
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
const header = data[3]
console.log('컬럼 목록:')
header.forEach((h, i) => {
  const letter = XLSX.utils.encode_col(i)
  console.log(`  ${letter}(${i}): ${String(h).replace(/\r\n/g, ' | ')}`)
})

console.log('\n=== 각 설비의 O, P 컬럼 값 ===')
data.slice(4).forEach((row, i) => {
  const name = row[1]
  if (!name) return
  const O = row[14]  // O 열
  const P = row[15]  // P 열
  const G = row[6]   // tie_bar
  const H = row[7]   // 금형두께 범위
  const L = row[11]  // 형체행정거리
  console.log(`${name}: O(shot_PS)=${O} | P(Motor/Heater)=${P} | G(tiebar)=${G} | H(금형두께범위)=${H} | L(데이라이트)=${L}`)
})
