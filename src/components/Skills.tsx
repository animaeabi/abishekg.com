const skillGroups = [
  {
    label: "Testing",
    items: [
      "E2E System Testing",
      "Test Automation Framework Design",
      "Performance / Memory / Stress",
      "AI/ML Model Validation",
    ],
  },
  {
    label: "Languages",
    items: ["TypeScript", "Python", "Shell / Bash"],
  },
  {
    label: "Frameworks & Tools",
    items: [
      "Next.js",
      "Tailwind CSS",
      "Node.js",
      "JIRA",
      "TestRail",
      "Jenkins",
      "ADB",
      "Android SDK",
      "Postman",
      "Xcode",
      "Git",
    ],
  },
  {
    label: "Hardware",
    items: [
      "Ray-Ban Meta",
      "Meta Quest",
      "Apple Vision Pro",
      "Android / iOS Devices",
      "Smart Wearables",
    ],
  },
  {
    label: "Domains",
    items: [
      "Wearable OS (Nucleus)",
      "Bluetooth Audio (A2DP / HFP / LE Audio)",
      "XR Haptics",
      "Computer Vision",
    ],
  },
  {
    label: "Leadership",
    items: [
      "QA Strategy",
      "Release Quality Gates",
      "Team Hiring & Mentoring",
      "Cross-functional Stakeholder Management",
    ],
  },
];

export default function Skills() {
  return (
    <section className="px-6 md:px-12 lg:px-24 max-w-5xl mx-auto w-full py-20">
      <h2 className="text-sm font-mono text-accent tracking-wide mb-10 uppercase">
        Skills & Domains
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {skillGroups.map((group) => (
          <div key={group.label}>
            <h3 className="text-xs font-mono text-muted uppercase tracking-wider mb-3">
              {group.label}
            </h3>
            <div className="flex flex-wrap gap-2">
              {group.items.map((item) => (
                <span
                  key={item}
                  className="text-xs border border-card-border bg-card px-2.5 py-1.5 rounded text-foreground/80"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
