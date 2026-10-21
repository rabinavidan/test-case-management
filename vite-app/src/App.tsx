import { useGSAP } from '@gsap/react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useRef } from 'react'
import BlurText from '@/components/BlurText'

gsap.registerPlugin(useGSAP, ScrollTrigger)

const panels = [
  { title: 'Plan', body: 'Shape test cases before a line of code ships.', hue: 'from-sky-500 to-indigo-600' },
  { title: 'Run', body: 'Execute suites and watch results stream in.', hue: 'from-fuchsia-500 to-rose-600' },
  { title: 'Learn', body: 'Spot flaky tests and regressions early.', hue: 'from-amber-400 to-orange-600' },
  { title: 'Ship', body: 'Release with evidence, not hope.', hue: 'from-emerald-400 to-teal-600' },
]

const features = ['Smooth scroll by Lenis', 'Timelines by GSAP', 'Text reveals by React Bits', 'Styled with Tailwind v4']

export default function App() {
  const root = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      // Reading-progress bar tied to the whole page.
      gsap.to('.progress', {
        scaleX: 1,
        ease: 'none',
        scrollTrigger: { start: 0, end: 'max', scrub: true },
      })

      // Hero orbs drift apart as you scroll away.
      gsap.to('.orb-a', { yPercent: -60, xPercent: -20, scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } })
      gsap.to('.orb-b', { yPercent: 50, xPercent: 30, scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } })

      // Pinned horizontal scroll through the panels.
      const track = root.current!.querySelector<HTMLElement>('.track')!
      gsap.to(track, {
        x: () => -(track.scrollWidth - window.innerWidth),
        ease: 'none',
        scrollTrigger: {
          trigger: '.horizontal',
          pin: true,
          scrub: 1,
          end: () => `+=${track.scrollWidth - window.innerWidth}`,
          invalidateOnRefresh: true,
        },
      })

      // Staggered feature list reveal.
      gsap.from('.feature', {
        y: 60,
        opacity: 0,
        stagger: 0.12,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: { trigger: '.features', start: 'top 75%' },
      })
    },
    { scope: root },
  )

  return (
    <div ref={root} className="bg-neutral-950 text-neutral-100 antialiased">
      <div className="progress fixed inset-x-0 top-0 z-50 h-1 origin-left scale-x-0 bg-gradient-to-r from-sky-400 to-fuchsia-500" />

      <section className="hero relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center">
        <div className="orb-a pointer-events-none absolute -left-24 top-1/4 size-96 rounded-full bg-sky-500/30 blur-3xl" />
        <div className="orb-b pointer-events-none absolute -right-24 bottom-1/4 size-96 rounded-full bg-fuchsia-500/30 blur-3xl" />
        <BlurText
          text="Motion, made smooth."
          trigger="load"
          delay={120}
          animateBy="words"
          direction="top"
          className="relative justify-center text-5xl font-bold tracking-tight sm:text-7xl"
        />
        <BlurText
          text="Vite · React · Tailwind · GSAP · Lenis"
          trigger="load"
          delay={40}
          animateBy="letters"
          effect="focus"
          className="relative mt-6 justify-center text-lg text-neutral-400"
        />
        <p className="absolute bottom-10 animate-bounce text-sm text-neutral-500">Scroll ↓</p>
      </section>

      <section className="horizontal h-screen overflow-hidden">
        <div className="track flex h-full w-max items-center gap-8 px-[10vw]">
          {panels.map((p) => (
            <article
              key={p.title}
              className={`flex h-[60vh] w-[70vw] max-w-xl shrink-0 flex-col justify-end rounded-3xl bg-gradient-to-br ${p.hue} p-10 shadow-2xl`}
            >
              <h2 className="text-4xl font-bold">{p.title}</h2>
              <p className="mt-3 text-lg text-white/80">{p.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="features mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 px-6 py-24">
        <BlurText
          text="Everything here is wired together."
          effect="drift"
          direction="left"
          className="mb-8 text-3xl font-semibold sm:text-4xl"
        />
        {features.map((f) => (
          <div key={f} className="feature rounded-2xl border border-white/10 bg-white/5 px-6 py-5 text-xl">
            {f}
          </div>
        ))}
      </section>

      <footer className="flex h-[50vh] items-center justify-center">
        <BlurText text="Fin." effect="zoom" className="text-6xl font-bold" />
      </footer>
    </div>
  )
}
