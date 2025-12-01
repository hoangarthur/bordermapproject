# metrics.py
# referenced from: ChatGPT
# data taken from experimental results

import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
from scipy.stats import ttest_rel

# Raw data
data = [
    ["P1",  "A→B", "1996", 168, 1, 107, 1],
    ["P1",  "A→B", "2003", 123, 0, 278, 1],
    ["P1",  "A→B", "2023",  54, 1,  55, 1],
    ["P2",  "B→A", "2023", 147, 1, 130, 1],
    ["P2",  "B→A", "2003", 188, 1, 278, 1],
    ["P2",  "B→A", "1996", 101, 1, 141, 1],

    ["P3",  "A→B", "2003",  95, 1, 188, 1],
    ["P3",  "A→B", "2023", 107, 1, 127, 1],
    ["P3",  "A→B", "1996", 112, 1, 260, 1],
    ["P4",  "B→A", "2003",  87, 1,  92, 0],
    ["P4",  "B→A", "1996",  74, 1, 102, 0],
    ["P4",  "B→A", "2023",  30, 1,  30, 1],

    ["P5",  "A→B", "2023",  71, 1,  26, 1],
    ["P5",  "A→B", "1996",  39, 1,  51, 1],
    ["P5",  "A→B", "2003",  29, 1,  33, 1],
    ["P6",  "B→A", "1996",  39, 1, 106, 1],
    ["P6",  "B→A", "2023",  86, 0,  58, 1],
    ["P6",  "B→A", "2003",  38, 0,  36, 1],

    ["P7",  "A→B", "2003", 158, 0,  56, 1],
    ["P7",  "A→B", "1996", 115, 1, 140, 1],
    ["P7",  "A→B", "2023",  51, 1,  46, 1],
    ["P8",  "B→A", "1996",  83, 1,  52, 1],
    ["P8",  "B→A", "2003",  66, 0,  48, 1],
    ["P8",  "B→A", "2023",  60, 1,  44, 1],
    
    ["P9",  "A→B", "2023",  60, 1, 120, 0],
    ["P9",  "A→B", "2003", 240, 1,  60, 0],
    ["P9",  "A→B", "1996", 180, 1, 120, 1],
    ["P10", "B→A", "2003", 120, 0, 180, 0],
    ["P10", "B→A", "2023",  60, 1,  60, 0],
    ["P10", "B→A", "1996", 120, 1, 120, 0],
]

df = pd.DataFrame(data, columns=["Participant","VisOrder","Task","Time_A","Correct_A","Time_B","Correct_B"])

# === DESCRIPTIVE STATISTICS ===
acc_A = df["Correct_A"].mean() * 100
acc_B = df["Correct_B"].mean() * 100
time_A = df["Time_A"].mean()
time_B = df["Time_B"].mean()

print("=== Descriptive statistics ===")
print("Visual A  → Accuracy:", f"{acc_A:.1f}%", " | Time:", f"{time_A:.1f}s")
print("Visual B  → Accuracy:", f"{acc_B:.1f}%", " | Time:", f"{time_B:.1f}s")

# === PAIRED T-TEST ON TIME ===
time_diff = df["Time_B"] - df["Time_A"]
n = len(time_diff)
sd_diff = time_diff.std(ddof=1)

t_stat, p_val = ttest_rel(df["Time_B"], df["Time_A"])

print("\n=== Paired t-test for task time (Visual B - Visual A) ===")
print(f"Number of paired observations (n): {n}")
print(f"SD of differences:                 {sd_diff:.2f} s")
print(f"t({n-1}) = {t_stat:.3f}, p = {p_val:.3f}")

if p_val < 0.05:
    print("→ The time difference is statistically significant at α = .05.")
else:
    print("→ The time difference is NOT statistically significant at α = .05.")

# === PERFORMANCE PLOT (Time + Accuracy Side-by-Side Bars) ===

plt.figure(figsize=(12,8))

labels = ["Visual A \n(Tableau)", "Visual B \n(Project 2)"]

x = np.arange(2)  # two visuals
width = 0.35

# Time bars
plt.bar(x - width/2, [time_A, time_B], width,
        yerr=[df["Time_A"].std(), df["Time_B"].std()],
        capsize=10,
        color="#4A90E2",
        label="Time (seconds)",
        edgecolor="black")

# Accuracy bars
plt.bar(x + width/2, [acc_A, acc_B], width,
        color="#50C878",
        label="Accuracy (%)",
        edgecolor="black")

# Labels on bars
plt.text(x[0] - width/2, time_A + 3, f"{time_A:.1f}s", ha="center", fontsize=12, fontweight="bold")
plt.text(x[1] - width/2, time_B + 3, f"{time_B:.1f}s", ha="center", fontsize=12, fontweight="bold")
plt.text(x[0] + width/2, acc_A + 1, f"{acc_A:.1f}%", ha="center", fontsize=12, fontweight="bold")
plt.text(x[1] + width/2, acc_B + 1, f"{acc_B:.1f}%", ha="center", fontsize=12, fontweight="bold")

plt.xticks(x, labels, fontsize=12)
plt.ylabel("Performance Metrics", fontsize=14)
plt.title("Visual A vs Visual B: Time and Accuracy Comparison",
          fontsize=17, pad=20)

plt.legend(fontsize=12)
plt.ylim(0, max(time_B, acc_A) + 50)

plt.tight_layout()
plt.show()
