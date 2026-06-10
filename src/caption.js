const HOOKS = [
  'เห็นแล้วอยากเอาไปใส่เว็บตัวเองเลย 😍',
  'UI แบบนี้แหละที่ทำให้เว็บดูแพง ✨',
  'สาย Frontend ห้ามเลื่อนผ่าน 👀',
  'ดีเทลเล็กๆ ที่ทำให้เว็บดูโปรขึ้นทันที 🔥',
  'อยากได้เอฟเฟกต์แบบนี้บ้างไหม? โค้ดฟรีนะ 👇',
  'งาน UI สวยๆ มีคนทำไว้ให้ใช้ฟรีแล้ว 🙌',
]

const HASHTAGS = [
  '#uidesign', '#webdesign', '#frontend', '#react', '#tailwindcss',
  '#webdev', '#userinterface', '#uiux', '#webdeveloper', '#coding',
  '#programmer', '#developer', '#dailyui', '#designinspiration', '#uianimation',
  '#โปรแกรมเมอร์', '#เขียนโค้ด', '#สายเดฟ',
]

function pick(arr, seed) {
  let h = 7
  for (const c of String(seed)) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0
  return arr[Math.abs(h) % arr.length]
}

export function buildCaption(comp) {
  const author = comp.authorName || comp.authorUsername || 'community author'
  const lines = [
    `✨ "${comp.name}" — UI component สุดเนียนประจำวันนี้`,
    '',
    pick(HOOKS, comp.demoId || comp.name),
    '',
    `🎨 Credit ผลงานโดย: ${author}`,
    `🔗 โค้ดเต็ม + ลองเล่นได้ที่: ${comp.url}`,
    '',
    'ติดตามไว้ มี UI สวยๆ มาให้ดูทุกวัน 🤍',
    '',
    HASHTAGS.join(' '),
  ]
  const caption = lines.join('\n')
  return caption.length > 2150 ? caption.slice(0, 2150) : caption
}
