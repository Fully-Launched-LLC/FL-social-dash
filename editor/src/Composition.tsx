import {
  AbsoluteFill,
  Composition,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// Step 0 smoke test: a vertical 9:16 headline whose words blur in one at a
// time, the first core block. Proves Remotion renders on this Mac.

type Word = { text: string; accent?: boolean };

const WORDS: Word[] = [
  { text: "Your" },
  { text: "content" },
  { text: "team", accent: true },
  { text: "is" },
  { text: "live." },
];

const FRAMES_PER_WORD = 8;

const BlurWord: React.FC<{ word: Word; index: number }> = ({ word, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = index * FRAMES_PER_WORD;
  const progress = spring({ frame: frame - start, fps, config: { damping: 200 } });
  const blur = interpolate(progress, [0, 1], [12, 0]);

  return (
    <span
      style={{
        display: "inline-block",
        marginRight: 22,
        opacity: progress,
        filter: `blur(${blur}px)`,
        transform: `translateY(${interpolate(progress, [0, 1], [20, 0])}px)`,
        fontFamily: word.accent ? "Georgia, serif" : "Helvetica Neue, Arial, sans-serif",
        fontStyle: word.accent ? "italic" : "normal",
        fontWeight: word.accent ? 400 : 800,
      }}
    >
      {word.text}
    </span>
  );
};

export const MixedHeadlineTest: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#050507",
        justifyContent: "center",
        alignItems: "center",
        color: "white",
        fontSize: 96,
        textAlign: "center",
        padding: 80,
      }}
    >
      <div>
        {WORDS.map((word, i) => (
          <BlurWord key={i} word={word} index={i} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

export const MyComposition = () => {
  return (
    <Composition
      id="MixedHeadlineTest"
      component={MixedHeadlineTest}
      durationInFrames={90}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
