# 🎬 ig-auto-reels

บอทที่**ทำคลิป + โพสต์ลง Instagram Reels ให้อัตโนมัติทุกวัน** โดยไม่ต้องเปิดคอม:

1. เปิดหน้า [21st.dev featured components](https://21st.dev/community/components/featured) แล้วเลือกคอมโพเนนต์ UI สวยๆ ที่ยังไม่เคยโพสต์
2. อัดคลิป demo จริงของคอมโพเนนต์ (1080×1920) พร้อมเคอร์เซอร์ขยับ/คลิก/พิมพ์ให้เห็น interaction จริง
3. ใส่กรอบไตเติ้ล + **การ์ดเครดิตผู้สร้าง** (ชื่อ, avatar, ลิงก์ 21st.dev) แบบ glassmorphism ในตัวคลิป
4. ใส่เพลงประกอบ ambient ที่สังเคราะห์ขึ้นเอง (ปลอดลิขสิทธิ์ 100%) หรือเพลงของคุณเองจาก `assets/music/`
5. โพสต์ขึ้น IG ผ่าน **Official Instagram API** พร้อมแคปชันเครดิต + แฮชแท็ก แล้วจดบันทึกกันโพสต์ซ้ำ

ทั้งหมดรันบน **GitHub Actions ฟรี** ตามตารางเวลา (ค่าเริ่มต้น: ทุกวัน 19:30 เวลาไทย)

---

## ⚙️ ติดตั้งครั้งแรก (~30 นาที ทำครั้งเดียว)

### ขั้นที่ 1 — เปลี่ยนบัญชี IG เป็น Professional (ฟรี)

ในแอป Instagram: **Settings → Account type and tools → Switch to professional account** เลือก Creator หรือ Business ก็ได้
(จำเป็นเพราะ API โพสต์คอนเทนต์ได้เฉพาะบัญชี Professional)

### ขั้นที่ 2 — สร้าง Meta App + ขอ Access Token

1. ไปที่ [developers.facebook.com](https://developers.facebook.com) → ล็อกอินด้วย Facebook → **My Apps → Create App**
2. เลือก use case ที่เกี่ยวกับ **Instagram** (หรือ Other → Business) แล้วสร้างแอป
3. ในแดชบอร์ดของแอป: เมนูซ้าย **Instagram → API setup with Instagram login**
4. ในส่วน *Generate access tokens*: กด **Add account** → ล็อกอินด้วยบัญชี IG ของคุณ → กด **Generate token** → คัดลอกเก็บไว้
   - ใช้กับบัญชีตัวเองได้เลยตอนแอปยังอยู่ใน Development mode **ไม่ต้องผ่าน App Review**
   - token เป็นแบบ long-lived อายุ **60 วัน** (มี workflow ต่ออายุอัตโนมัติให้ ดูด้านล่าง)
5. (ชื่อเมนูอาจต่างเล็กน้อยตามเวอร์ชันแดชบอร์ด — หาคำว่า "Instagram login" + "Generate token")

### ขั้นที่ 3 — ใส่ token ลง GitHub

```bash
gh secret set IG_ACCESS_TOKEN --repo <owner>/ig-auto-reels
# วาง token แล้ว Enter (หรือใส่ผ่านหน้าเว็บ: Settings → Secrets and variables → Actions)
```

ทดสอบว่า token ใช้ได้:

```bash
IG_ACCESS_TOKEN=<token> npm run ig:check
# ✅ token ใช้ได้: @yourname (MEDIA_CREATOR) id=1784...
```

### ขั้นที่ 4 — ทดสอบ + เปิดใช้งาน

```bash
# ทดสอบบนคลาวด์แบบไม่โพสต์จริง (ดาวน์โหลดคลิปจาก Artifacts มาดูได้)
gh workflow run autopost.yml -f dry_run=true

# พอใจแล้ว → โพสต์จริงหนึ่งครั้ง
gh workflow run autopost.yml
```

จากนั้น schedule รายวันจะทำงานเองอัตโนมัติ 🎉

---

## 🖥️ คำสั่งในเครื่อง

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run scrape` | ดูรายชื่อ featured components + ยอดไลก์ |
| `npm run dry` | ทำคลิปเต็มขั้นตอนแต่ไม่โพสต์ — ได้ไฟล์ใน `out/` (ต้องมี ffmpeg: `winget install Gyan.FFmpeg` แล้วระบบหาให้เองอัตโนมัติ) |
| `npm run post` | ทำคลิป + โพสต์จริง |
| `npm run ig:check` | เช็คว่า token ใช้ได้ |
| `npm run token:refresh` | ต่ออายุ token (พิมพ์ token ใหม่ออกมา) |

ตัวแปรปรับแต่ง (ใส่เป็น env หรือ Actions **Variables**): ดู [.env.example](.env.example)
- `BRAND_HANDLE` — โชว์ @handle ของคุณมุมขวาบนของคลิป
- `REC_SECONDS` — ความยาวคลิป (ค่าเริ่มต้น 12 วิ)
- `PICK` — `random` (สุ่มจาก top 12 ที่ยังไม่โพสต์) หรือ `top` (อันดับ 1 เสมอ)
- `SOURCE` — `record` (อัด live demo เอง แนวตั้งเต็มจอ มี interaction, ค่าเริ่มต้น) | `pull` (ใช้วิดีโอ demo สำเร็จรูปจาก CDN วางในการ์ดกลางจอ+พื้นเบลอ เร็วกว่ามาก) | `auto` (pull ถ้ามีไฟล์ ไม่มีก็อัดเอง)
- `FORCE_URL` — บังคับอัดตัวเจาะจง เช่น `https://21st.dev/community/components/aceternity/sparkles/default`

🎵 อยากใช้เพลงตัวเอง: วางไฟล์ `.mp3` ใน `assets/music/` (เลือกเพลงปลอดลิขสิทธิ์เท่านั้น ไม่งั้น IG อาจปิดเสียง/ลบคลิป) — ถ้าโฟลเดอร์ว่าง ระบบจะสังเคราะห์เพลง ambient ให้เอง

---

## 🔁 การต่ออายุ token (60 วัน)

มี workflow [refresh-token.yml](.github/workflows/refresh-token.yml) รันทุกวันที่ 1 ของเดือน:
- ถ้าตั้ง secret **`GH_PAT`** (classic Personal Access Token scope `repo`) ไว้ → ต่ออายุ + อัปเดต secret ให้เองครบวงจร
- ถ้าไม่ตั้ง → ต่ออายุเองด้วย `npm run token:refresh` แล้วเอา token ใหม่ไปอัปเดต secret (อย่าปล่อยเกิน 60 วัน)

---

## 📐 สถาปัตยกรรม

```
src/scrape.js   เปิดหน้า featured → รายชื่อการ์ด (ชื่อ/ผู้สร้าง/ไลก์) → หา bundle URL ของ demo บน cdn.21st.dev
src/record.js   เปิด demo จริงใน headless Chrome 540×960@2x → inject overlay เครดิต + เคอร์เซอร์
                → ขยับเมาส์จริงผ่าน CDP (hover/click/พิมพ์) → จับเฟรม JPEG 1080×1920 ~20-30fps
src/audio.js    สังเคราะห์เพลง lofi/ambient เป็น WAV ด้วยคณิตล้วนๆ (seed ตามคอมโพเนนต์)
src/compose.js  ffmpeg: เฟรม (ffconcat ตาม timestamp จริง) + เสียง → MP4 H.264 30fps + fade
src/caption.js  แคปชันไทย/อังกฤษ + เครดิตผู้สร้าง + แฮชแท็ก
src/post.js     อัปโหลดขึ้น temp host สาธารณะ (tmpfiles → litterbox → catbox)
                → IG API: สร้าง container REELS → รอประมวลผล → publish → ได้ permalink
data/posted.json  รายการที่โพสต์แล้ว (workflow commit กลับเข้า repo กันโพสต์ซ้ำ)
```

ข้อจำกัดของ IG API ที่เกี่ยวข้อง: คลิป 3 วิ – 15 นาที (แนะนำ 5–90 วิ สำหรับ Reels tab), สูงสุด 50 โพสต์/วัน, ใส่เพลงจากคลัง IG ผ่าน API ไม่ได้ (ต้องฝังเสียงมาในไฟล์)

## 🙏 มารยาทเรื่องเครดิต

คลิปทุกตัวให้เครดิตผู้สร้างทั้ง **ในตัวคลิป** (การ์ด Made by + ลิงก์โปรไฟล์ 21st.dev) และ **ในแคปชัน** (ชื่อ + ลิงก์โค้ดเต็ม) ซึ่งช่วยพาคนไปดูผลงานต้นทาง — ถ้าผู้สร้างคนไหนติดต่อขอให้ลบ ควรลบให้ทันที และเพิ่ม demoId ของเขาลง `data/posted.json` เพื่อไม่ให้ระบบหยิบมาอีก
