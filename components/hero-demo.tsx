'use client';

import { useEffect, useState } from 'react';

/*
 * Code → WhatsApp animated hero — ported from the design handoff
 * (design_handoff_docs_home/chrome.jsx `CodeToWhatsAppFlow`).
 *
 * Phase loop (≈10s):
 *   0 idle       400ms   reset — only inbound bubble visible
 *   1 typing     ~4-5s   characters stream into the editor
 *   2 calling    900ms   amber POST /v1/messages pill appears
 *   3 response   1100ms  green 200 OK pill + JSON response
 *   4 sending    1600ms  outbound WhatsApp bubble slides up, "sending"
 *   5 delivered  2200ms  bubble shows double blue ticks
 */

type Phase = 0 | 1 | 2 | 3 | 4 | 5;

type Segment = { text: string; cls?: string };
type Line = Segment[];

// The full python source the editor types out. Segments carry syntax colors.
const CODE_LINES: Line[] = [
  [
    { text: 'from', cls: 'c-kw' },
    { text: ' blueticks ' },
    { text: 'import', cls: 'c-kw' },
    { text: ' Client', cls: 'c-fn' },
  ],
  [
    { text: 'bt = ' },
    { text: 'Client', cls: 'c-fn' },
    { text: '(' },
    { text: 'api_key', cls: 'c-at' },
    { text: '=' },
    { text: '"bt_live_···"', cls: 'c-st' },
    { text: ')' },
  ],
  [],
  [
    { text: 'bt.messages.' },
    { text: 'send', cls: 'c-fn' },
    { text: '(' },
  ],
  [
    { text: '    ' },
    { text: 'to', cls: 'c-at' },
    { text: '=' },
    { text: '"+972501234567"', cls: 'c-st' },
    { text: ',' },
  ],
  [
    { text: '    ' },
    { text: 'text', cls: 'c-at' },
    { text: '=' },
    { text: '"Your order is on the way 🎉"', cls: 'c-st' },
    { text: ',' },
  ],
  [
    { text: '    ' },
    { text: 'schedule_at', cls: 'c-at' },
    { text: '=' },
    { text: '"2026-11-01T09:00Z"', cls: 'c-st' },
    { text: ',' },
  ],
  [{ text: ')' }],
];

// Total chars including newlines.
const TOTAL_CHARS = CODE_LINES.reduce(
  (sum, line) => sum + line.reduce((s, seg) => s + seg.text.length, 0) + 1,
  -1,
);

function syntaxClass(cls?: string) {
  switch (cls) {
    case 'c-kw':
      return 'text-[#F472B6]';
    case 'c-st':
      return 'text-[#FDBA74]';
    case 'c-fn':
      return 'text-[#7DD3FC]';
    case 'c-at':
      return 'text-[#C4B5FD]';
    case 'c-nu':
      return 'text-[#BEF264]';
    case 'c-co':
      return 'text-[#52525B] italic';
    case 'c-pn':
      return 'text-[#71717A]';
    default:
      return 'text-[#D4D4D8]';
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function clipLines(typed: number): { lines: Line[]; cursorLine: number } {
  let remaining = typed;
  const out: Line[] = [];
  let cursorLine = 0;
  for (const line of CODE_LINES) {
    if (remaining < 0) {
      out.push([]);
      continue;
    }
    const clipped: Line = [];
    let lineLen = 0;
    for (const seg of line) {
      if (remaining <= 0) break;
      const take = Math.min(seg.text.length, remaining);
      if (take > 0) {
        clipped.push({ text: seg.text.slice(0, take), cls: seg.cls });
        lineLen += take;
        remaining -= take;
      }
    }
    out.push(clipped);
    if (lineLen > 0 || clipped.length > 0 || remaining > 0) {
      cursorLine = out.length - 1;
    }
    remaining -= 1; // consume newline
  }
  return { lines: out, cursorLine };
}

export function HeroDemo() {
  const [phase, setPhase] = useState<Phase>(0);
  const [typed, setTyped] = useState(0);

  useEffect(() => {
    let cancelled = false;

    if (prefersReducedMotion()) {
      // Reduced motion: skip straight to the final state and stop.
      setTyped(TOTAL_CHARS);
      setPhase(5);
      return;
    }

    const run = async () => {
      while (!cancelled) {
        setPhase(0);
        setTyped(0);
        await sleep(400);
        if (cancelled) return;

        setPhase(1);
        for (let i = 0; i <= TOTAL_CHARS; i += 4) {
          if (cancelled) return;
          setTyped(i);
          await sleep(18);
        }
        setTyped(TOTAL_CHARS);
        await sleep(500);
        if (cancelled) return;

        setPhase(2);
        await sleep(900);
        if (cancelled) return;

        setPhase(3);
        await sleep(1100);
        if (cancelled) return;

        setPhase(4);
        await sleep(1600);
        if (cancelled) return;

        setPhase(5);
        await sleep(2200);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const { lines, cursorLine } = clipLines(typed);
  const showCursor = phase === 1;

  const packetTop =
    phase === 2 ? '10%' : phase === 3 ? '50%' : phase === 4 ? '80%' : '50%';
  const packetOpacity = phase >= 2 && phase <= 4 ? 1 : 0;

  return (
    <div
      role="img"
      aria-label="Code-to-WhatsApp demo"
      className="grid items-stretch"
      style={{
        gridTemplateColumns: '1fr 56px 1fr',
        minHeight: 380,
      }}
    >
      {/* LEFT — Code editor */}
      <div
        className="flex flex-col overflow-hidden"
        style={{
          background: 'var(--d-bg-1)',
          border: '1px solid var(--d-border)',
          borderRadius: 14,
        }}
      >
        {/* Titlebar */}
        <div
          className="flex items-center gap-[10px]"
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--d-border)',
            background: 'var(--d-bg-1)',
          }}
        >
          <div className="flex gap-[6px]">
            <TrafficDot color="#FF5F57" />
            <TrafficDot color="#FEBC2E" />
            <TrafficDot color="#28C840" />
          </div>
          <div
            className="font-mono"
            style={{ fontSize: 12, color: 'var(--d-ink-4)' }}
          >
            ~/send-reminder.py
          </div>
          <div className="ml-auto flex items-center gap-2">
            {phase === 2 && (
              <span
                className="inline-flex items-center gap-2 rounded-full border"
                style={{
                  fontSize: 11,
                  padding: '3px 8px',
                  background: 'rgba(245,158,11,.1)',
                  borderColor: 'rgba(245,158,11,.3)',
                  color: '#F59E0B',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#F59E0B',
                  }}
                />
                POST /v1/messages
              </span>
            )}
            {phase >= 3 && (
              <span
                className="inline-flex items-center gap-2 rounded-full border"
                style={{
                  fontSize: 11,
                  padding: '3px 8px',
                  background: 'rgba(37,211,102,.1)',
                  borderColor: 'rgba(37,211,102,.3)',
                  color: '#25D366',
                }}
              >
                <span className="bt-live-dot" />
                200 OK · 118ms
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div
          className="font-mono"
          style={{
            padding: '16px 18px',
            flex: 1,
            whiteSpace: 'pre',
            fontSize: 13,
            lineHeight: 1.65,
            color: 'var(--d-ink-2)',
          }}
        >
          {lines.map((segs, i) => (
            <div key={i} style={{ minHeight: '1.65em' }}>
              {segs.map((s, j) => (
                <span key={j} className={syntaxClass(s.cls)}>
                  {s.text}
                </span>
              ))}
              {showCursor && i === cursorLine && <span className="bt-cursor" />}
            </div>
          ))}

          {phase >= 3 && (
            <>
              <div style={{ height: '1em' }} />
              <div className={syntaxClass('c-co')}># → response</div>
              <div>
                <span className={syntaxClass('c-pn')}>{'{'}</span>
              </div>
              <div>
                {'  '}
                <span className={syntaxClass('c-at')}>&quot;id&quot;</span>:{' '}
                <span className={syntaxClass('c-st')}>
                  &quot;msg_01h7···q2f&quot;
                </span>
                ,
              </div>
              <div>
                {'  '}
                <span className={syntaxClass('c-at')}>&quot;status&quot;</span>:{' '}
                <span className={syntaxClass('c-st')}>
                  &quot;
                  {phase === 3 ? 'queued' : phase === 4 ? 'sending' : 'delivered'}
                  &quot;
                </span>
                ,
              </div>
              <div>
                {'  '}
                <span className={syntaxClass('c-at')}>&quot;to&quot;</span>:{' '}
                <span className={syntaxClass('c-st')}>
                  &quot;+972501234567&quot;
                </span>
              </div>
              <div>
                <span className={syntaxClass('c-pn')}>{'}'}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* MIDDLE — Flow indicator */}
      <div
        className="relative flex flex-col items-center justify-center"
        aria-hidden
      >
        <div
          style={{
            position: 'absolute',
            inset: '40px 50% 40px 50%',
            width: 2,
            background:
              'linear-gradient(180deg, var(--d-border), var(--bt-blue), var(--d-border))',
            transform: 'translateX(-50%)',
          }}
        />
        {/* Packet dot */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            top: packetTop,
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: 'var(--bt-blue-glow)',
            boxShadow: '0 0 16px var(--bt-blue-glow), 0 0 32px var(--bt-blue-glow)',
            opacity: packetOpacity,
            transition:
              'top .8s cubic-bezier(.4,0,.2,1), opacity .3s ease-out',
          }}
        />
        {/* Center chip */}
        <div
          className="font-semibold"
          style={{
            position: 'relative',
            zIndex: 1,
            background: 'var(--d-bg-2)',
            border: '1px solid var(--d-border-2)',
            borderRadius: 9999,
            padding: '6px 12px',
            fontSize: 11,
            color: 'var(--d-ink-3)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          api
        </div>
      </div>

      {/* RIGHT — WhatsApp mock */}
      <div
        className="flex flex-col overflow-hidden"
        style={{
          background: 'var(--wa-bg)',
          border: '1px solid var(--d-border)',
          borderRadius: 14,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-[10px]"
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--wa-border)',
            background: 'var(--wa-panel)',
          }}
        >
          <div
            className="flex items-center justify-center text-white font-semibold"
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'linear-gradient(135deg,#34D399,#059669)',
              fontSize: 13,
            }}
          >
            R
          </div>
          <div>
            <div
              className="font-medium"
              style={{ fontSize: 14, color: 'var(--wa-ink)' }}
            >
              Rachel K.
            </div>
            <div style={{ fontSize: 11, color: 'var(--wa-ink-2)' }}>
              +972 50-123-4567
            </div>
          </div>
          <div className="ml-auto">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--wa-ink-2)"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          </div>
        </div>

        {/* Conversation */}
        <div
          className="flex flex-1 flex-col gap-2"
          style={{
            padding: '16px 14px',
            backgroundImage:
              'radial-gradient(circle at 20% 30%, rgba(255,255,255,.02), transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,.02), transparent 40%)',
          }}
        >
          <WaBubble side="in">
            Hey! when will my order arrive?
            <WaMeta>2:13 PM</WaMeta>
          </WaBubble>
          {phase >= 4 && (
            <WaBubble
              side="out"
              style={{
                animation: 'bt-slideUp 0.4s cubic-bezier(.4,0,.2,1)',
              }}
            >
              Your order is on the way 🎉
              <WaMeta>
                {phase === 4 ? '2:14 PM · ⏱ sending' : '2:14 PM'}
                {phase === 5 && (
                  <svg
                    width="14"
                    height="10"
                    viewBox="0 0 16 11"
                    fill="none"
                    style={{ marginLeft: 2 }}
                    aria-hidden
                  >
                    <path
                      d="M1 5 L4.5 8.5 L11 2"
                      stroke="#53BDEB"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M6 5 L9.5 8.5 L16 2"
                      stroke="#53BDEB"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </WaMeta>
            </WaBubble>
          )}
        </div>

        {/* Composer */}
        <div
          className="flex items-center gap-[10px]"
          style={{
            padding: '10px 14px',
            borderTop: '1px solid var(--wa-border)',
            background: 'var(--wa-panel)',
          }}
        >
          <div
            className="flex flex-1 items-center"
            style={{
              height: 32,
              background: 'var(--wa-bg)',
              borderRadius: 16,
              padding: '0 14px',
              fontSize: 13,
              color: 'var(--wa-ink-2)',
            }}
          >
            Type a message
          </div>
          <div
            className="flex items-center justify-center"
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'var(--wa-out)',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="white"
              aria-hidden
            >
              <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrafficDot({ color }: { color: string }) {
  return (
    <div
      style={{
        width: 11,
        height: 11,
        borderRadius: '50%',
        background: color,
      }}
    />
  );
}

function WaBubble({
  side,
  children,
  style,
}: {
  side: 'in' | 'out';
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const common = {
    padding: '7px 10px 6px',
    borderRadius: 8,
    fontSize: 13,
    maxWidth: '80%',
    color: 'var(--wa-ink)',
    ...style,
  } satisfies React.CSSProperties;
  if (side === 'in') {
    return <div style={{ ...common, background: 'var(--wa-in)' }}>{children}</div>;
  }
  return (
    <div
      style={{
        ...common,
        background: 'var(--wa-out)',
        marginLeft: 'auto',
      }}
    >
      {children}
    </div>
  );
}

function WaMeta({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-end gap-1"
      style={{
        fontSize: 10,
        color: 'var(--wa-ink-2)',
        marginTop: 2,
      }}
    >
      {children}
    </div>
  );
}
