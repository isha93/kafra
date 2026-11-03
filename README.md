# ⚔️ Kafra

> Kota Ragnarok untuk agent Claude Code lu. Tiap repo jadi kota, tiap agent
> kelihatan lagi bangun apa.

Kafra Corporation melayani adventurer di setiap kota Rune-Midgard — penyimpanan,
teleport, save point. Repo ini melayani agent Claude Code lu di setiap working
directory.

## Kenapa ini ada

Menjalankan beberapa sesi Claude Code sekaligus artinya berpindah-pindah terminal
untuk mencari tahu siapa yang sedang bekerja, siapa yang menunggu jawaban, dan
siapa yang contextnya hampir habis. Kafra menampilkan semuanya sekaligus.

Terinspirasi [Vibecraft](https://vibecraft.sh), tapi dua hal dibuat berbeda:

1. **Fase 1 tidak menyentuh konfigurasi Claude Code sama sekali.** Vibecraft
   memasang hooks sejak awal. Kafra mulai dari membaca file — nol risiko.
2. **Tampilannya Ragnarok Online**, bukan hex grid 3D.

## Temuan yang jadi dasar arsitekturnya

Claude Code menulis setiap sesi ke disk sebagai JSONL:

```
~/.claude/projects/<cwd-yang-di-slug>/<session-id>.jsonl
```

Nama foldernya mengkodekan working directory, jadi nama "map" didapat gratis.
Tiap baris `type: "assistant"` memuat:

| Field | Dipakai sebagai |
|---|---|
| `cwd` | nama map |
| `gitBranch` | lokasi di dalam map |
| `model` | job class |
| `usage.cache_read_input_tokens` + `input_tokens` | **HP bar** |
| `isSidechain` | party member (subagent) |
| `timestamp` | kapan terakhir terlihat |
| `sessionId` | identitas karakter |

Artinya seluruh tampilan read-only bisa dibangun tanpa satu pun hook. Ini
pembeda terpenting dari Vibecraft dan alasan fase 1 aman dicoba.

**Catatan ukuran:** file transcript bisa mencapai 144 MB. Kafra hanya membaca
**ekor** tiap file (256 KB terakhir), bukan keseluruhannya.

## Peta konsep

| Dunia nyata | Kafra City |
|---|---|
| Repo git | **Kota** — Prontera, Geffen, Payon (nama stabil per repo) |
| Folder top-level (`src/`, `web/`) | **Bangunan distrik**, tinggi sesuai jumlah file |
| File belum di-commit | **Scaffolding** di bangunan itu |
| Commit 7 hari terakhir | Bendera di bangunan + **build log** di Kafra |
| Commit baru | Kembang api + "Level Up!" di plaza |
| Sesi Claude Code | Karakter, job class per model |
| Subagent | Party member, muncul di samping leader-nya |
| Sisa context | HP bar |

Apa yang dikerjakan agent menentukan ke mana dia jalan:

| Tool | Aktivitas | Tempat & animasi |
|---|---|---|
| Edit, Write | membangun | Bangunan distrik pemilik file — palu, percikan, bangunan bergetar |
| Read, Grep, Glob | meneliti | Perpustakaan — buku, halaman beterbangan |
| Bash | meracik | Bengkel — labu, asap |
| Bash test | uji coba | Arena — pedang, angka damage; "Miss" merah kalau gagal |
| Bash commit/push | menyetor | Kafra — bawa peti |
| WebSearch, WebFetch | teleport | Warp portal — pilar cahaya |
| Agent | memanggil | Di tempat — lingkaran sihir ungu |
| (berpikir) | casting | Di tempat — lingkaran sihir biru, "…" |
| turn selesai | menunggu | Sekitar plaza — "!" dan "Giliranmu!" |
| diam > 30 menit | istirahat | Penginapan — duduk, "z" |

Aktivitas bersumber dari blok `tool_use` di ekor transcript. Tool yang sudah
selesai tetap ditampilkan sampai tool berikutnya, karena Edit selesai dalam
milidetik — tanpa itu agent hampir selalu terlihat "casting".

## Keamanan

Kafra hanya membaca. Tidak ada hooks, tidak ada tulis ke `~/.claude`, tidak
ada tulis ke repo, tidak ada network call keluar.

- Server bind ke `127.0.0.1` saja.
- Git dipanggil lewat `execFile` (tanpa shell) dengan argumen tetap, dengan
  `GIT_OPTIONAL_LOCKS=0` supaya `git status` tidak mengambil `index.lock`
  dan bentrok dengan agent yang sedang commit, serta `core.fsmonitor=false`
  supaya fsmonitor yang dikonfigurasi repo tidak pernah dijalankan.
- Stats git di-cache 10 detik per repo, berapa pun klien yang terhubung.
- Isi file tidak pernah dibaca — hanya path dan angka.
- Teks yang tampil (quest, perintah, label tool) disaring dari pola yang mirip
  credential (`sk-…`, `ghp_…`, `AKIA…`, `token=…`, JWT).

## Arsitektur

```
src/sources/claude-code.mjs   transcript → agent (kind, tool, file, HP, party)
src/activity.mjs              nama tool → kind; redaksi teks
src/repos.mjs                 git read-only → kota, distrik, commit
src/world.mjs                 gabungkan: satu repo satu kota
src/server.mjs                /api/world/stream (SSE), /api/stream (party window)
web/city/                     PixiJS: layout, art, agent, town, fx, ui,
                              decor, villager, sky, assets, skin
web/assets/                   aset opsional (sprite sheet, bangunan) — lihat README di sana
web/party.html                tampilan tabel (fase 1)
```

Renderer hanya mengenal *kind*, bukan nama tool. Agent lain (Codex, Cursor)
nanti cukup tambah satu file di `src/sources/` yang menghasilkan bentuk agent
yang sama.

## Status

**Fase 1 — Party window read-only.** Selesai → `/party.html`.

**Fase 1.5 — Kafra City (monitoring).** Selesai.
Kota per repo, agent berjalan ke tempat kerjanya, scaffolding, build log,
chat log, panel detail.

**Fase 2 — Interaksi.** Belum dimulai.
Menyetujui tool call dan mengirim pesan. Butuh hooks di
`~/.claude/settings.json` plus tmux.

**Berikutnya:** source agnostic (Codex dulu), replay timeline per kota.

## Jalankan

```bash
npm install     # PixiJS saja
npm start       # http://localhost:4317
npm run demo    # http://localhost:4318 — transcript palsu, semua animasi tampil
npm test
node scripts/gen-assets.mjs   # aset Retro Diffusion — lihat web/assets/README.md
```

Node 20+. Kontrol: drag untuk geser, scroll untuk zoom, klik apa saja untuk
detail, `Tab` untuk lompat antar agent aktif, `Esc` untuk batal pilih.
Kamera mengikuti agent yang dipilih sampai peta digeser. `M` menampilkan
seluruh dunia.

## Dunia

- **Kerajaan = owner GitHub.** Tiap owner punya pulau sendiri; repo tanpa
  remote berkumpul di Tanah Liar. Kota dalam satu kerajaan terhubung jalan.
- **Tingkat kota** (Camp → Village → Town → City → Capital) dihitung dari
  jumlah file, jumlah commit, dan umur repo (`src/growth.mjs`). Tingkat
  menentukan tenda atau rumah, tinggi bangunan, tembok, dan kastil.
- **Wilayah** mengikuti bahasa utama repo: Swift pantai, TypeScript gurun,
  Go/Rust salju, Python hutan, JS/web padang, docs taman bunga.
- **Suasana:** ≥30 commit sebulan berarti ramai; 30 hari tanpa commit berarti
  terbengkalai (suram, ditumbuhi pohon).
- **Party bar** di bawah menampilkan semua agent yang bangun, dengan yang
  menunggumu paling depan. Notifikasi browser dan suara bisa dinyalakan di
  pojok party bar.

`npm run simulate` (port 4319) menjalankan enam kota palsu dengan tingkat
berbeda dan sepuluh agent yang bekerja terus, di folder temp.

Suasana mengikuti keadaan: siang/malam ikut jam lokal, kota hujan selama ada
tool yang gagal. Untuk mengecek tampilan: `?hour=21`, `?weather=rain`,
`?weather=clear`.

## Soal aset

Sprite dan bangunan bisa diganti tanpa mengubah kode — format dan prompt AI-nya
ada di [web/assets/README.md](web/assets/README.md).

Tampilannya **terinspirasi** Ragnarok Online, bukan menyalinnya. Semua sprite,
tileset, dan font asli RO adalah hak cipta Gravity Co., Ltd. Repo ini tidak
memuat satu pun aset milik mereka — yang ada hanya CSS dan bentuk yang digambar
sendiri. Kalau nanti butuh sprite sungguhan, pilihannya pixel art orisinal atau
asset pack berlisensi bebas.
