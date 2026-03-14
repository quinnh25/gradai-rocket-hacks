import Navbar from "./components/navbar";
import Hero from "./components/hero";
import Marquee from "./components/marquee";
import Features from "./components/features";
import HowItWorks from "./components/how-it-works";
import CTA from "./components/cta";
import Footer from "./components/footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <Hero />
      <Marquee />
      <Features />
      <HowItWorks />
      <CTA />
      <Footer />
    </main>
  );
}
