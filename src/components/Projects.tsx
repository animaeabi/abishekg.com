const projects = [
  {
    title: "Cross-device Layered Automation for Wearables",
    role: "Meta | Senior QA Engineer",
    description:
      "TypeScript-based E2E test framework covering 7 wearable device families with Android/iOS companion app pairing. Includes automated code generation pipeline, multi-layer hardware abstraction with TDB/ADB fallback, and runtime topology guards for cross-device scripts.",
    metrics: [
      "94% automated test coverage",
      "738 test scripts generated",
      "158 runtime failures resolved",
      "72% flakiness reduction",
    ],
    tech: ["TypeScript", "ADB", "TestRail", "Prompt Engineering"],
  },
  {
    title: "TestRail Hygiene Manager",
    role: "Meta | Internal Tool",
    description:
      "Full-stack application that scores test case quality using an 11-rule engine across completeness, clarity, and maintenance categories. Supports bulk auto-fix, per-case remediation, and real-time score recalculation.",
    metrics: [
      "11-rule scoring engine",
      "Adopted by 3 QA teams",
      "61% to 89% completeness improvement",
    ],
    tech: ["Next.js", "TypeScript", "Tailwind CSS"],
  },
  {
    title: "Device Orchestration Tooling",
    role: "Emerge.io | QA Lead",
    description:
      "Python-based tool automating parallel log capture and regression setup across multiple XR devices simultaneously (Quest, Vision Pro). Replaced manual device-by-device workflows.",
    metrics: [
      "83% setup time reduction",
      "2 hours to 20 minutes",
      "8 firmware releases supported",
    ],
    tech: ["Python", "ADB", "Device Pairing", "Log Automation"],
  },
];

export default function Projects() {
  return (
    <section
      id="projects"
      className="px-6 md:px-12 lg:px-24 max-w-5xl mx-auto w-full py-16 border-t border-card-border"
    >
      <h2 className="text-sm font-mono text-accent tracking-wide mb-8 uppercase">
        Featured Projects
      </h2>
      <div className="space-y-6">
        {projects.map((project) => (
          <div
            key={project.title}
            className="border border-card-border rounded-lg p-6 bg-card hover:border-accent/30 transition-colors"
          >
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-1 mb-3">
              <h3 className="text-base md:text-lg font-semibold">
                {project.title}
              </h3>
              <span className="text-xs text-muted font-mono shrink-0">
                {project.role}
              </span>
            </div>
            <p className="text-muted text-sm leading-relaxed mb-4">
              {project.description}
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              {project.metrics.map((metric) => (
                <span
                  key={metric}
                  className="text-xs font-mono bg-accent/10 text-accent px-2.5 py-1 rounded"
                >
                  {metric}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {project.tech.map((t) => (
                <span
                  key={t}
                  className="text-xs text-muted border border-card-border px-2.5 py-1 rounded"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
