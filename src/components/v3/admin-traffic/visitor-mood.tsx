"use client";
// THE LITTLE GUY (2026-10-03): a small drawn person on every visitor card who
// feels what the owner feels watching the list. Owner: "a funny small human —
// when the visitor left without clicking anything he gets angry, swearing,
// hands up, 'come on, why did you leave?'; on the sign-up page he hops,
// 'come on, faster, do it'; signed up, he dances like crazy, yes yes."
//
// One stick figure, ten moods, each a pose (where the arms are), a face, a
// prop and a CSS animation (./visitor-mood.module.css). The mood is read from
// the same facts the row prints — stage, on the site or gone, pages, tracked
// clicks — so the guy and the sentence under the journey never disagree
// (./visitor-mood-rules, which also picks his line by the visitor's id, so
// it stays put between polls).
import { memo, type CSSProperties } from "react";
import { MOOD_WHY, moodLine, moodOf, type Mood, type MoodFacts } from "./visitor-mood-rules";
import m from "./visitor-mood.module.css";

/* ── the drawing ───────────────────────────────────────────────────────── */
// viewBox 0 0 44 56: head at (22,11), shoulders at (22,22), hip at (22,35).
type Pt = [number, number];
type Arm = { elbow: Pt; hand: Pt };
type Pose = { left: Arm; right: Arm; legs?: [Pt, Pt] };
const HANG_L: Arm = { elbow: [16, 30], hand: [13, 38] };
const POSE: Record<Mood, Pose> = {
  angry: { left: { elbow: [13, 25], hand: [13, 15] }, right: { elbow: [31, 25], hand: [31, 15] }, legs: [[15, 52], [29, 52]] },
  cheer: { left: { elbow: [13, 19], hand: [9, 11] }, right: { elbow: [31, 19], hand: [35, 11] }, legs: [[18, 52], [26, 52]] },
  dance: { left: { elbow: [13, 17], hand: [8, 9] }, right: { elbow: [30, 27], hand: [36, 33] }, legs: [[14, 51], [28, 52]] },
  stuck: { left: HANG_L, right: { elbow: [29, 21], hand: [25, 12] } },
  watch: { left: HANG_L, right: { elbow: [30, 16], hand: [25, 8] } },
  read: { left: { elbow: [14, 29], hand: [17, 27] }, right: { elbow: [30, 29], hand: [27, 27] } },
  shrug: { left: { elbow: [13, 29], hand: [9, 25] }, right: { elbow: [31, 29], hand: [35, 25] } },
  wait: { left: HANG_L, right: { elbow: [30, 30], hand: [23, 30] } },
  locked: { left: HANG_L, right: { elbow: [32, 16], hand: [26, 4] } },
  work: { left: HANG_L, right: { elbow: [32, 22], hand: [34, 13] } },
};
const LEGS: [Pt, Pt] = [[16, 52], [28, 52]];
const SHOULDER: Pt = [22, 22];
const HIP: Pt = [22, 35];

function ArmPart({ arm, side }: { arm: Arm; side: "L" | "R" }) {
  const style = { "--ex": `${arm.elbow[0]}px`, "--ey": `${arm.elbow[1]}px` } as CSSProperties;
  return (
    <g className={side === "L" ? m.armL : m.armR}>
      <line x1={SHOULDER[0]} y1={SHOULDER[1]} x2={arm.elbow[0]} y2={arm.elbow[1]} />
      <g className={side === "L" ? m.foreL : m.foreR} style={style}>
        <line x1={arm.elbow[0]} y1={arm.elbow[1]} x2={arm.hand[0]} y2={arm.hand[1]} />
        <circle className={m.hand} cx={arm.hand[0]} cy={arm.hand[1]} r="1.9" />
      </g>
    </g>
  );
}

function Face({ mood }: { mood: Mood }) {
  const eyes = <>
    <circle cx="19" cy="10.5" r="1.3" />
    <circle cx="25" cy="10.5" r="1.3" />
  </>;
  switch (mood) {
    case "angry":
      return <>
        {eyes}
        <path className={m.stroke} d="M17 7.4 L20.6 9" />
        <path className={m.stroke} d="M27 7.4 L23.4 9" />
        <ellipse className={m.shout} cx="22" cy="14.6" rx="2.3" ry="2.6" />
      </>;
    case "cheer":
    case "dance":
      return <>
        {eyes}
        <path className={m.stroke} d="M17.4 7.6 Q19 6.2 20.6 7.4" />
        <path className={m.stroke} d="M23.4 7.4 Q25 6.2 26.6 7.6" />
        <path className={m.stroke} d="M18.3 13.6 Q22 18 25.7 13.6" />
      </>;
    case "stuck":
    case "shrug":
      return <>
        {eyes}
        <path className={m.stroke} d="M18.6 15.6 Q22 12.8 25.4 15.6" />
      </>;
    case "locked":
      return <>
        {eyes}
        <path className={m.stroke} d="M19 15 L25 15" />
        <text className={m.mark} x="33" y="9">?</text>
      </>;
    case "wait":
      return <>
        {eyes}
        <path className={m.stroke} d="M19 15 L25 15" />
      </>;
    default:
      return <>
        {eyes}
        <path className={m.stroke} d="M18.6 13.8 Q22 16.4 25.4 13.8" />
      </>;
  }
}

function Props({ mood }: { mood: Mood }) {
  switch (mood) {
    case "angry":
      return <g className={m.steam} aria-hidden="true">
        <circle cx="31.5" cy="4" r="1.6" />
        <circle cx="35" cy="1.8" r="1.2" />
      </g>;
    case "dance":
      return <g className={m.confetti} aria-hidden="true">
        <rect x="4" y="18" width="2.4" height="2.4" />
        <rect x="38" y="12" width="2.4" height="2.4" />
        <rect x="7" y="38" width="2.2" height="2.2" />
        <rect x="36" y="42" width="2.2" height="2.2" />
      </g>;
    case "read":
      return <g className={m.page}>
        <rect x="14.5" y="26.5" width="15" height="10.5" />
        <path d="M17 30 L27 30 M17 33 L24 33" />
      </g>;
    case "wait":
      return <circle className={m.watch} cx="25" cy="30" r="1.6" />;
    case "work":
      return <>
        <path className={m.hat} d="M14.5 9.5 Q22 -1.5 29.5 9.5 Z" />
        <g className={m.hammer}>
          <line x1="34" y1="13" x2="34" y2="4" />
          <rect x="30.5" y="1.5" width="7" height="3.6" />
        </g>
      </>;
    default:
      return null;
  }
}

export const VisitorMood = memo(function VisitorMood({ v }: { v: MoodFacts & { id: string } }) {
  const mood = moodOf(v);
  const line = moodLine(mood, v.id);
  const pose = POSE[mood];
  const legs = pose.legs ?? LEGS;
  return (
    <figure className={m.mood} data-mood={mood} title={MOOD_WHY[mood]} aria-label={`${MOOD_WHY[mood]} He says: ${line}`}>
      <i className={m.bubble} aria-hidden="true">{line}</i>
      <svg className={m.fig} viewBox="0 0 44 56" width="44" height="56" aria-hidden="true" focusable="false">
        <g className={m.body}>
          <g className={m.legs}>
            <line className={m.legL} x1={HIP[0]} y1={HIP[1]} x2={legs[0][0]} y2={legs[0][1]} />
            <line className={m.legR} x1={HIP[0]} y1={HIP[1]} x2={legs[1][0]} y2={legs[1][1]} />
          </g>
          <line x1="22" y1="19" x2={HIP[0]} y2={HIP[1]} />
          {mood === "read" && <Props mood={mood} />}
          <ArmPart arm={pose.left} side="L" />
          <ArmPart arm={pose.right} side="R" />
          {mood === "wait" && <Props mood={mood} />}
          {mood === "work" && <Props mood={mood} />}
          <g className={m.head}>
            <circle className={m.skull} cx="22" cy="11" r="8" />
            <g className={m.face}><Face mood={mood} /></g>
            {(mood === "angry" || mood === "dance") && <Props mood={mood} />}
          </g>
        </g>
      </svg>
    </figure>
  );
});
