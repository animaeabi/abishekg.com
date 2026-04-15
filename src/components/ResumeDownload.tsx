import { FileDown } from "lucide-react";

export default function ResumeDownload() {
  return (
    <section className="px-6 md:px-12 lg:px-24 max-w-5xl mx-auto w-full py-16 border-t border-card-border">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold mb-1">Want the full picture?</h2>
          <p className="text-muted text-sm">
            Download my resume for the complete breakdown.
          </p>
        </div>
        <a
          href="/resume.pdf"
          download="Abishek_Gopal_Resume.pdf"
          className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shrink-0"
        >
          <FileDown size={16} />
          Download Resume
        </a>
      </div>
    </section>
  );
}
