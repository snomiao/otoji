// East, South & Southeast Asia. Schema: see cultures/README.md.
CIVS.push(
  { id: "chinese", name: "Chinese", zh: "中国", region: "East Asia", games: [2, 3, 4],
    key: "D", scale: "gong", dark: "yu", bright: "gong",
    lead: "strings@erhu", second: "pluck@pipa", drone: "strings@sheng oct=3", flute: "flute@dizi oct=5", bell: "bell@bianzhong", harp: "pluck@guzheng oct=4 vol=0.6",
    kit: "opera", grooves: { calm: "x.......x.......|................|....x.......x...", march: "x...x...x...x...|x...............|..x...x...x...x.", drive: "xxxxxxxxxxxxxxxx|x.......x.......|..x.x.x...x.x.x." },
    motifs: ["3 5 6 1' 6 5 3 2", "1 2 3 5 3 2 1 -"],
    note: "erhu 二胡 leads, pipa 琵琶 answers, sheng 笙 drone, 锣鼓 percussion, 编钟 bells" },
);
