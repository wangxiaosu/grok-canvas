const DOT_GRID =
  "radial-gradient(circle, rgba(205,220,255,0.95) 1px, transparent 1.5px)";

const STARS = [
  { left: "18%", top: "26%", delay: "0s", duration: "2.6s" },
  { left: "64%", top: "18%", delay: "0.9s", duration: "3.1s" },
  { left: "82%", top: "58%", delay: "1.7s", duration: "2.3s" },
  { left: "34%", top: "74%", delay: "0.4s", duration: "3.4s" },
  { left: "52%", top: "44%", delay: "2.1s", duration: "2.8s" },
];

/** Grok Imagine 风格的生成中占位动画：蓝黑暗夜 + 星点阵 + 极光扫光 */
export function ImagineLoading() {
  return (
    <div
      className="ui-generation-animation relative h-full w-full overflow-hidden"
      style={{ background: "linear-gradient(160deg, #0a0d16 0%, #0c101d 55%, #0a0c12 100%)" }}
    >
      {/* 漂移的星云团 */}
      <div
        className="absolute -inset-1/4 animate-[imagine-drift-a_11s_ease-in-out_infinite] rounded-full blur-3xl"
        style={{
          width: "75%",
          height: "75%",
          left: "5%",
          top: "10%",
          background:
            "radial-gradient(circle, rgba(96,130,220,0.16) 0%, rgba(96,130,220,0.05) 45%, transparent 70%)",
        }}
      />
      <div
        className="absolute -inset-1/4 animate-[imagine-drift-b_14s_ease-in-out_infinite] rounded-full blur-3xl"
        style={{
          width: "85%",
          height: "85%",
          left: "30%",
          top: "30%",
          background:
            "radial-gradient(circle, rgba(150,110,190,0.10) 0%, rgba(150,110,190,0.04) 45%, transparent 70%)",
        }}
      />

      {/* 常态暗点阵 */}
      <div
        className="absolute inset-0 opacity-[0.15]"
        style={{ backgroundImage: DOT_GRID, backgroundSize: "22px 22px" }}
      />
      {/* 被扫光点亮的点阵（蒙版跟随光带） */}
      <div
        className="absolute inset-0 animate-[imagine-mask-sweep_3.2s_linear_infinite] opacity-70"
        style={{
          backgroundImage: DOT_GRID,
          backgroundSize: "22px 22px",
          maskImage:
            "linear-gradient(100deg, transparent 36%, black 50%, transparent 64%)",
          maskSize: "300% 100%",
          maskRepeat: "no-repeat",
        }}
      />

      {/* 极光扫光带：蓝白主调，带一点暖芯 */}
      <div
        className="absolute inset-y-0 w-[45%] animate-[imagine-sweep_3.2s_linear_infinite] mix-blend-screen blur-md"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(140,175,255,0.14) 30%, rgba(225,235,255,0.30) 48%, rgba(255,225,235,0.16) 55%, rgba(140,175,255,0.12) 70%, transparent)",
        }}
      />

      {/* 闪烁的星光 */}
      {STARS.map((star, i) => (
        <span
          key={i}
          className="absolute h-[3px] w-[3px] rounded-full blur-[1px]"
          style={{
            left: star.left,
            top: star.top,
            background: "rgba(220,232,255,1)",
            boxShadow: "0 0 6px 1px rgba(170,200,255,0.6)",
            animation: `imagine-twinkle ${star.duration} ease-in-out ${star.delay} infinite`,
          }}
        />
      ))}
    </div>
  );
}
