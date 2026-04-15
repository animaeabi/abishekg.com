import { Mail, Phone, ExternalLink, ArrowDown } from "lucide-react";

export default function Hero() {
  return (
    <section className="min-h-[85vh] flex flex-col justify-center px-6 md:px-12 lg:px-24 max-w-5xl mx-auto w-full">
      <p className="text-accent font-mono text-sm mb-4 tracking-wide">
        Senior QA Engineer
      </p>
      <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4">
        Abishek Gopal
      </h1>
      <p className="text-muted text-lg md:text-xl max-w-2xl leading-relaxed mb-8">
        7+ years building test automation frameworks and validating consumer
        hardware at Meta, Tesla, and Google. Currently shipping wearable
        device quality at scale.
      </p>

      <div className="flex flex-wrap gap-4 text-sm text-muted mb-12">
        <a
          href="mailto:me@abishekg.com"
          className="flex items-center gap-2 hover:text-foreground transition-colors"
        >
          <Mail size={16} />
          me@abishekg.com
        </a>
        <a
          href="tel:+14154819889"
          className="flex items-center gap-2 hover:text-foreground transition-colors"
        >
          <Phone size={16} />
          415.481.9889
        </a>
        <a
          href="https://linkedin.com/in/abishekg"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 hover:text-foreground transition-colors"
        >
          <ExternalLink size={16} />
          LinkedIn
        </a>
      </div>

      <a
        href="#projects"
        className="text-muted hover:text-foreground transition-colors flex items-center gap-2 text-sm"
      >
        <ArrowDown size={16} />
        See my work
      </a>
    </section>
  );
}
