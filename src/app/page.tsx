import Hero from "@/components/Hero";
import About from "@/components/About";
import Projects from "@/components/Projects";
import ProductsShipped from "@/components/ProductsShipped";
import Skills from "@/components/Skills";
import ResumeDownload from "@/components/ResumeDownload";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main className="flex-1">
      <Hero />
      <About />
      <Projects />
      <ProductsShipped />
      <Skills />
      <ResumeDownload />
      <Footer />
    </main>
  );
}
