export default function About() {
  return (
    <section className="px-6 md:px-12 lg:px-24 max-w-5xl mx-auto w-full py-20">
      <h2 className="text-sm font-mono text-accent tracking-wide mb-6 uppercase">
        About
      </h2>
      <div className="max-w-2xl space-y-4 text-muted leading-relaxed">
        <p>
          I specialize in quality engineering for consumer hardware products
          that ship to millions of users. My work spans test automation
          framework development, firmware-level hardware validation, and
          AI/ML model quality assurance.
        </p>
        <p>
          At Meta, I built a cross-device E2E automation framework covering
          7 wearable device families and created internal QA tooling adopted
          across multiple teams. Before that, I validated computer vision
          models at Tesla and ML-based safety classifiers at Google.
        </p>
        <p>
          I care about building systems that catch real problems at scale,
          not just filing bugs.
        </p>
      </div>
    </section>
  );
}
