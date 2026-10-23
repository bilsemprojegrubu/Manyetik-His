"use strict";

// Bilgi kartları. Kart içeriğini buraya ekleyin:
//   front / back: { label, title, sub, sections: [{ h, p, list }] }  (**kalın** işaretlenebilir)
//   color: kartın vurgu rengi
//   text:  yalnızca düz metin kartı için
//   image: görsel dosyasının yolu (ör. "kartlar/kart1.png")
// Hiçbiri yoksa kart "yakında" olarak görünür.
const CARDS = [
  {
    id: 1, title: "Kart 1 — Mıknatıslar", text: "", image: "", color: "#8b2a1a",
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
  {
    id: 2, title: "Kart 2 — Ferromanyetizma", text: "", image: "", color: "#1f4560",
    front: {
      label: "Kart 2 · Ön yüz · Oyun içi etkisi",
      title: "Ferromanyetik Maddeler",
      sections: [
        { h: "Oyundaki Rolü",
          p: "Gizli Fe (Demir) yuvaları ve Demir Test Aracı." },
        { h: "Oyun Tepkileri",
          list: ["N-Kutbu aracı: güçlü **ÇEKME**",
                 "Demir aracı: **SIFIR TEPKİ**"] },
        { h: "Stratejik Kullanım",
          p: "N aracıyla çekilen ancak Demir aracıyla çekilmeyen kare kesinlikle Demir (Fe) parçasıdır. " +
             "Oyuncu kendi rengindeki Fe tespit taşını yerleştirir." },
      ],
    },
    back: {
      label: "Kart 2 · Arka yüz · Fizik bilgisi",
      title: "Ferromanyetik Maddeler",
      sections: [
        { h: "Temel",
          p: "Mıknatısın her iki kutbu da demiri çeker. Bu yüzden \"çekiyorsa mıknatıstır\" demek yanlıştır; " +
             "kesin kanıt itmedir." },
        { h: "İleri",
          p: "Alanla aynı yönde çok güçlü mıknatıslanırlar (μᵣ >> 1). Sert çelik ve kobalt gibileri alan " +
             "kalksa da mıknatıslığını korur; oyundaki yumuşak demir korumaz." },
        { h: "Örnekler", p: "Demir, Nikel, Kobalt, Sert çelik." },
        { h: "Dikkat", p: "Paslanmaz çeliklerin çoğu mıknatıslanmaz." },
      ],
    },
  },
  { id: 3, title: "Kart 3 — Diyamanyetizma (Bakır sürümü)", text: "", image: "" },
  {
    id: 4, title: "Kart 4 — Paramanyetizma (Alüminyum sürümü)", text: "", image: "", color: "#2f4f4a",
    front: {
      label: "Kart 4 · Ön yüz · Oyun içi etkisi",
      title: "Paramanyetik Maddeler",
      sub: "Nötr malzeme: Alüminyum sürümü",
      sections: [
        { h: "Oyundaki Rolü",
          p: "Alüminyum (Al) sürümünde 4 gizli nötr yuva." },
        { h: "Oyun Tepkileri",
          list: ["N-Kutbu aracı: **SIFIR TEPKİ**",
                 "Demir aracı: **SIFIR TEPKİ**"] },
        { h: "Stratejik Kullanım",
          p: "Çekim çok zayıf olduğundan alüminyum nötr kabul edilir; oyuncu Cu/Al tespit taşını " +
             "yerleştirir. Bakırdan ayırt edilemediği için ikisi aynı oyunda kullanılmaz." },
      ],
    },
    back: {
      label: "Kart 4 · Arka yüz · Fizik bilgisi",
      title: "Paramanyetik Maddeler",
      sub: "Nötr malzeme: Alüminyum sürümü",
      sections: [
        { h: "Temel",
          p: "Alüminyum mıknatısa yapışmaz; mıknatıs onu çok hafifçe çeker." },
        { h: "İleri",
          p: "Alanla aynı yönde zayıfça mıknatıslanırlar (μᵣ biraz > 1); alan kalkınca " +
             "mıknatıslıklarını hemen kaybederler." },
        { h: "Düşün", p: "Alüminyum çekilir ama neden hissetmedik?" },
        { h: "Örnekler", p: "Alüminyum, Magnezyum, Titanyum, Platin, Hava." },
      ],
    },
  },
  {
    id: 5, title: "Kart 5 — Deney Köşesi", text: "", image: "", color: "#4b3a7a",
    front: {
      label: "Kart 5 · Ön yüz · Deney adımları",
      title: "Deney Köşesi",
      sub: "Sıfır tepki gerçekten sıfır mı?",
      sections: [
        { h: "Malzeme",
          p: "Bakır veya alüminyum boru, plastik boru, borudan rahat geçen neodim mıknatıs, yastık, kronometre." },
        { h: "Adımlar",
          list: ["Mıknatısı plastik boruya bırak, süreyi ölç.",
                 "Aynı mıknatısı metal boruya bırak, süreyi ölç.",
                 "İki süreyi karşılaştır."] },
        { h: "Güvenlik",
          p: "Öğretmen gözetiminde yapın; önce plastik boruyla deneyin, mıknatıs sıkışabilir." },
      ],
    },
    back: {
      label: "Kart 5 · Arka yüz · Açıklama",
      title: "Deney Köşesi",
      sub: "Sıfır tepki gerçekten sıfır mı?",
      sections: [
        { h: "Sonuç", p: "Mıknatıs metal boruda belirgin biçimde yavaş düşer." },
        { h: "Temel",
          p: "Metal, hareket eden mıknatısa direnç gösterir. Durağan durumda bu direnç yoktur, " +
             "bu yüzden oyunda tepki sıfırdır." },
        { h: "İleri",
          p: "Hareket, iletken boruda girdap akımları oluşturur; bu akımların alanı hareketi engeller " +
             "(Lenz yasası). Bu etki dia/paramanyetizma değil, iletkenlikten kaynaklanır." },
      ],
    },
  },
  { id: 6, title: "Kart 6 — Ek Kart", text: "", image: "" },
];
