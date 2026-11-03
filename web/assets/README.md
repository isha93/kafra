# Aset Kafra City

Semua yang ada di sini **opsional**. Key yang tidak terdaftar di `manifest.json`
tetap memakai gambar bawaan dari kode, jadi aset bisa masuk satu per satu.

**Aturan keras:** tidak boleh ada sprite, tileset, atau gambar asli Ragnarok
Online, termasuk hasil AI yang dipancing dengan nama karakter atau aset RO.
Gaya boleh mirip (chibi 2.5D, warna hangat); isinya harus orisinal.

## manifest.json

```json
{
  "characters": {
    "knight": { "sheet": "characters/knight.json", "scale": 1, "anchor": [0.5, 1] }
  },
  "buildings": {
    "district-1": { "image": "buildings/district-1.png", "scale": 1, "anchor": [0.5, 0.86] },
    "library":    { "image": "buildings/library.png",    "scale": 1, "anchor": [0.5, 0.9] }
  }
}
```

- `anchor` adalah titik gambar yang menempel ke tanah, tepat di tengah footprint
  (0–1, relatif terhadap lebar dan tinggi gambar).
- `scale` dipakai kalau gambar dibuat lebih besar dari ukuran target.

## Karakter

Key: `knight`, `assassin`, `hunter`, `bard`, `novice`, `kafra`, `villager1`,
`villager2`, `villager3`.

- **Ukuran frame:** 32×48 px (karakter ±24×40, sisanya ruang untuk senjata).
- **Format:** sprite sheet PNG + JSON. Export dari Aseprite dengan
  *File → Export Sprite Sheet → JSON Hash*, centang **Tags**. Atau pakai
  format TexturePacker dengan field `animations`.
- **Arah:** cukup dua arah, `s` (menghadap kamera, serong kiri-bawah) dan `n`
  (membelakangi, serong kiri-atas). Kanan diambil dari cermin otomatis.
- **Nama tag:** `<animasi>_<arah>`. Kalau tag berarah tidak ada, dipakai
  `<animasi>`, lalu `idle`.
- Frame diputar 8 fps.

| Tag | Frame | Dipakai saat |
|---|---|---|
| `idle_s`, `idle_n` | 2–4 | diam, menunggu |
| `walk_s`, `walk_n` | 4–8 | berjalan |
| `sit` | 1–2 | idle, istirahat |
| `build` | 4–6 | Edit/Write: mengayun palu |
| `research` | 2–4 | Read/Grep: membaca buku |
| `craft` | 4 | Bash: mengaduk labu |
| `trial` | 4 | test: menebas |
| `deliver` | 2–4 | commit: mengangkat peti |
| `cast` | 2–4 | berpikir: tongkat terangkat |
| `summon` | 4 | memanggil subagent |
| `teleport` | 4 | WebSearch |

Kalau karakter punya sheet, alat yang digambar kode (palu, buku, dan lain-lain)
otomatis disembunyikan. Jadi alatnya harus ada di dalam frame.

**Hemat biaya:** buat satu `novice` lengkap dulu. Job class lain bisa berupa
varian warna, headgear, dan senjata dari badan yang sama.

## Bangunan

Isometrik 2:1. Satu tile = 32×16 px.

| Key | Footprint | Ukuran kira-kira |
|---|---|---|
| `district-1` … `district-5` | 2×2 | 64 px lebar, tinggi 50–120 px (level naik = lebih tinggi) |
| `library` | 2×2 | 64×130 |
| `workshop` | 2×2 | 64×90, cerobong di kanan-belakang |
| `inn` | 2×2 | 64×90 |
| `arena` | 2.6×2.6 | 84×60, lapangan + 2 boneka latihan |
| `kafra` | 1×1 | 32×50, kios dengan kanopi |

Scaffolding, papan nama, asap, dan lampu tetap digambar kode di atas gambar
bangunan.

## Generate otomatis (Retro Diffusion)

Semua aset di folder ini dibuat lewat `scripts/gen-assets.mjs`, dan prompt-nya
tersimpan di sana. Butuh `RETRO_DIFFUSION_API_KEY` di `.env`.

```bash
node scripts/gen-assets.mjs                  # cek harga (gratis)
node scripts/gen-assets.mjs --run inn tree   # buat kandidat ke assets-src/candidates/
node scripts/gen-assets.mjs --pick inn=3     # pasang kandidat #3 dan perbarui manifest
```

Karakter memakai `rd_animation__battle_sprites`: sheet 14×4 frame 64px.
Barisnya: depan, kanan, belakang, kiri. Kolomnya: idle ×3, jalan ×6,
lompat ×2, serang ×3.

Aksi khusus (`knight.build` dan sejenisnya) memakai
`rd_advanced_animation__custom_action`, 8 frame yang dianimasikan dari frame
idle karakter itu, lalu digabung ke sheet karakternya sebagai baris tambahan.
Aksi membangun (palu) hasilnya bagus. Aksi membaca dan meracik tidak
menampilkan buku atau labu, jadi tidak dipasang: aktivitas itu tetap memakai
idle ditambah alat yang digambar kode. Bard juga tidak memakai aksi khusus
karena kilatannya menutupi badan; bard memakai animasi serang bawaan.

Tile tanah (`tile.*`) adalah tekstur persegi 32px yang diproyeksikan ke grid
isometrik. Ikon (`icon.*`) dipakai di bubble, panel, dan chat log.

## Prompt AI (titik awal)

Pakai tool pixel art khusus (PixelLab untuk karakter dan animasi, Retro
Diffusion untuk bangunan dan tile), bukan generator gambar umum. Generator umum
tidak menghasilkan grid piksel yang bersih.

Karakter:

> chibi fantasy RPG knight, 2.5D isometric pixel art, 3/4 view facing
> down-left, big head small body, red tabard over steel armor, short cape,
> warm saturated palette, 1px dark outline, transparent background, 32x48

Bangunan:

> isometric pixel art medieval fantasy townhouse, 2:1 isometric, cream plaster
> walls, timber frame, red tile hip roof, small windows, warm sunny palette,
> 1px outline, transparent background, 64px wide

Setelah generate: rapikan di Aseprite (outline, palet, jitter antar-frame),
lalu export sesuai format di atas.
