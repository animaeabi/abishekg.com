import { FileDown } from "lucide-react";

export default function ResumeDownload() {
  return (
    <section className="px-6 md:px-12 lg:px-24 max-w-5xl mx-auto w-full py-20">
      <div className="border border-card-border rounded-lg p-8 md:p-12 bg-card text-center">
        <h2 className="text-xl md:text-2xl font-semibold mb-3">
          Want the full picture?
        </h2>
        <p className="text-muted text-sm mb-6 max-w-md mx-auto">
          Download my resume for the complete breakdown of experience,
          technical skills, and education.
        </p>
        <a
          href="/resume.pdf"
          download="Abishek_Gopal_Resume.pdf"
          className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-white px-6 py-3 rounded-lg text-sm font-medium transition-colors"
        >
          <FileDown size={18} />
          Download Resume (PDF)
        </a>
      </div>
    </section>
  );
}
