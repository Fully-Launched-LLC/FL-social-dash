import { useEffect, useState } from "react";
import {
  AbsoluteFill,
  Composition,
  Img,
  continueRender,
  delayRender,
  staticFile,
} from "remotion";

// Brand option samples: one still per look, rendered over a real frame of the
// client's footage, so Tait can pick the colours and fonts for each client.
// Render: npx remotion still BrandOption-A out/brand/A.png (A, B or C).

const GG = {
  orange: "#F15523",
  ink: "#252422",
  cream: "#FFFCF1",
  stone: "#CDC5B8",
};

const SANS = "'Nunito Sans', sans-serif"; // gradgig.co body font
const HEAD = "Futura, 'Nunito Sans', sans-serif"; // gradgig.co heading font
const SERIF = "Baskerville, Georgia, serif"; // gradgig.co serif touches

const useFonts = () => {
  const [handle] = useState(() => delayRender("fonts"));
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Nunito+Sans:ital,wght@0,400;0,700;0,800;0,900;1,700&display=swap";
    link.onload = () =>
      document.fonts.load(`800 40px 'Nunito Sans'`).then(() => continueRender(handle));
    link.onerror = () => continueRender(handle);
    document.head.appendChild(link);
  }, [handle]);
};

const Footage: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <Img
    src={staticFile("clients/grad-gig/sample.jpg")}
    style={{ width: "100%", height: "100%", objectFit: "cover", ...style }}
  />
);

const Label: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      position: "absolute",
      top: 36,
      left: 36,
      padding: "10px 18px",
      borderRadius: 999,
      background: "rgba(0,0,0,0.55)",
      color: "white",
      fontFamily: SANS,
      fontWeight: 700,
      fontSize: 26,
      letterSpacing: 1,
    }}
  >
    {text}
  </div>
);

// A: brand classic. Futura headline, Nunito captions, orange highlight box.
const OptionA: React.FC = () => (
  <AbsoluteFill>
    <Footage />
    <AbsoluteFill
      style={{ background: "linear-gradient(180deg, rgba(37,36,34,0.55), rgba(37,36,34,0) 30%)" }}
    />
    <div style={{ position: "absolute", top: 150, width: "100%", textAlign: "center" }}>
      <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 92, color: GG.cream, lineHeight: 1.05 }}>
        Hire a{" "}
        <span style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 400, color: GG.orange }}>
          student
        </span>
      </div>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 34, color: GG.stone, marginTop: 14 }}>
        from Wheaton College
      </div>
    </div>
    <div style={{ position: "absolute", top: 1240, width: "100%", textAlign: "center" }}>
      <span style={{ fontFamily: SANS, fontWeight: 900, fontSize: 76, color: "white", textShadow: "0 4px 18px rgba(0,0,0,0.5)" }}>
        THEY MAKE{" "}
      </span>
      <span
        style={{
          fontFamily: SANS,
          fontWeight: 900,
          fontSize: 76,
          color: "white",
          background: GG.orange,
          padding: "0 18px",
          borderRadius: 12,
        }}
      >
        $45/HR
      </span>
    </div>
    <div
      style={{
        position: "absolute",
        bottom: 300,
        left: "50%",
        transform: "translateX(-50%)",
        background: GG.cream,
        color: GG.ink,
        borderRadius: 999,
        padding: "16px 34px",
        fontFamily: SANS,
        fontWeight: 800,
        fontSize: 34,
      }}
    >
      gradgig<span style={{ color: GG.orange }}>.co</span>
    </div>
    <Label text="OPTION A · Brand classic" />
  </AbsoluteFill>
);

// B: editorial (Joshua Blatch). Serif headline, two caption styles.
const OptionB: React.FC = () => (
  <AbsoluteFill>
    <Footage />
    <AbsoluteFill
      style={{ background: "linear-gradient(180deg, rgba(20,19,18,0.6), rgba(20,19,18,0) 34%, rgba(20,19,18,0) 60%, rgba(20,19,18,0.45))" }}
    />
    <div style={{ position: "absolute", top: 130, left: 70, right: 70 }}>
      <div style={{ fontFamily: "monospace", fontSize: 24, letterSpacing: 4, color: GG.stone }}>
        01 · STUDENT OF THE WEEK
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 104, color: GG.cream, lineHeight: 1.0, marginTop: 14 }}>
        Meet <span style={{ fontStyle: "italic", color: GG.orange }}>Luke</span>
      </div>
    </div>
    <div style={{ position: "absolute", top: 1220, width: "100%", textAlign: "center" }}>
      <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 66, color: "white", letterSpacing: 1 }}>
        I BUILT IT IN{" "}
        <span style={{ background: GG.orange, color: "white", padding: "0 12px" }}>WHEATON</span>
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 56, color: "rgba(255,252,241,0.92)", marginTop: 26 }}>
        neighbors
      </div>
    </div>
    <Label text="OPTION B · Editorial (Blatch)" />
  </AbsoluteFill>
);

// C: explainer (Kallaway). Split screen on Grad Gig ink, orange glow.
const OptionC: React.FC = () => (
  <AbsoluteFill style={{ background: GG.ink }}>
    <div style={{ position: "absolute", top: 120, width: "100%", textAlign: "center" }}>
      <span style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 70, color: GG.cream }}>How it </span>
      <span
        style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 70, color: "white", background: GG.orange, padding: "0 16px", borderRadius: 10 }}
      >
        works
      </span>
    </div>
    <div style={{ position: "absolute", top: 300, left: 90, right: 90, display: "flex", justifyContent: "space-between" }}>
      {["Post a gig", "Students apply", "Paid automatically"].map((step, i) => (
        <div key={step} style={{ width: 270, textAlign: "center" }}>
          <div
            style={{
              width: 120,
              height: 120,
              margin: "0 auto",
              borderRadius: 999,
              border: `6px solid ${GG.orange}`,
              boxShadow: `0 0 40px ${GG.orange}`,
              color: GG.cream,
              fontFamily: HEAD,
              fontWeight: 700,
              fontSize: 60,
              lineHeight: "108px",
            }}
          >
            {i + 1}
          </div>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 32, color: GG.cream, marginTop: 22 }}>{step}</div>
        </div>
      ))}
    </div>
    <div style={{ position: "absolute", top: 640, width: "100%", textAlign: "center", fontFamily: SANS, fontWeight: 900, fontSize: 120, color: GG.orange, textShadow: `0 0 30px rgba(241,85,35,0.6)` }}>
      $45<span style={{ fontSize: 60, color: GG.cream }}>/hr</span>
    </div>
    <div
      style={{
        position: "absolute",
        top: 1100,
        left: 60,
        right: 60,
        height: 700,
        borderRadius: 40,
        overflow: "hidden",
        border: `2px solid rgba(255,252,241,0.15)`,
      }}
    >
      <Footage style={{ objectPosition: "50% 22%" }} />
    </div>
    <div style={{ position: "absolute", top: 1030, width: "100%", textAlign: "center", fontFamily: SANS, fontWeight: 800, fontSize: 44, color: "white" }}>
      students apply
    </div>
    <Label text="OPTION C · Explainer (Kallaway)" />
  </AbsoluteFill>
);

const OPTIONS = { A: OptionA, B: OptionB, C: OptionC };

const BrandOption: React.FC<{ option: keyof typeof OPTIONS }> = ({ option }) => {
  useFonts();
  const Option = OPTIONS[option];
  return <Option />;
};

export const BrandOptions = () => (
  <>
    {(Object.keys(OPTIONS) as (keyof typeof OPTIONS)[]).map((option) => (
      <Composition
        key={option}
        id={`BrandOption-${option}`}
        component={BrandOption}
        defaultProps={{ option }}
        durationInFrames={1}
        fps={30}
        width={1080}
        height={1920}
      />
    ))}
  </>
);
