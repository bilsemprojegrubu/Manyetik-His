#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MANYETİK-HİS: KUTUPLARIN SAVAŞI  -  Dijital test sürümü
-------------------------------------------------------
Çalıştırma:  python manyetik_his.py      (Python 3.8+, ek kurulum gerekmez; Tkinter yeterli)

Seviye 1: Tek oyunculu, zamana karşı   (Doğru +10, Yanlış -5)
Seviye 2: 2-4 oyunculu, sıra ile       (Doğru +10, Yanlış -10)

Geliştirirken değiştirebileceğin ayarlar dosyanın başındaki AYARLAR bölümünde.
"""

import random
import time
import tkinter as tk
from tkinter import messagebox

# ----------------------------------------------------------------------------
# AYARLAR
# ----------------------------------------------------------------------------
SIZE = 4                                  # 4x4 tabla
ROWS = "ABCD"                             # satır harfleri (A1 ... D4)
COMPOSITION = {"N": 4, "S": 4, "Fe": 4, "Cu": 4}   # toplamı 16 olmalı

L1_CORRECT, L1_WRONG = 10, -5
L2_CORRECT, L2_WRONG = 10, -10

PLAYER_COLORS = [("Kırmızı", "#e53935"), ("Mavi", "#1e88e5"),
                 ("Yeşil", "#43a047"), ("Sarı", "#f9a825")]

MATERIAL_NAMES = {"N": "N-Kutbu Mıknatıs", "S": "S-Kutbu Mıknatıs",
                  "Fe": "Demir (Fe)", "Cu": "Bakır / Nötr (Cu)"}
TOOL_NAMES = {"Fe": "Demir Test Aracı", "N": "N-Kutbu Test Aracı"}

PULL, PUSH, NONE = "cekme", "itme", "yok"
REACTION_TEXT = {
    PULL: "⬇ ÇEKME - taş yuvaya yapıştı",
    PUSH: "⬆ İTME - taş havada kaldı, oturmadı",
    NONE: "• TEPKİ YOK - taş serbestçe oturdu",
}
REACTION_SHORT = {PULL: "çeker", PUSH: "iter", NONE: "yok"}


# ----------------------------------------------------------------------------
# OYUN MANTIĞI (arayüzden bağımsız, tek başına test edilebilir)
# ----------------------------------------------------------------------------
def react(tool, material):
    """Mantık/tepki matrisi (Word dosyası, Bölüm 3)."""
    if tool == "Fe":                       # Demir aracı: yalnızca mıknatısı çeker
        return PULL if material in ("N", "S") else NONE
    if tool == "N":                        # N aracı: N'yi iter, S ve Fe'yi çeker
        if material == "N":
            return PUSH
        if material in ("S", "Fe"):
            return PULL
        return NONE
    raise ValueError(tool)


def new_board():
    cells = [m for m, n in COMPOSITION.items() for _ in range(n)]
    assert len(cells) == SIZE * SIZE
    random.shuffle(cells)
    return cells


def cell_name(i):
    return f"{ROWS[i // SIZE]}{i % SIZE + 1}"


class Game:
    def __init__(self, level, player_names):
        self.level = level
        self.board = new_board()
        self.players = player_names
        self.flags = {}          # hücre -> (oyuncu_no, sembol)
        self.tests = {}          # hücre -> [(oyuncu_no, araç, tepki), ...]
        self.correct = L1_CORRECT if level == 1 else L2_CORRECT
        self.wrong = L1_WRONG if level == 1 else L2_WRONG
        # Araç dağılımı (Seviye 2): oyunculara dönüşümlü, başlangıç rastgele
        start = random.randint(0, 1)
        self.tools = [("Fe", "N")[(start + p) % 2] for p in range(len(player_names))]
        self.current = 0
        self.tested_this_turn = False
        self.flagged_this_turn = False

    def test(self, cell, player, tool):
        result = react(tool, self.board[cell])
        self.tests.setdefault(cell, []).append((player, tool, result))
        return result

    def place_flag(self, cell, player, symbol):
        if self.level == 2 and cell in self.flags:
            return False                      # Seviye 2: kilitli kare
        self.flags[cell] = (player, symbol)
        return True

    def remove_flag(self, cell):
        if self.level == 1:
            self.flags.pop(cell, None)

    def all_flagged(self):
        return len(self.flags) == SIZE * SIZE

    def scores(self):
        s = [0] * len(self.players)
        for cell, (p, sym) in self.flags.items():
            s[p] += self.correct if self.board[cell] == sym else self.wrong
        return s


# ----------------------------------------------------------------------------
# ARAYÜZ
# ----------------------------------------------------------------------------
class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("MANYETİK-HİS: Kutupların Savaşı")
        self.configure(bg="#1b1f2a")
        self.minsize(900, 640)
        self.bind("<F11>", self.toggle_fullscreen)
        self.bind("<Escape>", lambda e: self.attributes("-fullscreen", False))
        self.game = None
        self.cell_btns = []
        self.timer_job = None
        self.start_time = 0
        self.final_time = None
        self.show_history = tk.BooleanVar(value=True)
        self.mode = tk.StringVar(value="test")
        self.tool_var = tk.StringVar(value="Fe")
        self.flag_var = tk.StringVar(value="N")
        self.menu()

    def toggle_fullscreen(self, event=None):
        self.attributes("-fullscreen", not self.attributes("-fullscreen"))

    # ---------------- Menü ----------------
    def clear(self):
        if self.timer_job:
            self.after_cancel(self.timer_job)
            self.timer_job = None
        for w in self.winfo_children():
            w.destroy()

    def menu(self):
        self.clear()
        f = tk.Frame(self, bg="#1b1f2a", padx=40, pady=30)
        f.pack(expand=True)
        tk.Label(f, text="MANYETİK-HİS", font=("Arial", 30, "bold"),
                 fg="#ffd54f", bg="#1b1f2a").pack()
        tk.Label(f, text="Kutupların Savaşı", font=("Arial", 16),
                 fg="white", bg="#1b1f2a").pack(pady=(0, 20))

        tk.Button(f, text="SEVİYE 1 - Tek Oyunculu (Zamana Karşı)",
                  font=("Arial", 13), width=40, pady=6,
                  command=lambda: self.start(1, ["Oyuncu"])).pack(pady=5)

        tk.Label(f, text="SEVİYE 2 - Çok Oyunculu", font=("Arial", 13, "bold"),
                 fg="white", bg="#1b1f2a").pack(pady=(18, 4))
        self.n_players = tk.IntVar(value=2)
        row = tk.Frame(f, bg="#1b1f2a")
        row.pack()
        tk.Label(row, text="Oyuncu sayısı:", fg="white", bg="#1b1f2a").pack(side="left")
        for n in (2, 3, 4):
            tk.Radiobutton(row, text=str(n), variable=self.n_players, value=n,
                           fg="white", bg="#1b1f2a", selectcolor="#333",
                           activebackground="#1b1f2a").pack(side="left", padx=4)
        self.name_entries = []
        for i, (cname, col) in enumerate(PLAYER_COLORS):
            r = tk.Frame(f, bg="#1b1f2a")
            r.pack(pady=1)
            tk.Label(r, text="●", fg=col, bg="#1b1f2a", font=("Arial", 14)).pack(side="left")
            e = tk.Entry(r, width=20)
            e.insert(0, f"Oyuncu {i + 1}")
            e.pack(side="left", padx=6)
            self.name_entries.append(e)
        tk.Button(f, text="Oyunu Başlat", font=("Arial", 13), width=40, pady=6,
                  command=self.start_l2).pack(pady=(12, 5))
        tk.Button(f, text="Nasıl oynanır?", command=self.help).pack(pady=(10, 0))

    def help(self):
        messagebox.showinfo("Nasıl oynanır?",
            "Tablada 16 gizli madde var: N mıknatıs, S mıknatıs, Demir (Fe), Bakır (Cu).\n\n"
            "Test araçları:\n"
            " • Demir aracı: mıknatısı ÇEKER (N ve S), Fe ve Cu'ya tepki vermez.\n"
            " • N aracı: N'yi İTER, S'yi ve Fe'yi ÇEKER, Cu'ya tepki vermez.\n\n"
            "Tepkilerden maddeyi çıkarıp kareye bayrak dik (N, S, Fe, Cu).\n"
            "Seviye 1: doğru +10, yanlış -5, en kısa sürede bitir.\n"
            "Seviye 2: sırayla oynanır; her turda 1 test + 1 bayrak. İlk bayrak kareyi\n"
            "kilitler. Doğru +10, yanlış -10.")

    def start_l2(self):
        n = self.n_players.get()
        names = [self.name_entries[i].get().strip() or f"Oyuncu {i + 1}" for i in range(n)]
        self.start(2, names)

    # ---------------- Oyun ekranı ----------------
    def start(self, level, names):
        self.game = Game(level, names)
        self.final_time = None
        self.start_time = time.time()
        self.mode.set("test")
        self.show_history.set(level == 1)
        self.flag_var.set("N")
        self.tool_var.set("Fe")
        self.build_game_ui()
        self.refresh()
        if level == 1:
            self.tick()

    def build_game_ui(self):
        self.clear()
        g = self.game
        main = tk.Frame(self, bg="#1b1f2a", padx=14, pady=14)
        main.pack(fill="both", expand=True)
        main.columnconfigure(0, weight=1)
        main.rowconfigure(0, weight=1)

        # --- tabla ---
        left = tk.Frame(main, bg="#1b1f2a")
        left.grid(row=0, column=0, padx=(0, 16), sticky="nsew")
        for c in range(SIZE):
            tk.Label(left, text=str(c + 1), fg="#aaa", bg="#1b1f2a",
                     font=("Arial", 11, "bold")).grid(row=0, column=c + 1)
        self.cell_btns = []
        for r in range(SIZE):
            tk.Label(left, text=ROWS[r], fg="#aaa", bg="#1b1f2a",
                     font=("Arial", 11, "bold")).grid(row=r + 1, column=0)
            for c in range(SIZE):
                i = r * SIZE + c
                b = tk.Button(left, width=11, height=4, font=("Arial", 10, "bold"),
                              command=lambda i=i: self.on_cell(i))
                b.grid(row=r + 1, column=c + 1, padx=3, pady=3, sticky="nsew")
                left.columnconfigure(c + 1, weight=1)
                left.rowconfigure(r + 1, weight=1)
                self.cell_btns.append(b)

        # --- sağ panel ---
        right = tk.Frame(main, bg="#1b1f2a", width=300)
        right.grid(row=0, column=1, sticky="n")

        self.lbl_title = tk.Label(right, font=("Arial", 15, "bold"),
                                  fg="#ffd54f", bg="#1b1f2a")
        self.lbl_title.pack(anchor="w")
        self.lbl_turn = tk.Label(right, font=("Arial", 13, "bold"),
                                 fg="white", bg="#1b1f2a")
        self.lbl_turn.pack(anchor="w", pady=(4, 0))
        self.lbl_info = tk.Label(right, fg="#ccc", bg="#1b1f2a", justify="left")
        self.lbl_info.pack(anchor="w", pady=(0, 8))

        # mod seçimi
        box = tk.LabelFrame(right, text=" Ne yapacaksın? ", fg="white", bg="#1b1f2a")
        box.pack(fill="x", pady=4)
        tk.Radiobutton(box, text="Test et", variable=self.mode, value="test",
                       **self._radio()).pack(anchor="w")
        if g.level == 1:
            tk.Radiobutton(box, text="   Demir Test Aracı", variable=self.tool_var,
                           value="Fe", **self._radio()).pack(anchor="w")
            tk.Radiobutton(box, text="   N-Kutbu Test Aracı", variable=self.tool_var,
                           value="N", **self._radio()).pack(anchor="w")
        tk.Radiobutton(box, text="Bayrak dik", variable=self.mode, value="flag",
                       **self._radio()).pack(anchor="w")
        fr = tk.Frame(box, bg="#1b1f2a")
        fr.pack(anchor="w")
        for s in ("N", "S", "Fe", "Cu"):
            tk.Radiobutton(fr, text=s, variable=self.flag_var, value=s,
                           **self._radio()).pack(side="left", padx=2)
        if g.level == 1:
            tk.Radiobutton(box, text="Bayrağı kaldır", variable=self.mode, value="unflag",
                           **self._radio()).pack(anchor="w")

        self.chk = tk.Checkbutton(right, text="Test geçmişini karelerde göster (hafıza yardımı)",
                                  variable=self.show_history, command=self.refresh,
                                  fg="white", bg="#1b1f2a", selectcolor="#333",
                                  activebackground="#1b1f2a", activeforeground="white")
        self.chk.pack(anchor="w", pady=4)

        # son tepki
        self.lbl_msg = tk.Label(right, text="Bir kareyi test et.", wraplength=290,
                                font=("Arial", 12, "bold"), fg="#80deea",
                                bg="#263043", padx=8, pady=10, justify="left", width=34)
        self.lbl_msg.pack(pady=8, fill="x")

        if g.level == 2:
            self.btn_end = tk.Button(right, text="Turu Bitir / Pas Geç",
                                     font=("Arial", 11, "bold"), command=self.end_turn)
            self.btn_end.pack(fill="x", pady=4)

        self.lbl_score = tk.Label(right, fg="white", bg="#1b1f2a", justify="left",
                                  font=("Arial", 11))
        self.lbl_score.pack(anchor="w", pady=6)

        tk.Button(right, text="Menüye dön", command=self.confirm_menu).pack(anchor="w", pady=(6, 0))

    def _radio(self):
        return dict(fg="white", bg="#1b1f2a", selectcolor="#333",
                    activebackground="#1b1f2a", activeforeground="white")

    def confirm_menu(self):
        if messagebox.askyesno("Menü", "Oyundan çıkıp menüye dönülsün mü?"):
            self.menu()

    # ---------------- Zamanlayıcı ----------------
    def tick(self):
        if self.final_time is None:
            self.refresh_timer()
            self.timer_job = self.after(200, self.tick)

    def elapsed(self):
        return self.final_time if self.final_time is not None else time.time() - self.start_time

    def refresh_timer(self):
        t = self.elapsed()
        self.lbl_info.config(text=f"⏱ Süre: {int(t // 60):02d}:{t % 60:04.1f}")

    # ---------------- Etkileşim ----------------
    def active_tool(self):
        g = self.game
        return self.tool_var.get() if g.level == 1 else g.tools[g.current]

    def on_cell(self, i):
        g = self.game
        if g.all_flagged():
            return
        mode = self.mode.get()
        if mode == "test":
            self.do_test(i)
        elif mode == "flag":
            self.do_flag(i)
        elif mode == "unflag":
            g.remove_flag(i)
        self.refresh()
        if g.all_flagged():
            self.finish()

    def do_test(self, i):
        g = self.game
        if g.level == 2:
            if i in g.flags:
                return self.say("Bu kare kilitli, test gerekmez.")
            if g.tested_this_turn:
                return self.say("Bu turda zaten test yaptın. Bayrak dik veya turu bitir.")
        tool = self.active_tool()
        res = g.test(i, g.current, tool)
        g.tested_this_turn = True
        who = f"{g.players[g.current]} - " if g.level == 2 else ""
        self.say(f"{who}{cell_name(i)} karesi, {TOOL_NAMES[tool]}:\n{REACTION_TEXT[res]}")
        self.auto_end_turn()

    def do_flag(self, i):
        g = self.game
        if g.level == 2:
            if g.flagged_this_turn:
                return self.say("Bu turda zaten bayrak diktin. Turu bitir.")
            if i in g.flags:
                return self.say("Bu kare kilitli, bayrak dikilemez.")
        sym = self.flag_var.get()
        if g.place_flag(i, g.current, sym):
            g.flagged_this_turn = True
            self.say(f"{cell_name(i)} karesine {sym} bayrağı dikildi.")
            self.auto_end_turn()

    def auto_end_turn(self):
        g = self.game
        if g.level == 2 and g.tested_this_turn and g.flagged_this_turn:
            self.end_turn()

    def end_turn(self):
        g = self.game
        if g.all_flagged():
            return
        g.current = (g.current + 1) % len(g.players)
        g.tested_this_turn = g.flagged_this_turn = False
        self.mode.set("test")
        self.refresh()

    def say(self, text):
        self.lbl_msg.config(text=text)

    # ---------------- Görünüm ----------------
    def refresh(self):
        g = self.game
        if g is None:
            return
        self.lbl_title.config(text=f"SEVİYE {g.level}")
        if g.level == 1:
            self.lbl_turn.config(text="Serbest test - hızlı ol!", fg="white")
            self.refresh_timer()
        else:
            cname, col = PLAYER_COLORS[g.current]
            self.lbl_turn.config(text=f"● Sıra: {g.players[g.current]}", fg=col)
            self.lbl_info.config(
                text=f"Aracın: {TOOL_NAMES[g.tools[g.current]]}\n"
                     f"Bu tur: test {'✔' if g.tested_this_turn else '–'}   "
                     f"bayrak {'✔' if g.flagged_this_turn else '–'}")
        for i, b in enumerate(self.cell_btns):
            self.paint_cell(i, b)
        self.refresh_scores()

    def paint_cell(self, i, b):
        g = self.game
        txt = cell_name(i)
        bg, fg = "#cfd8dc", "black"
        if i in g.flags:
            p, sym = g.flags[i]
            txt += f"\n⚑ {sym}"
            bg, fg = PLAYER_COLORS[p][1], "white"
            if g.level == 2:
                txt += " 🔒"
        if self.show_history.get() and i in g.tests:
            lines = [f"{'Fe' if t == 'Fe' else 'N'}:{REACTION_SHORT[r]}"
                     for _, t, r in g.tests[i]][-3:]
            txt += "\n" + " ".join(lines)
        b.config(text=txt, bg=bg, fg=fg, activebackground=bg)

    def refresh_scores(self):
        g = self.game
        flagged = len(g.flags)
        lines = [f"Bayraklı kare: {flagged}/16"]
        if g.level == 2:
            for p, name in enumerate(g.players):
                n = sum(1 for _, (q, _) in g.flags.items() if q == p)
                lines.append(f"● {name}: {n} bayrak")
        self.lbl_score.config(text="\n".join(lines))

    # ---------------- Bitiş ----------------
    def finish(self):
        g = self.game
        self.final_time = time.time() - self.start_time
        # tahtayı aç
        for i, b in enumerate(self.cell_btns):
            ok = i in g.flags and g.board[i] == g.flags[i][1]
            flag = g.flags[i][1] if i in g.flags else "-"
            b.config(text=f"{cell_name(i)}\nGerçek: {g.board[i]}\nBayrak: {flag}",
                     bg="#a5d6a7" if ok else "#ef9a9a", fg="black",
                     activebackground="#a5d6a7" if ok else "#ef9a9a")
        s = g.scores()
        correct = sum(1 for i, (_, sym) in g.flags.items() if g.board[i] == sym)
        if g.level == 1:
            self.refresh_timer()
            msg = (f"Doğru: {correct}/16\nSüre: {self.final_time:.1f} sn\n"
                   f"PUAN: {s[0]}")
        else:
            order = sorted(range(len(s)), key=lambda p: -s[p])
            msg = "\n".join(f"{k + 1}. {g.players[p]}: {s[p]} puan" for k, p in enumerate(order))
            msg += f"\n\nKazanan: {g.players[order[0]]}"
            if len(order) > 1 and s[order[0]] == s[order[1]]:
                msg += " (beraberlik!)"
        self.say("OYUN BİTTİ!\n" + msg)
        messagebox.showinfo("Oyun bitti - Showdown", msg)
        self.lbl_info.config(text="Oyun bitti. Menüye dönüp tekrar oynayabilirsin.")


# ----------------------------------------------------------------------------
if __name__ == "__main__":
    App().mainloop()
