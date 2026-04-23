import Link from 'next/link';
import { HeroDemo } from '@/components/hero-demo';

export default function HomePage() {
  return (
    <main
      style={{
        background: 'var(--d-bg)',
        color: 'var(--d-ink)',
      }}
    >
      {/* ─── Hero ─────────────────────────────────────────────────── */}
      <section
        className="relative"
        style={{ padding: '56px 0 64px' }}
      >
        <div
          aria-hidden
          className="bt-bg-grid pointer-events-none absolute inset-0"
          style={{ opacity: 0.5 }}
        />
        <div
          className="relative mx-auto"
          style={{ width: 'min(1280px, 100% - 48px)', maxWidth: 1200 }}
        >
          <div
            className="grid items-center"
            style={{
              gridTemplateColumns: '0.85fr 1.15fr',
              gap: 48,
              marginBottom: 40,
            }}
          >
            {/* Copy */}
            <div>
              <span
                className="inline-flex items-center gap-2"
                style={{
                  padding: '5px 11px',
                  borderRadius: 9999,
                  background: 'rgba(29,143,247,.1)',
                  border: '1px solid rgba(29,143,247,.25)',
                  color: 'var(--bt-blue-glow)',
                  fontSize: 12,
                  fontWeight: 500,
                  marginBottom: 20,
                }}
              >
                <span className="bt-live-dot" />
                Live · api.blueticks.co · 99.98% uptime
              </span>
              <h1
                style={{
                  fontSize: 'clamp(44px, 5vw, 64px)',
                  fontWeight: 650,
                  lineHeight: 1.02,
                  letterSpacing: '-0.034em',
                  textWrap: 'balance',
                  marginBottom: 18,
                  color: 'var(--d-ink)',
                }}
              >
                Code in.
                <br />
                <span style={{ color: 'var(--bt-green)' }}>
                  WhatsApp out.
                </span>
              </h1>
              <p
                style={{
                  fontSize: 18,
                  lineHeight: 1.55,
                  marginBottom: 24,
                  maxWidth: 520,
                  color: 'var(--d-ink-3)',
                }}
              >
                The only WhatsApp API with first-class scheduling, campaigns,
                an AI agent, and a native MCP server. Six years in production.
                EU & US regions.
              </p>
              <div className="flex flex-wrap" style={{ gap: 10 }}>
                <Link href="/docs/authentication" className="bt-btn bt-btn-accent">
                  Get an API key →
                </Link>
                <Link href="/docs/quickstart" className="bt-btn bt-btn-ghost">
                  Read quickstart
                </Link>
              </div>
              <div
                className="flex flex-wrap"
                style={{
                  marginTop: 28,
                  gap: 20,
                  fontSize: 13,
                  color: 'var(--d-ink-4)',
                }}
              >
                <span>⌁ 6M+ msgs/mo</span>
                <span>· 12 SDKs</span>
                <span>· p50 118ms</span>
                <span>· $9 to start</span>
              </div>
            </div>

            {/* Animated demo */}
            <div style={{ position: 'relative' }}>
              <HeroDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Pick your door ───────────────────────────────────────── */}
      <section
        style={{
          padding: '40px 0 80px',
          borderTop: '1px solid var(--d-border)',
        }}
      >
        <div className="mx-auto" style={{ width: 'min(1280px, 100% - 48px)' }}>
          <div
            className="flex items-end justify-between"
            style={{ gap: 24, marginBottom: 24 }}
          >
            <div>
              <Eyebrow>Pick your door</Eyebrow>
              <h2
                style={{
                  fontSize: 'clamp(28px, 3vw, 40px)',
                  fontWeight: 650,
                  lineHeight: 1.08,
                  letterSpacing: '-0.024em',
                  marginTop: 10,
                  color: 'var(--d-ink)',
                }}
              >
                Four ways in. Same API underneath.
              </h2>
            </div>
          </div>
          <div
            className="grid"
            style={{
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 14,
            }}
          >
            <PathCard
              num="01"
              quote="I just want to send one message"
              desc="60-second cURL you paste in a terminal."
              cta="Quickstart"
              href="/docs/quickstart"
              accent="#1D8FF7"
            />
            <PathCard
              num="02"
              quote="I'm building a product on top"
              desc="SDKs, webhooks, idempotency, retries."
              cta="Production guide"
              href="/docs/errors"
              accent="#A78BFA"
            />
            <PathCard
              num="03"
              quote="I run marketing campaigns"
              desc="Broadcasts with variables + throttling."
              cta="Campaigns"
              href="/docs/api"
              accent="#FF3E8A"
            />
            <PathCard
              num="04"
              quote="I want Claude to do it"
              desc="Install the MCP server in 30 seconds."
              cta="MCP setup"
              href="/docs"
              accent="#25D366"
            />
          </div>
        </div>
      </section>

      {/* ─── Endpoint map + Playground teaser ─────────────────────── */}
      <section style={{ padding: '0 0 80px' }}>
        <div className="mx-auto" style={{ width: 'min(1280px, 100% - 48px)' }}>
          <div
            className="grid"
            style={{ gridTemplateColumns: '1fr 1.4fr', gap: 20 }}
          >
            {/* Endpoint map */}
            <div
              className="rounded-[14px] border"
              style={{
                background: 'var(--d-bg-1)',
                borderColor: 'var(--d-border)',
                padding: '24px 22px',
              }}
            >
              <Eyebrow>Endpoint map</Eyebrow>
              <h3
                style={{
                  marginTop: 12,
                  marginBottom: 18,
                  fontSize: 20,
                  fontWeight: 650,
                  letterSpacing: '-0.024em',
                  color: 'var(--d-ink)',
                }}
              >
                Every endpoint, in one list.
              </h3>
              <div className="flex flex-col" style={{ gap: 2 }}>
                {[
                  ['POST', '/v1/messages', 'Send a message'],
                  ['POST', '/v1/messages/schedule', 'Schedule'],
                  ['GET', '/v1/messages/:id', 'Get status'],
                  ['POST', '/v1/campaigns', 'Start a campaign'],
                  ['GET', '/v1/campaigns/:id', 'Campaign details'],
                  ['POST', '/v1/agents', 'Create AI agent'],
                  ['POST', '/v1/webhooks', 'Register webhook'],
                ].map(([verb, path, label]) => (
                  <Link
                    key={path}
                    href="/docs/api"
                    className="bt-endpoint-row grid items-center"
                    style={{
                      gridTemplateColumns: '52px 1fr auto',
                      gap: 10,
                      padding: '7px 8px',
                      borderRadius: 6,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12.5,
                    }}
                  >
                    <span
                      style={{
                        color: verb === 'POST' ? '#FDBA74' : '#7DD3FC',
                        fontWeight: 600,
                      }}
                    >
                      {verb}
                    </span>
                    <span style={{ color: 'var(--d-ink-2)' }}>{path}</span>
                    <span
                      style={{
                        color: 'var(--d-ink-5)',
                        fontFamily: 'var(--font-sans)',
                        fontSize: 12,
                      }}
                    >
                      {label}
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Playground teaser */}
            <div
              className="rounded-[14px] border"
              style={{
                padding: '24px 22px',
                background:
                  'linear-gradient(135deg, rgba(15,95,209,.1), rgba(29,143,247,.03))',
                borderColor: 'rgba(29,143,247,.22)',
              }}
            >
              <div className="flex" style={{ gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <Eyebrow style={{ color: 'var(--bt-blue-glow)' }}>
                    Try it live
                  </Eyebrow>
                  <h3
                    style={{
                      marginTop: 12,
                      marginBottom: 12,
                      fontSize: 22,
                      fontWeight: 650,
                      letterSpacing: '-0.024em',
                      color: 'var(--d-ink)',
                    }}
                  >
                    Playground — no signup.
                  </h3>
                  <p
                    style={{
                      fontSize: 14,
                      lineHeight: 1.55,
                      marginBottom: 18,
                      maxWidth: 360,
                      color: 'var(--d-ink-3)',
                    }}
                  >
                    Paste any request. Send it against our sandbox number.
                    See the response, see the message. No card. No email.
                  </p>
                  <Link
                    href="/docs/api"
                    className="bt-btn bt-btn-accent"
                    style={{
                      padding: '7px 12px',
                      fontSize: 13,
                      borderRadius: 8,
                    }}
                  >
                    Open playground →
                  </Link>
                </div>
                <div
                  className="font-mono"
                  style={{
                    width: 200,
                    flexShrink: 0,
                    background: 'var(--d-bg-1)',
                    border: '1px solid var(--d-border)',
                    borderRadius: 10,
                    padding: '12px 14px',
                    fontSize: 11,
                    color: 'var(--d-ink-3)',
                  }}
                >
                  <div style={{ color: '#FDBA74' }}>POST /v1/messages</div>
                  <div style={{ marginTop: 8, color: 'var(--d-ink-5)' }}>
                    {'{'}
                  </div>
                  <div>
                    {'  '}
                    <span style={{ color: '#C4B5FD' }}>&quot;to&quot;</span>:{' '}
                    <span style={{ color: '#BEF264' }}>&quot;+···&quot;</span>
                  </div>
                  <div>
                    {'  '}
                    <span style={{ color: '#C4B5FD' }}>&quot;text&quot;</span>:{' '}
                    <span style={{ color: '#BEF264' }}>&quot;gm&quot;</span>
                  </div>
                  <div style={{ color: 'var(--d-ink-5)' }}>{'}'}</div>
                  <div
                    style={{
                      marginTop: 10,
                      paddingTop: 10,
                      borderTop: '1px solid var(--d-border)',
                      color: '#25D366',
                    }}
                  >
                    → 200 · 118ms
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Eyebrow({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className="inline-flex items-center"
      style={{
        gap: 10,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--d-ink-3)',
        ...style,
      }}
    >
      <span
        style={{
          width: 20,
          height: 1,
          background: 'currentColor',
          opacity: 0.4,
          display: 'inline-block',
        }}
      />
      {children}
    </span>
  );
}

function PathCard({
  num,
  quote,
  desc,
  cta,
  href,
  accent,
}: {
  num: string;
  quote: string;
  desc: string;
  cta: string;
  href: string;
  accent: string;
}) {
  return (
    <Link
      href={href}
      className="bt-path-card group relative flex flex-col overflow-hidden rounded-[14px] border"
      style={{
        background: 'var(--d-bg-1)',
        borderColor: 'var(--d-border)',
        padding: '26px 22px',
        gap: 14,
        minHeight: 200,
      }}
    >
      {/* Decorative glow */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -20,
          right: -20,
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${accent}28, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />
      {/* Number badge */}
      <div
        className="flex items-center justify-center"
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: `${accent}22`,
          color: accent,
          fontSize: 15,
          fontWeight: 700,
        }}
      >
        {num}
      </div>
      {/* Quote */}
      <div
        style={{
          fontSize: 15.5,
          fontWeight: 550,
          color: 'var(--d-ink)',
          lineHeight: 1.35,
          textWrap: 'balance',
        }}
      >
        &quot;{quote}&quot;
      </div>
      {/* Description */}
      <p
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: 'var(--d-ink-3)',
          margin: 0,
        }}
      >
        {desc}
      </p>
      {/* CTA */}
      <div
        style={{
          marginTop: 'auto',
          fontSize: 13,
          fontWeight: 500,
          color: accent,
        }}
      >
        {cta} →
      </div>
    </Link>
  );
}
