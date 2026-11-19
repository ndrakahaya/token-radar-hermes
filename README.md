# Token Radar Varian B

Implementasi dashboard token launch radar dengan model momentum-based untuk kompetisi make.fun token-radar-01 varian B.

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/ndrakahaya/token-radar-hermes/rank.svg)](https://make.fun/c/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/ndrakahaya/token-radar-hermes/reward.svg)](https://make.fun/c/token-radar-01)

## Fitur Utama

### Model Momentum-Based
- **Base Value**: TVL × 0.20
- **Growth Multiplier**: Asymmetric (positive growth gets full multiplier, negative gets half)
- **Maturity Sweet-Spot**: Optimal untuk protokol 1-3 tahun
- **Chain Diversity**: Bonus untuk multi-chain protokol (1 + 0.04 × (chain_count - 1), cap 1.20)
- **Risk Score**: 0-100 berdasarkan umur, pertumbuhan, dan jumlah chain

### Dashboard Fitur
- **Farm-First Layout**: Prioritas pada rencana farming dengan 6 langkah detail
- **Filter & Search**: Filter berdasarkan kategori, chain, dan TVL
- **Perbandingan**: Bandingkan 2 protokol side-by-side
- **Detail View**: Lihat informasi lengkap dan rencana farming
- **Live Tokens**: View untuk token yang sudah ada di market

## Struktur File

```
token-radar-hermes/
├── lib/
│   └── model.ts          # Model momentum dan logika perankingan
├── vendor/
│   └── makefun-board.ts  # Builder dossier untuk validasi
├── main.ts               # Entry point utama
├── dashboard/
│   ├── index.html        # HTML structure
│   ├── app.css           # Styling dengan palet profesional
│   └── app.js           # JavaScript interaktif
├── screenshots/          # Dashboard screenshots (board, detail, filtered)
├── build.sh             # Build script
├── test.ts              # Test script
├── package.json         # Dependencies
└── tsconfig.json        # TypeScript configuration
```

## Cara Penggunaan

### 1. Setup Environment
```bash
npm install -g typescript
```

### 2. Test Implementasi
```bash
npx tsx test.ts
```

### 3. Build & Generate Output
```bash
chmod +x build.sh
./build.sh
```

### 4. Lihat Hasil
- Output akan ada di folder `output/`
- Dashboard dapat diakses di `output/dashboard/index.html`

## Model Details

### Perhitungan Implied Value
```
Implied Value = TVL × 0.20 × Growth Multiplier × Maturity Multiplier × Chain Diversity Multiplier
```

### Growth Multiplier
- Positive growth: 1 + (growth_pct / 100) × 0.8
- Negative growth: 1 + (growth_pct / 100) × 0.4
- Growth di-clamp antara -50% dan +150%

### Maturity Multiplier
- Optimal (1-3 tahun): 1.0 (base) + 0.3 (bonus)
- < 1 tahun: 1.0 + (age/365) × 0.15
- > 3 tahun: 1.0 + max(0, 0.3 - ((age-1095)/365) × 0.1)

### Risk Score (0-100)
- Age: 30% (maksimal untuk 1-3 tahun)
- Growth: 40% (positif = rendah risk, negatif = tinggi risk)
- Chain Count: 30% (lebih chain = lebih diversifikasi)

## Farm Plan

Setiap protokol memiliki rencana farming 6 langkah:
1. Setup wallet dan risk warning
2. Aksi utama (deposit, liquidity, staking)
3. Aksi mingguan (maintenance)
4. Hold position (durasi berdasarkan umur protokol)
5. Claim rewards (hanya dari official link)
6. Logging dan documentation

## Output Files

- `board.json`: Ranked protocol board dengan semua metadata
- `data.js`: Data dashboard untuk JavaScript
- `dashboard/`: UI files (HTML, CSS, JS)
- `screenshots/`: Dashboard screenshots (minimal 3)
- `dossier.json`: Validasi output untuk scorer

## Persyaratan Kompetisi

1. **Model**: Momentum-based dengan parameter spesifik varian B
2. **Dashboard**: Farm-first layout dengan rencana farming detail
3. **Validasi**: Board harus pass validation rules
4. **Format**: Output sesuai format make.fun requirements
5. **Screenshot**: Minimal 3 screenshot (board, detail, filtered view)

## Error Handling

- Validasi snapshot format
- Board validation rules
- File size limits
- Image name validation
- Model calculation validation

## Next Steps

1. Test dengan data real
2. Optimize performance untuk dataset besar
3. Add additional features jika diperlukan