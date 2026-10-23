"use strict";

// Bilgi kartları. Kart içeriğini buraya ekleyin:
//   front / back: { label, title, sections: [{ h, p, list }] }  (**kalın** işaretlenebilir)
//   text:  yalnızca düz metin kartı için
//   image: görsel dosyasının yolu (ör. "kartlar/kart1.png")
// Hiçbiri yoksa kart "yakında" olarak görünür.
const CARDS = [
  {
    id: 1, title: "Kart 1 — Mıknatıslar", text: "", image: "",
    front: {
      label: "Kart 1 · Ön yüz · Oyun içi etkisi",
      title: "Mıknatıslar",
      sections: [
        { h: "Oyundaki Rolü",
          p: "4 gizli N-Kutbu ve 4 gizli S-Kutbu yuvası ile N-Kutbu Test Aracı." },
        { h: "Oyun Tepkileri",
          list: ["N aracı + N yuva: **İTER** (araç oturmaz)",
                 "N aracı + S yuva: **ÇEKER** (araç yapışır)",
                 "Demir aracı: N ve S kutbunu **ÇEKER**"] },
        { h: "Stratejik Kullanım",
          p: "İtme %100 kesin veridir; hissedildiği an N tespit taşı yerleştirilir. " +
             "Çekimde kare S veya Fe'dir; Demir aracı ayırt eder (S çeker, Fe tepki vermez)." },
      ],
    },
    back: {
      label: "Kart 1 · Arka yüz · Fizik bilgisi",
      title: "Mıknatıslar",
      sections: [
        { h: "Temel",
          p: "Mıknatıs çevresinde manyetik alan oluşturur. Zıt kutuplar çeker, aynı kutuplar iter. " +
             "Tek bir kutup başına bulunamaz." },
        { h: "İleri",
          p: "Mıknatısı ikiye bölersen her parça yine iki kutuplu olur. Çeşitler: " +
             "**Doğal** (manyetit Fe₃O₄, maghemait, pirotit), " +
             "**Yapay** (neodyum, alniko, ferit, samaryum-kobalt), " +
             "**Elektromıknatıs** (solenoid, vinç, röle)." },
        { h: "Güvenlik",
          p: "Oyundaki neodim mıknatıslar çok güçlüdür; yutulmamalı, parmak sıkışmasına dikkat edilmelidir." },
      ],
    },
  },
  { id: 2, title: "Kart 2 — Ferromanyetizma", text: "", image: "" },
  { id: 3, title: "Kart 3 — Diyamanyetizma (Bakır sürümü)", text: "", image: "" },
  { id: 4, title: "Kart 4 — Paramanyetizma (Alüminyum sürümü)", text: "", image: "" },
  { id: 5, title: "Kart 5 — Deney Köşesi", text: "", image: "" },
  { id: 6, title: "Kart 6 — Ek Kart", text: "", image: "" },
];
